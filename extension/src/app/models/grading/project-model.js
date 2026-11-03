import { TimedEntryCache } from "../../core/storage.js";
import { getAssessmentSubmissions } from "../../services/erp-api.js";
import {
  METADATA_CACHE_TTL,
  createGradingState,
  filterByTerm,
  textOf,
} from "./assessment-catalog.js";
import { PROJECT_MAX_MARKS, PROJECT_MIN_MARKS, PROJECT_TOP_MARKS } from "./rubrics.js";

// =====================================================
// PROJECT REPORT MODEL
// =====================================================

export const PROJECT_DISCOVERY_CACHE_KEY = "projectAssessmentDiscoveryCacheV2";

export const projectState = createGradingState();

export const projectMetadataCache = new TimedEntryCache(
  "projectAssessmentMetadataCacheV2",
  METADATA_CACHE_TTL,
);

/**
 * Always offered in the class dropdown, even before discovery.
 */
export const TARGET_PROJECT_CLASSES = [
  {
    id: "BTECH(HONS.)CSEGAI-2A",
    name: "BTECH(HONS.)CSEGAI-2A",
    label: "BTECH(HONS.)CSEGAI-2A — GenAI 2A",
    patterns: ["gai-2a", "genai 2a", "genai-2a", "csegai-2a"],
    assessments: [],
  },
  {
    id: "BTECH(HONS.)CSEGAI-2C",
    name: "BTECH(HONS.)CSEGAI-2C",
    label: "BTECH(HONS.)CSEGAI-2C — GenAI 2C",
    patterns: ["gai-2c", "genai 2c", "genai-2c", "csegai-2c"],
    assessments: [],
  },
  {
    id: "BTECH(HONS.)CSEDS-2B",
    name: "BTECH(HONS.)CSEDS-2B",
    label: "BTECH(HONS.)CSEDS-2B — DS 2B",
    patterns: ["ds-2b", "cseds-2b", "ds 2b", "cseds 2b"],
    assessments: [],
  },
  {
    id: "BTECH(HONS.)CSEFSD-2B",
    name: "BTECH(HONS.)CSEFSD-2B",
    label: "BTECH(HONS.)CSEFSD-2B — FSD 2B",
    patterns: ["fsd-2b", "csefsd-2b", "fsd 2b", "csefsd 2b"],
    assessments: [],
  },
];

/**
 * Strictly Project Reports: excludes Essays, Journals and OEPs.
 */
export function isProjectReport(item) {
  if (!item) return false;
  const { title, type, desc } = textOf(item);

  if (
    title.includes("reflective essay") ||
    type.includes("reflective essay") ||
    title.includes("essay") ||
    type.includes("essay") ||
    title.includes("reflective journal") ||
    type.includes("reflective journal") ||
    title.includes("journal") ||
    title.includes("open ended") ||
    title.includes("open-ended") ||
    title.includes("oep")
  ) {
    return false;
  }

  return (
    title.includes("project report") ||
    title.includes("project") ||
    title.includes("capstone") ||
    title.includes("mini project") ||
    type.includes("project report") ||
    type.includes("project") ||
    desc.includes("project report") ||
    desc.includes("project")
  );
}

/**
 * Strict filter first; if nothing matches, fall back to any
 * non-essay/non-journal report-like assessment.
 */
export function selectProjectAssessments(assessmentList) {
  const strict = assessmentList.filter((a) => isProjectReport(a));

  if (strict.length > 0) {
    return strict;
  }

  return assessmentList.filter((a) => {
    const text = `${a.title || ""} ${a.type || ""} ${a.description || ""}`.toLowerCase();
    return (
      !text.includes("essay") &&
      !text.includes("journal") &&
      !text.includes("open ended") &&
      !text.includes("oep") &&
      (text.includes("project") || text.includes("report") || text.includes("capstone") || a.maxMarks === 100)
    );
  });
}

/**
 * Distributes assessments into the target classes by text
 * pattern; unmatched ones get a generic per-section class.
 */
export function rebuildProjectClasses(termFilter) {
  projectState.assessments = filterByTerm(projectState.rawAssessments, termFilter);

  const classes = TARGET_PROJECT_CLASSES.map((tc) => ({ ...tc, assessments: [] }));

  for (const a of projectState.assessments) {
    const aText = `${a.sectionCode || ""} ${a.sectionId || ""} ${a.title || ""} ${a.subjectName || ""} ${a.subjectCode || ""}`.toLowerCase();

    const target = classes.find((cls) => cls.patterns.some((p) => aText.includes(p)));

    if (target) {
      if (!target.assessments.some((existing) => existing.assessmentId === a.assessmentId)) {
        target.assessments.push(a);
      }
      continue;
    }

    const genericKey = a.sectionCode || a.sectionId || "OTHER";
    let genericCls = classes.find((c) => c.id === genericKey);
    if (!genericCls) {
      genericCls = {
        id: genericKey,
        name: a.sectionCode || "Other Class",
        label: `${a.sectionCode || "Class"} (${a.subjectName || a.subjectCode || "Project"})`,
        patterns: [],
        assessments: [],
      };
      classes.push(genericCls);
    }
    genericCls.assessments.push(a);
  }

  projectState.classes = classes;
}

function toUrlList(rawAttachments) {
  return rawAttachments
    .map((att) => (typeof att === "string" ? att : att?.url || att?.fileUrl || ""))
    .filter(Boolean);
}

export function normalizeProjectSubmission(s) {
  const student = s.student || {};
  const studentName =
    student.name ||
    [student.firstName, student.lastName].filter(Boolean).join(" ") ||
    s.studentName ||
    "Student";
  const rollNumber =
    student.registrationNo || student.rollNo || s.rollNumber || s.registrationNo || "N/A";

  const attachments = toUrlList(
    Array.isArray(s.attachments) ? s.attachments : s.attachmentUrl ? [s.attachmentUrl] : [],
  );

  const pdfUrl =
    attachments.find((u) => typeof u === "string" && u.toLowerCase().includes(".pdf")) ||
    attachments[0] ||
    s.pdfUrl ||
    null;

  return {
    id: s.id,
    assessmentId: s.assessmentId,
    status: s.status || "SUBMITTED",
    submittedAt: s.submittedAt || s.createdAt || "",
    studentId: student.id || s.studentId,
    studentName,
    rollNumber,
    marks: s.marks ?? s.evaluation?.marks ?? null,
    maxMarks: s.maxMarks ?? PROJECT_MAX_MARKS,
    evaluation:
      s.evaluation ||
      (s.marks !== null && s.marks !== undefined
        ? { marks: s.marks, maxMarks: s.maxMarks || 100, feedback: s.feedback || "" }
        : null),
    feedback: s.feedback ?? s.evaluation?.feedback ?? "",
    rubric: s.rubric ?? s.evaluation?.rubric ?? null,
    attachments,
    pdfUrl,
    raw: s,
  };
}

export function sortByRollNumber(submissions) {
  return submissions.sort((a, b) => {
    const rollA = String(a.rollNumber || a.studentName || "").toLowerCase();
    const rollB = String(b.rollNumber || b.studentName || "").toLowerCase();
    return rollA.localeCompare(rollB, undefined, { numeric: true });
  });
}

export function filterProjectSubmissions(submissions, filter) {
  return submissions.filter((s) => filter === "ALL" || s.status === filter);
}

export function projectMarksDisplay(sub) {
  if (sub.evaluation?.marks !== undefined && sub.evaluation?.marks !== null) {
    return `${sub.evaluation.marks} / ${sub.evaluation.maxMarks || PROJECT_MAX_MARKS}`;
  }
  if (sub.marks !== undefined && sub.marks !== null) {
    return `${sub.marks} / ${PROJECT_MAX_MARKS}`;
  }
  return "Not Evaluated";
}

export function findSubmissionPdfUrl(submission) {
  if (submission.pdfUrl) {
    return submission.pdfUrl;
  }
  if (submission.attachments?.length) {
    return (
      submission.attachments.find((u) => typeof u === "string" && u.includes(".pdf")) ||
      submission.attachments[0]
    );
  }
  return null;
}

/**
 * Presigned S3 URLs expire; re-fetch the submission from ERP and
 * return its current PDF URL (or null). Updates `submission.pdfUrl`.
 */
export async function refreshSubmissionPdfUrl(assessmentId, submission) {
  const freshSubmissions = await getAssessmentSubmissions(assessmentId, { force: true });

  const freshSub = freshSubmissions.find(
    (s) => s.id === submission.id || s.student?.registrationNo === submission.rollNumber,
  );

  if (!freshSub) {
    return null;
  }

  const freshAtts = Array.isArray(freshSub.attachments)
    ? freshSub.attachments
    : freshSub.attachmentUrl
      ? [freshSub.attachmentUrl]
      : [];

  const freshUrl = freshAtts.find((u) => typeof u === "string" && u.includes(".pdf")) || freshAtts[0];

  if (freshUrl) {
    submission.pdfUrl = freshUrl;
  }

  return freshUrl || null;
}

export async function fetchPdfBlob(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, blob: await res.blob() };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Sum of rubric scores clamped to the 80–95 band.
 */
export function clampProjectTotal(total) {
  return Math.min(PROJECT_TOP_MARKS, Math.max(PROJECT_MIN_MARKS, total));
}

export function nextPendingAfter(submissions, current) {
  const currentIndex = submissions.indexOf(current);
  return submissions.find((s, idx) => idx > currentIndex && s.status === "SUBMITTED");
}

export function recordProjectEvaluation(submission, { marks, maxMarks, feedback, rubric }) {
  submission.status = "EVALUATED";
  submission.marks = marks;
  submission.evaluation = { marks, maxMarks, feedback, rubric };
}
