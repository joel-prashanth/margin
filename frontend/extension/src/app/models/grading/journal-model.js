import { readStorage, writeStorage, isCacheFresh, TimedEntryCache } from "../../core/storage.js";
import { isTerm1 } from "../../services/erp-api.js";
import { calculateRubricTotal, normalizeSubmission } from "./journal-submission.js";
import { METADATA_CACHE_TTL, DISCOVERY_CACHE_TTL, enrichWithMetadata, sortByRecency } from "./assessment-catalog.js";

// =====================================================
// REFLECTIVE JOURNAL MODEL
// =====================================================

export const JOURNAL_MAX_MARKS = 20;

const DISCOVERY_CACHE_KEY = "journalAssessmentDiscoveryCacheV3";

const CONTENT_FIELDS = ["experience", "learning", "application", "feelings", "conclusion"];

// Aurora ERP expects capital C for Conclusion when writing rubric data.
export const RUBRIC_SAVE_FIELDS = ["experience", "feelings", "learning", "application", "Conclusion"];

export const journalState = {
  submissions: [],
  selected: null,
  aiResult: null,
  assessments: [],
  classes: [],
  discovered: false,
  discoveryRunning: false,
  initialized: false,
  // Save state belongs to a specific submission — never one global flag.
  savingIds: new Set(),
};

export const journalMetadataCache = new TimedEntryCache(
  "journalAssessmentMetadataCacheV3",
  METADATA_CACHE_TTL,
);

// =====================================================
// CONTENT
// =====================================================

function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasJournalResponseContent(submission) {
  const content = submission?.content;

  if (!content || typeof content !== "object") {
    return false;
  }

  return CONTENT_FIELDS.some((field) => isFilled(content[field]));
}

export function getJournalCompleteness(submission) {
  const content = submission?.content ?? {};

  const completed = CONTENT_FIELDS.filter((field) => isFilled(content[field]));

  return {
    completed: completed.length,
    total: CONTENT_FIELDS.length,
    missing: CONTENT_FIELDS.filter((field) => !completed.includes(field)),
  };
}

export function canEvaluateSubmission(submission) {
  return (
    (submission?.status === "SUBMITTED" || submission?.status === "EVALUATED") &&
    hasJournalResponseContent(submission)
  );
}

/**
 * A submission is a journal when its content has at least
 * three of the five reflective fields.
 */
function looksLikeReflectiveJournal(submission) {
  const content = submission?.content;

  if (!content || typeof content !== "object") {
    return false;
  }

  const matchingFields = CONTENT_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(content, field),
  );

  return matchingFields.length >= 3;
}

export function shortAssessmentId(assessmentId) {
  if (!assessmentId) {
    return "unknown";
  }

  return String(assessmentId).slice(0, 8);
}

// =====================================================
// ASSESSMENT DISCOVERY
// =====================================================

export function buildAssessmentGroups(facultySubmissions) {
  const groups = new Map();

  for (const submission of facultySubmissions) {
    if (!submission?.assessmentId || !looksLikeReflectiveJournal(submission)) {
      continue;
    }

    const assessmentId = submission.assessmentId;

    if (!groups.has(assessmentId)) {
      groups.set(assessmentId, {
        assessmentId,
        title: "",
        type: "",
        method: "",
        description: "",
        maxMarks: JOURNAL_MAX_MARKS,
        dueDate: null,
        sourceWeekNumber: null,
        total: 0,
        pending: 0,
        evaluated: 0,
        latestSubmittedAt: 0,
        subjectCode: "",
        subjectName: "",
        sectionCode: "",
        sectionId: "",
        termName: "",
        status: "",
        resultsPublished: false,
      });
    }

    const group = groups.get(assessmentId);

    group.total += 1;

    if (submission.status === "SUBMITTED") {
      group.pending += 1;
    }

    if (submission.status === "EVALUATED") {
      group.evaluated += 1;
    }

    const submittedTime = submission.submittedAt
      ? new Date(submission.submittedAt).getTime()
      : 0;

    if (Number.isFinite(submittedTime) && submittedTime > group.latestSubmittedAt) {
      group.latestSubmittedAt = submittedTime;
    }
  }

  return Array.from(groups.values());
}

/**
 * Journal metadata uses `??` (keeps empty strings from ERP),
 * unlike the PDF modules.
 */
export function applyJournalMetadata(assessment, details) {
  if (!assessment || !details) {
    return;
  }

  assessment.title = details.title ?? details.type ?? assessment.title ?? "";
  assessment.type = details.type ?? assessment.type ?? "";
  assessment.method = details.method ?? assessment.method ?? "";
  assessment.description = details.description ?? assessment.description ?? "";
  assessment.maxMarks = Number(details.maxMarks ?? assessment.maxMarks ?? JOURNAL_MAX_MARKS);
  assessment.dueDate = details.dueDate ?? assessment.dueDate ?? null;
  assessment.sourceWeekNumber = details.sourceWeekNumber ?? assessment.sourceWeekNumber ?? null;
  assessment.subjectCode = details.subject?.code ?? assessment.subjectCode ?? "";
  assessment.subjectName = details.subject?.name ?? assessment.subjectName ?? "";
  assessment.sectionCode = details.section?.code ?? assessment.sectionCode ?? "";
  assessment.sectionId = details.section?.id ?? assessment.sectionId ?? "";
  assessment.termName = details.term?.name ?? details.academicTerm?.name ?? assessment.termName ?? "";
  assessment.termId = details.term?.id ?? details.termId ?? "";
  assessment.status = details.status ?? assessment.status ?? "";
  assessment.resultsPublished = Boolean(details.resultsPublished ?? assessment.resultsPublished);
}

export async function enrichJournalMetadata(assessments) {
  if (!assessments.length) {
    return assessments;
  }

  await journalMetadataCache.load();

  await enrichWithMetadata(assessments, journalMetadataCache, applyJournalMetadata, "Journal");

  return assessments;
}

/**
 * Drops assessments missing class identifiers and those that
 * belong to the Essay / Lab / OEP / Project tabs.
 */
export function removeUnresolvedAssessments(assessments) {
  return assessments.filter((assessment) => {
    const valid = Boolean(
      assessment.assessmentId &&
      assessment.sectionId &&
      assessment.sectionCode &&
      assessment.subjectCode,
    );
    if (!valid) return false;

    const title = (assessment.title || "").toLowerCase();
    const type = (assessment.type || "").toLowerCase();
    const desc = (assessment.description || "").toLowerCase();

    const isOther =
      title.includes("essay") || type.includes("essay") || desc.includes("essay") ||
      title.includes("lab") || type.includes("lab") ||
      title.includes("open ended") || title.includes("open-ended") || title.includes("oep") ||
      type.includes("open ended") || type.includes("open-ended") || type.includes("oep") ||
      title.includes("project") || type.includes("project") || desc.includes("project");

    return !isOther;
  });
}

export function buildJournalClasses(termFilter) {
  const map = new Map();

  for (const assessment of journalState.assessments) {
    if (!assessment.sectionId || !assessment.sectionCode) {
      continue;
    }

    if (termFilter === "TERM2" && isTerm1(assessment)) {
      continue;
    } else if (termFilter === "TERM1" && !isTerm1(assessment)) {
      continue;
    }

    const key = `${assessment.subjectCode || "SUBJECT"}|${assessment.sectionId}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        subjectCode: assessment.subjectCode,
        subjectName: assessment.subjectName,
        sectionCode: assessment.sectionCode,
        sectionId: assessment.sectionId,
        assessments: [],
      });
    }

    map.get(key).assessments.push(assessment);
  }

  journalState.classes = Array.from(map.values());

  for (const journalClass of journalState.classes) {
    sortByRecency(journalClass.assessments);
  }

  journalState.classes.sort((first, second) => {
    const firstLabel = `${first.subjectCode ?? ""} ${first.sectionCode ?? ""}`;
    const secondLabel = `${second.subjectCode ?? ""} ${second.sectionCode ?? ""}`;
    return firstLabel.localeCompare(secondLabel);
  });
}

export function findClass(key) {
  if (!key) {
    return null;
  }

  return journalState.classes.find((item) => item.key === key) ?? null;
}

export function findAssessment(journalClass, assessmentId) {
  if (!journalClass || !assessmentId) {
    return null;
  }

  return journalClass.assessments.find((a) => a.assessmentId === assessmentId) ?? null;
}

// =====================================================
// DISCOVERY CACHE
// =====================================================

function serializeAssessmentForCache(assessment) {
  return {
    assessmentId: assessment.assessmentId,
    title: assessment.title ?? "",
    type: assessment.type ?? "",
    method: assessment.method ?? "",
    description: assessment.description ?? "",
    maxMarks: Number(assessment.maxMarks ?? JOURNAL_MAX_MARKS),
    dueDate: assessment.dueDate ?? null,
    sourceWeekNumber: assessment.sourceWeekNumber ?? null,
    total: Number(assessment.total ?? 0),
    pending: Number(assessment.pending ?? 0),
    evaluated: Number(assessment.evaluated ?? 0),
    latestSubmittedAt: Number(assessment.latestSubmittedAt ?? 0),
    subjectCode: assessment.subjectCode ?? "",
    subjectName: assessment.subjectName ?? "",
    sectionCode: assessment.sectionCode ?? "",
    sectionId: assessment.sectionId ?? "",
    termName: assessment.termName ?? "",
    status: assessment.status ?? "",
    resultsPublished: Boolean(assessment.resultsPublished),
  };
}

export async function saveDiscoveryCache() {
  await writeStorage({
    [DISCOVERY_CACHE_KEY]: {
      cachedAt: Date.now(),
      assessments: journalState.assessments.map(serializeAssessmentForCache),
    },
  });
}

export async function loadDiscoveryCache(termFilter) {
  const result = await readStorage(DISCOVERY_CACHE_KEY);

  const cache = result?.[DISCOVERY_CACHE_KEY];

  if (!cache || !Array.isArray(cache.assessments) || cache.assessments.length === 0) {
    return { loaded: false, fresh: false };
  }

  journalState.assessments = cache.assessments.map((assessment) => ({ ...assessment }));

  buildJournalClasses(termFilter);

  if (!journalState.classes.length) {
    return { loaded: false, fresh: false };
  }

  return { loaded: true, fresh: isCacheFresh(cache.cachedAt, DISCOVERY_CACHE_TTL) };
}

// =====================================================
// QUEUE
// =====================================================

export function getSubmissionCounts() {
  const { submissions } = journalState;

  return {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === "SUBMITTED").length,
    evaluated: submissions.filter((s) => s.status === "EVALUATED").length,
    notSubmitted: submissions.filter((s) => s.status === "NOT_SUBMITTED").length,
  };
}

export function getFilteredSubmissions(filterValue) {
  const filter = String(filterValue ?? "ALL").toUpperCase();
  const { submissions } = journalState;

  if (filter === "ALL" || filter === "") {
    return submissions;
  }

  if (filter === "PENDING") {
    return submissions.filter((s) => s.status === "SUBMITTED");
  }

  return submissions.filter((s) => s.status === filter);
}

/**
 * Bulk-evaluable count for the current filter, or null when
 * the bulk action does not apply ("All" is ambiguous).
 */
export function getBulkCandidateCount(filter) {
  if (filter !== "SUBMITTED" && filter !== "EVALUATED") {
    return null;
  }

  return journalState.submissions.filter(
    (s) => s.status === filter && hasJournalResponseContent(s),
  ).length;
}

export function getBulkCandidates(assessmentId, targetStatus) {
  return journalState.submissions.filter(
    (s) =>
      s.assessmentId === assessmentId &&
      s.status === targetStatus &&
      hasJournalResponseContent(s) &&
      !journalState.savingIds.has(s.id),
  );
}

export function replaceSubmissionLocally(submissionId, replacement) {
  const index = journalState.submissions.findIndex((s) => s.id === submissionId);

  if (index !== -1) {
    journalState.submissions[index] = replacement;
  }
}

export function getNextPendingSubmission(currentSubmissionId, assessmentId) {
  const { submissions, savingIds } = journalState;

  const currentIndex = submissions.findIndex((s) => s.id === currentSubmissionId);

  const isCandidate = (s) =>
    s &&
    s.assessmentId === assessmentId &&
    s.status === "SUBMITTED" &&
    hasJournalResponseContent(s) &&
    !savingIds.has(s.id);

  if (currentIndex === -1) {
    return submissions.find(isCandidate) ?? null;
  }

  for (let index = currentIndex + 1; index < submissions.length; index += 1) {
    if (isCandidate(submissions[index])) {
      return submissions[index];
    }
  }

  for (let index = 0; index < currentIndex; index += 1) {
    if (isCandidate(submissions[index])) {
      return submissions[index];
    }
  }

  return null;
}

// =====================================================
// EVALUATION WINDOW / SAVE RULES
// =====================================================

/**
 * Aurora only accepts evaluations after the due date.
 */
export function isEvaluationWindowOpen(assessment) {
  if (!assessment?.dueDate) {
    return true;
  }

  const dueTime = new Date(assessment.dueDate).getTime();

  if (!Number.isFinite(dueTime)) {
    return true;
  }

  return Date.now() >= dueTime;
}

export function formatEvaluationOpenTime(assessment) {
  if (!assessment?.dueDate) {
    return "";
  }

  const date = new Date(assessment.dueDate);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Returns { enabled, reason }. Re-evaluation of EVALUATED
 * submissions is allowed only through the AI buttons.
 */
export function getSaveAvailability(submission, assessment) {
  if (!submission) {
    return { enabled: false, reason: "No journal submission is selected." };
  }

  if (journalState.savingIds.has(submission.id)) {
    return { enabled: false, reason: "Saving this evaluation to Aurora ERP…" };
  }

  if (submission.status === "NOT_SUBMITTED") {
    return { enabled: false, reason: "This student has not submitted this Reflective Journal." };
  }

  if (submission.status !== "SUBMITTED") {
    return {
      enabled: false,
      reason: `Save unavailable because ERP status is ${submission.status ?? "UNKNOWN"}.`,
    };
  }

  if (!hasJournalResponseContent(submission)) {
    return { enabled: false, reason: "The submission contains no journal response content." };
  }

  if (!isEvaluationWindowOpen(assessment)) {
    const time = formatEvaluationOpenTime(assessment);

    return {
      enabled: false,
      reason: time
        ? `Aurora ERP evaluation opens after ${time}.`
        : "Aurora ERP evaluation is not open yet.",
    };
  }

  return { enabled: true, reason: "" };
}

// =====================================================
// PAYLOAD + RESPONSE VERIFICATION
// =====================================================

export function validateRubricForSave(rubric) {
  for (const field of RUBRIC_SAVE_FIELDS) {
    const score = Number(rubric[field]);

    if (!Number.isInteger(score) || score < 0 || score > 4) {
      throw new Error(`${field} must be an integer between 0 and 4.`);
    }
  }

  return Object.fromEntries(RUBRIC_SAVE_FIELDS.map((field) => [field, Number(rubric[field])]));
}

export function buildEvaluationPayload(rubricInput, feedbackInput) {
  const rubric = validateRubricForSave(rubricInput);

  const feedback = feedbackInput.trim();

  if (!feedback) {
    throw new Error("Faculty feedback cannot be empty.");
  }

  return {
    marks: calculateRubricTotal(rubric),
    maxMarks: JOURNAL_MAX_MARKS,
    feedback,
    rubric,
  };
}

/**
 * Bulk path: missing AI scores count as 0.
 */
export function buildPayloadFromAiResult(aiResult) {
  let marks = 0;

  const rubric = {};

  for (const field of RUBRIC_SAVE_FIELDS) {
    rubric[field] = Number(aiResult.rubric?.[field] || 0);

    marks += rubric[field];
  }

  return {
    marks,
    maxMarks: JOURNAL_MAX_MARKS,
    feedback: aiResult.feedback || "Evaluated by AI rules.",
    rubric,
  };
}

/**
 * Confirms the PUT response echoes exactly what was saved and
 * returns the normalized saved submission.
 */
export function verifyEvaluationResponse(response, submissionId, expected) {
  if (!response) {
    throw new Error("Aurora ERP returned an empty evaluation response.");
  }

  if (response.success !== true) {
    throw new Error(response?.message ?? "Aurora ERP did not confirm the evaluation.");
  }

  const saved = response.data;

  if (!saved) {
    throw new Error("Aurora ERP did not return the evaluated submission.");
  }

  if (saved.id !== submissionId) {
    throw new Error("Aurora ERP returned a different submission ID.");
  }

  if (saved.status !== "EVALUATED") {
    throw new Error(`Aurora ERP returned ${saved.status ?? "UNKNOWN"} instead of EVALUATED.`);
  }

  if (Number(saved.marksObtained) !== expected.marks) {
    throw new Error("Aurora ERP returned different marks than were submitted.");
  }

  const rubric = saved.evaluation?.rubric;

  if (!saved.evaluation) {
    throw new Error("Aurora ERP did not return evaluation details.");
  }

  if (!rubric) {
    throw new Error("Aurora ERP did not return the saved rubric.");
  }

  for (const field of RUBRIC_SAVE_FIELDS) {
    if (Number(rubric[field]) !== Number(expected.rubric[field])) {
      throw new Error(`Saved ${field} score does not match.`);
    }
  }

  return normalizeSubmission(saved);
}

export function syncAssessmentCounts(assessment) {
  if (!assessment) {
    return;
  }

  const counts = getSubmissionCounts();

  assessment.total = counts.total;

  assessment.pending = counts.pending;

  assessment.evaluated = counts.evaluated;

  saveDiscoveryCache().catch(() => {});
}

const JOURNAL_RATE_LIMIT_MARKERS = ["429", "rate limit", "too many"];

export function isJournalRateLimitError(error) {
  const message = error?.message?.toLowerCase() || "";
  return JOURNAL_RATE_LIMIT_MARKERS.some((marker) => message.includes(marker));
}

/**
 * Groq format: "Please try again in 7.06s." -> exact time + 0.5s,
 * otherwise 5s linear backoff.
 */
export function journalRetryDelayMs(error, attempt) {
  const match = error?.message?.match(/try again in ([\d\.]+)s/i);
  if (match && match[1]) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  }
  return 5000 * attempt;
}
