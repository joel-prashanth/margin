import { TimedEntryCache } from "../../core/storage.js";
import {
  METADATA_CACHE_TTL,
  buildClassGroups,
  createGradingState,
  filterByTerm,
  textOf,
} from "./assessment-catalog.js";
import { ESSAY_MAX_MARKS } from "./rubrics.js";

// =====================================================
// REFLECTIVE ESSAY MODEL
// =====================================================

export const ESSAY_DISCOVERY_CACHE_KEY = "essayAssessmentDiscoveryCacheV2";

export const essayState = createGradingState();

export const essayMetadataCache = new TimedEntryCache(
  "essayAssessmentMetadataCacheV2",
  METADATA_CACHE_TTL,
);

/**
 * Strictly Reflective Essays: excludes Open Ended Problems,
 * Reflective Journals and Projects.
 */
export function isReflectiveEssay(item) {
  if (!item) return false;
  const { title, type, desc } = textOf(item);

  if (
    title.includes("open ended") ||
    title.includes("open-ended") ||
    title.includes("oep") ||
    type.includes("open ended") ||
    type.includes("open-ended") ||
    type.includes("oep") ||
    title.includes("reflective journal") ||
    type.includes("reflective journal") ||
    title.includes("project") ||
    type.includes("project")
  ) {
    return false;
  }

  return (
    title.includes("reflective essay") ||
    type.includes("reflective essay") ||
    title.includes("essay") ||
    type.includes("essay") ||
    desc.includes("reflective essay")
  );
}

/**
 * Essay classes come only from essay assessments (no timetable seeding).
 */
export function rebuildEssayClasses(termFilter) {
  essayState.assessments = filterByTerm(essayState.rawAssessments, termFilter);

  essayState.classes = buildClassGroups(essayState.assessments);
}

/**
 * Minimum-floor result used when no PDF was attached.
 */
export function noPdfEssayResult(maxMarks) {
  return {
    rubric: { q1: 24, q2: 24, q3: 24, q4: 24, q5: 24 },
    marks: 120,
    maxMarks: maxMarks || ESSAY_MAX_MARKS,
    feedback: "",
  };
}
