import { TimedEntryCache } from "../../core/storage.js";
import {
  METADATA_CACHE_TTL,
  buildClassGroups,
  createGradingState,
  filterByTerm,
  textOf,
} from "./assessment-catalog.js";

// =====================================================
// LAB REPORT MODEL
// =====================================================

export const LAB_DEFAULT_MAX_MARKS = 20;

export const LAB_DISCOVERY_CACHE_KEY = "labAssessmentDiscoveryCacheV3";

export const labState = createGradingState();

export const labMetadataCache = new TimedEntryCache(
  "labAssessmentMetadataCacheV3",
  METADATA_CACHE_TTL,
);

/**
 * Lab reports are everything that is not an Essay, Open Ended
 * Problem or Project Report.
 */
export function isLabReport(item) {
  const { title, type, desc } = textOf(item);
  const isEssay = title.includes("essay") || type.includes("essay") || desc.includes("reflective essay");
  const isOep = title.includes("open ended") || title.includes("open-ended") || title.includes("oep") ||
                type.includes("open ended") || type.includes("open-ended") || type.includes("oep");
  const isProject = title.includes("project") || type.includes("project") || desc.includes("project");
  return !isEssay && !isOep && !isProject;
}

/**
 * Cached discovery entries only had essays excluded historically.
 */
export function isLabCacheEntry(item) {
  const { title, type, desc } = textOf(item);
  return !title.includes("essay") && !type.includes("essay") && !desc.includes("reflective essay");
}

export function rebuildLabClasses(termFilter) {
  labState.assessments = filterByTerm(labState.rawAssessments, termFilter);

  labState.classes = buildClassGroups(
    labState.assessments,
    filterByTerm(labState.timetableClasses, termFilter),
  );
}

/**
 * Zero-mark result used when no PDF was attached.
 */
export function noPdfLabResult(maxMarks) {
  return {
    rubric: { objectives: 0, acid_properties: 0, concurrency_control: 0, diagrams: 0, conclusion: 0 },
    marks: 0,
    maxMarks: maxMarks || LAB_DEFAULT_MAX_MARKS,
    feedback: "No lab report PDF submitted. Zero marks awarded.",
  };
}

/**
 * Class-wide plagiarism check: identical document fingerprints
 * after the first get a fixed 12-mark result. Mutates `aiResult`.
 */
export function applyPlagiarismCheck(aiResult, rollNumber, seenFingerprints) {
  const fingerprint = aiResult.documentFingerprint;

  if (!fingerprint || fingerprint.length <= 20) {
    return;
  }

  if (seenFingerprints.has(fingerprint)) {
    const originalAuthor = seenFingerprints.get(fingerprint);
    aiResult.marks = 12;
    aiResult.rubric = { objectives: 2, acid_properties: 2, concurrency_control: 3, diagrams: 2, conclusion: 3 };
    aiResult.feedback = `PLAGIARISM DETECTED: This document contains identical paragraphs to the submission by Roll Number ${originalAuthor}. 12 marks awarded.`;
  } else {
    seenFingerprints.set(fingerprint, rollNumber);
  }
}

const RATE_LIMIT_MARKERS = ["429", "503", "high demand", "quota", "rate limit", "too many"];

export function isRateLimitError(error) {
  const message = error?.message?.toLowerCase() || "";
  return RATE_LIMIT_MARKERS.some((marker) => message.includes(marker));
}

/**
 * Gemini format: "Please retry in 20.74s." -> exact time + 1.5s,
 * otherwise linear 15s backoff.
 */
export function retryDelayMs(error, attempt) {
  const match = error?.message?.match(/retry in ([\d\.]+)s/i);
  if (match && match[1]) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 1500;
  }
  return 15000 * attempt;
}
