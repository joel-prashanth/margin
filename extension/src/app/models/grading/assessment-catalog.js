import { mapWithConcurrency } from "../../core/async.js";
import {
  getAssessmentDetails,
  getFacultyClasses,
  getFacultySubmissions,
  isTerm1,
} from "../../services/erp-api.js";

// =====================================================
// ASSESSMENT CATALOG
// Shared discovery for the PDF-based grading modules
// (Lab, Essay, Project): group faculty submissions by
// assessment, enrich with cached ERP metadata, filter by
// term and group into classes.
// =====================================================

export const METADATA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const DISCOVERY_CACHE_TTL = 15 * 60 * 1000; // 15 mins

const METADATA_CONCURRENCY = 6;

/**
 * Per-module mutable state.
 */
export function createGradingState() {
  return {
    submissions: [],
    selected: null,
    aiResult: null,
    assessments: [],
    rawAssessments: [],
    timetableClasses: [],
    classes: [],
    discovered: false,
    discoveryRunning: false,
    initialized: false,
    savingIds: new Set(),
  };
}

export function textOf(item) {
  return {
    title: (item?.title || "").toLowerCase(),
    type: (item?.type || "").toLowerCase(),
    desc: (item?.description || "").toLowerCase(),
  };
}

function hasPdfAttachment(attachments) {
  return attachments.some(
    (url) => typeof url === "string" && url.toLowerCase().includes(".pdf"),
  );
}

export function groupSubmissionsByAssessment(rawSubmissions, { defaultMaxMarks }) {
  const groups = new Map();

  for (const sub of rawSubmissions) {
    const assessmentId = sub?.assessmentId || sub?.assessment?.id;
    if (!assessmentId) continue;

    if (!groups.has(assessmentId)) {
      groups.set(assessmentId, {
        assessmentId,
        title: sub?.assessment?.title || "",
        type: sub?.assessment?.type || "",
        description: sub?.assessment?.description || "",
        maxMarks: sub?.assessment?.maxMarks || defaultMaxMarks,
        total: 0,
        pending: 0,
        evaluated: 0,
        hasPdf: false,
        sectionId: sub?.assessment?.sectionId || sub?.sectionId || "",
        sectionCode: sub?.assessment?.sectionCode || sub?.sectionCode || "",
        subjectCode: sub?.assessment?.subjectCode || sub?.subjectCode || "",
        subjectName: sub?.assessment?.subjectName || sub?.subjectName || "",
        sourceWeekNumber: sub?.assessment?.sourceWeekNumber || null,
        latestSubmittedAt: 0,
      });
    }

    const g = groups.get(assessmentId);
    g.total += 1;
    if (sub.status === "SUBMITTED") g.pending += 1;
    if (sub.status === "EVALUATED") g.evaluated += 1;

    const attachments = sub.attachments || (sub.attachmentUrl ? [sub.attachmentUrl] : []);
    if (hasPdfAttachment(attachments)) {
      g.hasPdf = true;
    }

    const submittedTime = sub.submittedAt ? new Date(sub.submittedAt).getTime() : 0;
    if (Number.isFinite(submittedTime) && submittedTime > g.latestSubmittedAt) {
      g.latestSubmittedAt = submittedTime;
    }
  }

  return Array.from(groups.values());
}

export function applyAssessmentMetadata(item, details, { defaultTitle, defaultMaxMarks }) {
  if (!item || !details) return;
  item.title = details.title || details.type || item.title || defaultTitle;
  item.type = details.type || item.type || "";
  item.description = details.description || item.description || "";
  item.maxMarks = Number(details.maxMarks || item.maxMarks || defaultMaxMarks);
  item.sourceWeekNumber = details.sourceWeekNumber ?? item.sourceWeekNumber ?? null;
  item.subjectCode = details.subject?.code || item.subjectCode || "";
  item.subjectName = details.subject?.name || item.subjectName || "";
  item.sectionCode = details.section?.code || item.sectionCode || "";
  item.sectionId = details.section?.id || item.sectionId || "";
  item.termName = details.term?.name || details.academicTerm?.name || item.termName || "";
  item.termId = details.term?.id || item.termId || "";
}

/**
 * Applies cached metadata, fetches the rest, and persists the
 * cache when anything new was fetched. `apply(item, details)`.
 */
export async function enrichWithMetadata(items, metadataCache, apply, logPrefix) {
  const missing = [];

  for (const item of items) {
    const cached = metadataCache.get(item.assessmentId);
    if (cached) {
      apply(item, cached);
    } else {
      missing.push(item);
    }
  }

  if (missing.length === 0) {
    return;
  }

  let cacheChanged = false;

  await mapWithConcurrency(missing, METADATA_CONCURRENCY, async (item) => {
    try {
      const details = await getAssessmentDetails(item.assessmentId);
      if (details) {
        apply(item, details);
        metadataCache.set(item.assessmentId, details);
        cacheChanged = true;
      }
    } catch (err) {
      console.warn(`[${logPrefix}] Metadata fetch failed for assessment ${item.assessmentId}`, err);
    }
  });

  if (cacheChanged) {
    await metadataCache.save();
  }
}

/**
 * Fetches faculty submissions + timetable classes, groups and
 * enriches them. Neither fetch failing aborts discovery.
 */
export async function discoverAssessments({ metadataCache, defaultTitle, defaultMaxMarks, logPrefix }) {
  await metadataCache.load();

  const [rawSubmissions, timetableClasses] = await Promise.all([
    getFacultySubmissions().catch((err) => {
      console.warn(`[${logPrefix}] Could not fetch faculty submissions:`, err);
      return [];
    }),
    getFacultyClasses().catch((err) => {
      console.warn(`[${logPrefix}] Could not fetch timetable classes:`, err);
      return [];
    }),
  ]);

  const assessments = groupSubmissionsByAssessment(rawSubmissions, { defaultMaxMarks });

  await enrichWithMetadata(
    assessments,
    metadataCache,
    (item, details) => applyAssessmentMetadata(item, details, { defaultTitle, defaultMaxMarks }),
    logPrefix,
  );

  return { assessments, timetableClasses: timetableClasses || [] };
}

/**
 * termFilter: "TERM2" (default) | "TERM1" | anything else = all.
 */
export function filterByTerm(items, termFilter) {
  if (termFilter === "TERM2") return items.filter((a) => !isTerm1(a));
  if (termFilter === "TERM1") return items.filter((a) => isTerm1(a));
  return [...items];
}

function classLabel(sectionCode, subjectName, subjectCode) {
  return `${sectionCode} — ${subjectName} (${subjectCode || "N/A"})`;
}

/**
 * Groups assessments into "subject|section" classes. Timetable
 * classes (already term-filtered by the caller) seed the list so
 * classes without submissions still appear.
 */
export function buildClassGroups(assessments, timetableClasses = []) {
  const classMap = new Map();

  for (const tc of timetableClasses) {
    const key = `${tc.subjectCode || "SUBJ"}|${tc.sectionId || tc.sectionCode}`;
    if (!classMap.has(key)) {
      classMap.set(key, {
        key,
        sectionId: tc.sectionId,
        sectionCode: tc.sectionCode,
        courseOfferingId: tc.courseOfferingId,
        subjectCode: tc.subjectCode,
        subjectName: tc.subjectName || tc.subjectCode,
        label: classLabel(tc.sectionCode, tc.subjectName || tc.subjectCode, tc.subjectCode),
        assessments: [],
      });
    }
  }

  for (const a of assessments) {
    const key = `${a.subjectCode || "SUBJ"}|${a.sectionId || a.sectionCode || "SEC"}`;
    if (!classMap.has(key)) {
      classMap.set(key, {
        key,
        sectionId: a.sectionId,
        sectionCode: a.sectionCode || "Section",
        subjectCode: a.subjectCode,
        subjectName: a.subjectName || a.subjectCode || "Subject",
        label: classLabel(
          a.sectionCode || "Section",
          a.subjectName || a.subjectCode || "Subject",
          a.subjectCode,
        ),
        assessments: [],
      });
    }

    const cls = classMap.get(key);
    if (!cls.assessments.some((existing) => existing.assessmentId === a.assessmentId)) {
      cls.assessments.push(a);
    }
  }

  for (const cls of classMap.values()) {
    sortByRecency(cls.assessments);
  }

  return Array.from(classMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Newest week first, then most recent submission.
 */
export function sortByRecency(assessments) {
  return assessments.sort((first, second) => {
    const firstWeek = Number(first.sourceWeekNumber ?? 0);
    const secondWeek = Number(second.sourceWeekNumber ?? 0);
    if (firstWeek !== secondWeek) return secondWeek - firstWeek;
    return Number(second.latestSubmittedAt ?? 0) - Number(first.latestSubmittedAt ?? 0);
  });
}

export function sortByTitle(assessments) {
  return assessments.sort((a, b) =>
    (a.title || "").toLowerCase().localeCompare((b.title || "").toLowerCase()),
  );
}

/**
 * Normalizes a PDF submission (Lab / Essay shape).
 */
export function normalizePdfSubmission(s, { defaultMaxMarks }) {
  const student = s.student || {};
  const attachments = Array.isArray(s.attachments)
    ? s.attachments
    : s.attachmentUrl
      ? [s.attachmentUrl]
      : [];
  const pdfUrl =
    attachments.find((u) => typeof u === "string" && u.toLowerCase().includes(".pdf")) ||
    attachments[0] ||
    null;

  return {
    id: s.id,
    status: s.status || "SUBMITTED",
    submittedAt: s.submittedAt || s.createdAt || "",
    studentId: student.id || s.studentId,
    studentName: student.name || s.studentName || "Student",
    rollNumber: student.registrationNo || student.rollNo || s.registrationNo || "N/A",
    marks: s.marks ?? null,
    maxMarks: s.maxMarks ?? defaultMaxMarks,
    feedback: s.feedback ?? "",
    rubric: s.rubric ?? null,
    attachments,
    pdfUrl,
    raw: s,
  };
}

export function countByStatus(submissions) {
  return {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === "SUBMITTED").length,
    evaluated: submissions.filter((s) => s.status === "EVALUATED").length,
  };
}

export function filterByStatus(submissions, filter) {
  if (filter === "SUBMITTED") return submissions.filter((s) => s.status === "SUBMITTED");
  if (filter === "EVALUATED") return submissions.filter((s) => s.status === "EVALUATED");
  return submissions;
}

/**
 * Next SUBMITTED item after `currentId`, wrapping to the first one.
 */
export function findNextPending(submissions, currentId) {
  const currentIndex = submissions.findIndex((s) => s.id === currentId);

  return (
    submissions.find((s, idx) => idx > currentIndex && s.status === "SUBMITTED") ||
    submissions.find((s) => s.id !== currentId && s.status === "SUBMITTED")
  );
}

export function markEvaluated(submission, { marks, feedback, rubric }) {
  submission.status = "EVALUATED";
  submission.marks = marks;
  submission.feedback = feedback;
  submission.rubric = rubric;
}
