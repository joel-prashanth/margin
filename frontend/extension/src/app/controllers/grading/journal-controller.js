import { sleep } from "../../core/async.js";
import { evaluateSubmission, getAssessmentSubmissions, getFacultySubmissions } from "../../services/erp-api.js";
import { gradeJournalWithAI } from "../../services/ai/journal-ai.js";
import {
  JOURNAL_CRITERIA,
  calculateRubricTotal,
  normalizeSubmission,
} from "../../models/grading/journal-submission.js";
import {
  buildAssessmentGroups,
  buildEvaluationPayload,
  buildJournalClasses,
  buildPayloadFromAiResult,
  canEvaluateSubmission,
  enrichJournalMetadata,
  findAssessment,
  findClass,
  getBulkCandidateCount,
  getBulkCandidates,
  getFilteredSubmissions,
  getJournalCompleteness,
  getNextPendingSubmission,
  getSaveAvailability,
  getSubmissionCounts,
  hasJournalResponseContent,
  isJournalRateLimitError,
  journalRetryDelayMs,
  journalState as state,
  loadDiscoveryCache,
  removeUnresolvedAssessments,
  replaceSubmissionLocally,
  saveDiscoveryCache,
  shortAssessmentId,
  syncAssessmentCounts,
  verifyEvaluationResponse,
} from "../../models/grading/journal-model.js";
import * as view from "../../views/grading/journal-view.js";

// =====================================================
// REFLECTIVE JOURNAL GRADING CONTROLLER
// =====================================================

const MAX_AI_RETRIES = 5;

// 2.5s between bulk requests to stay within the Groq free tier.
const BULK_DELAY_MS = 2500;

function selectedClass() {
  return findClass(view.getSelectedClassKey());
}

function selectedAssessment() {
  return findAssessment(selectedClass(), view.getSelectedAssessmentId());
}

function resetJournalView() {
  state.submissions = [];
  state.selected = null;
  state.aiResult = null;
  view.resetJournalView();
}

// ---------- Pickers ----------

function updateSelectedAssessmentStatus() {
  const journalClass = selectedClass();
  const assessment = selectedAssessment();

  if (!journalClass || !assessment) return;

  view.setAssessmentStatus(
    `${assessment.title || assessment.type || "Reflective Journal"} • ` +
      `${assessment.subjectCode || journalClass.subjectCode || "Subject"} • ` +
      `${assessment.sectionCode || journalClass.sectionCode || "Section"}`,
  );
}

function assessmentTitle(assessment) {
  return (
    assessment.title ||
    assessment.type ||
    `Reflective Journal • ID ${shortAssessmentId(assessment.assessmentId)}`
  );
}

function renderAssessmentOptions() {
  resetJournalView();

  view.renderAssessmentOptions(selectedClass(), assessmentTitle);

  updateSelectedAssessmentStatus();
}

function renderClassOptions(options) {
  if (view.renderClassOptions(state.classes, options)) {
    renderAssessmentOptions();
  }
}

// ---------- Discovery ----------

async function renderCachedDiscovery() {
  const result = await loadDiscoveryCache(view.getTermFilter());

  if (result.loaded) {
    renderClassOptions({ cached: true });
  }

  return result;
}

async function discoverJournalAssessments({ background = false } = {}) {
  if (state.discoveryRunning) return;

  try {
    state.discoveryRunning = true;

    if (!background) {
      view.showDiscoveryLoading();
    }

    const response = await getFacultySubmissions();

    state.assessments = buildAssessmentGroups(Array.isArray(response) ? response : []);

    if (!state.assessments.length) {
      state.classes = [];
      state.discovered = true;
      renderClassOptions();
      return;
    }

    if (!background) {
      view.setClassStatus("Loading assessment details...");
    }

    state.assessments = removeUnresolvedAssessments(await enrichJournalMetadata(state.assessments));

    buildJournalClasses(view.getTermFilter());

    state.discovered = true;

    renderClassOptions();

    await saveDiscoveryCache();

    view.setClassStatus(`${state.classes.length} class(es) with Reflective Journal assessments detected.`);
  } catch (error) {
    console.error("[Journal] discovery failed.", error);

    if (background && state.classes.length > 0) {
      view.setClassStatus(`${state.classes.length} class(es) loaded from cache.`);
      return;
    }

    state.discovered = false;
    state.assessments = [];
    state.classes = [];

    view.showDiscoveryError(error?.message ?? "Unable to detect Reflective Journal classes.");
  } finally {
    state.discoveryRunning = false;
  }
}

/**
 * Tab hook: show cached classes instantly, refresh if stale.
 */
export async function onJournalTabActivated() {
  if (state.discovered || state.discoveryRunning) return;

  const cacheResult = await renderCachedDiscovery();

  if (cacheResult.loaded) {
    state.discovered = true;

    if (!cacheResult.fresh) {
      discoverJournalAssessments({ background: true }).catch((error) => {
        console.warn("[Journal] background refresh failed.", error);
      });
    }

    return;
  }

  await discoverJournalAssessments();
}

// ---------- Queue ----------

function renderQueue() {
  view.renderQueue({
    counts: getSubmissionCounts(),
    visible: getFilteredSubmissions(view.getStatusFilter()),
    savingIds: state.savingIds,
    onOpen: openSubmission,
  });

  const filter = view.getStatusFilter();
  view.updateBulkButton(filter, getBulkCandidateCount(filter));
}

async function loadSubmissions() {
  const assessmentId = view.getSelectedAssessmentId();
  if (!assessmentId) return;

  const assessment = selectedAssessment();

  try {
    view.setLoadBusy(true);
    view.setAssessmentStatus(`Loading ${assessment?.title || "Reflective Journal"}...`);

    const response = await getAssessmentSubmissions(assessmentId);

    state.submissions = (Array.isArray(response) ? response : []).map(normalizeSubmission);
    state.selected = null;
    state.aiResult = null;

    view.showQueueView();
    renderQueue();

    // Right after loading, always offer bulk evaluation of pending journals.
    view.updateBulkButton("SUBMITTED", getBulkCandidateCount("SUBMITTED"));

    const counts = getSubmissionCounts();

    view.setAssessmentStatus(
      `${assessment?.title || "Reflective Journal"} • ` +
        `${counts.pending} pending • ` +
        `${counts.evaluated} evaluated • ` +
        `${counts.notSubmitted} not submitted`,
    );

    syncAssessmentCounts(selectedAssessment());
  } catch (error) {
    view.setAssessmentStatus(error?.message ?? "Unable to load Reflective Journal submissions.");
  } finally {
    view.setLoadBusy(false);
  }
}

// ---------- Detail ----------

function updateGradingButtonState(submission) {
  const availability = getSaveAvailability(submission, selectedAssessment());

  view.setGradingButtons({
    gradeable: canEvaluateSubmission(submission),
    saving: Boolean(submission?.id && state.savingIds.has(submission.id)),
    saveEnabled: availability.enabled,
  });

  view.showSaveAvailability(availability);
}

function openSubmission(submission) {
  state.selected = normalizeSubmission(submission);
  state.aiResult = null;

  view.showDetail(state.selected, getJournalCompleteness(state.selected), JOURNAL_CRITERIA);

  view.renderExistingEvaluation(state.selected, JOURNAL_CRITERIA);

  updateGradingButtonState(state.selected);
}

function backToQueue() {
  if (state.selected?.id && state.savingIds.has(state.selected.id)) {
    alert("Wait for Aurora ERP to finish saving this evaluation before leaving this student.");
    return;
  }

  state.selected = null;
  state.aiResult = null;

  view.showQueueView();
  renderQueue();
}

function updateTotal() {
  view.setTotal(calculateRubricTotal(view.readRubricInputs()));
}

async function evaluateWithAI() {
  try {
    const submission = state.selected;

    if (!submission) {
      throw new Error("No Reflective Journal submission selected.");
    }

    if (state.savingIds.has(submission.id)) {
      throw new Error("This evaluation is currently being saved.");
    }

    if (!hasJournalResponseContent(submission)) {
      throw new Error("This Reflective Journal has no response content to evaluate.");
    }

    view.disableAiButtons();
    view.setAiStatus("warning-message", "Generating AI grading recommendation...");

    state.aiResult = await gradeJournalWithAI({ submission });

    view.renderReview(state.aiResult, JOURNAL_CRITERIA, updateTotal);
    updateTotal();
    updateGradingButtonState(state.selected);

    view.setAiStatus(
      "success-message",
      "AI recommendation generated. Review and edit every score and feedback before saving.",
    );
  } catch (error) {
    view.setAiStatus("error-message", error?.message ?? "Unable to evaluate journal with AI.");
  } finally {
    updateGradingButtonState(state.selected);
  }
}

// ---------- Save ----------

function confirmSave(submission, payload) {
  return confirm(
    [
      "Save evaluation to Aurora ERP?",
      "",
      `Student: ${submission.studentName || "Student"}`,
      `Registration No: ${submission.registrationNo || "—"}`,
      "",
      `Experience: ${payload.rubric.experience}/4`,
      `Feelings: ${payload.rubric.feelings}/4`,
      `Learning: ${payload.rubric.learning}/4`,
      `Application: ${payload.rubric.application}/4`,
      `Conclusion: ${payload.rubric.Conclusion}/4`,
      "",
      `Total: ${payload.marks}/20`,
      "",
      "This will update Aurora ERP.",
      "This action does not publish the evaluation.",
    ].join("\n"),
  );
}

async function saveEvaluation({ moveNext = false } = {}) {
  const originalSubmission = state.selected;
  if (!originalSubmission) return;

  const submissionId = originalSubmission.id;
  const assessmentId = view.getSelectedAssessmentId();

  if (state.savingIds.has(submissionId)) return;

  const availability = getSaveAvailability(originalSubmission, selectedAssessment());

  if (!availability.enabled) {
    alert(availability.reason);
    return;
  }

  if (!assessmentId || originalSubmission.assessmentId !== assessmentId) {
    alert("The selected journal changed. Reload submissions before saving.");
    return;
  }

  let payload;

  try {
    payload = buildEvaluationPayload(view.readRubricInputs(), view.getFeedback());
  } catch (error) {
    alert(error?.message ?? "Evaluation validation failed.");
    return;
  }

  if (!confirmSave(originalSubmission, payload)) return;

  try {
    state.savingIds.add(submissionId);

    updateGradingButtonState(originalSubmission);
    renderQueue();

    view.showSaveResult(
      "warning-message",
      "Saving evaluation to Aurora ERP… Aurora currently takes about 30 seconds to process an evaluation.",
    );

    const startedAt = performance.now();

    // Exactly ONE network request.
    const response = await evaluateSubmission(submissionId, payload);

    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);

    const savedSubmission = verifyEvaluationResponse(response, submissionId, payload);

    replaceSubmissionLocally(submissionId, savedSubmission);

    state.selected = savedSubmission;

    syncAssessmentCounts(selectedAssessment());

    view.renderExistingEvaluation(savedSubmission, JOURNAL_CRITERIA);

    renderQueue();

    view.showSaveResult(
      "success-message",
      `✓ Evaluation saved and verified directly from Aurora ERP • ${payload.marks}/20 • ${seconds}s`,
    );

    if (!moveNext) return;

    const nextSubmission = getNextPendingSubmission(submissionId, assessmentId);

    if (nextSubmission) {
      openSubmission(nextSubmission);
      view.scrollToDetail();
      return;
    }

    state.selected = null;
    state.aiResult = null;

    view.showQueueView();
    renderQueue();
  } catch (error) {
    view.showSaveResult(
      "error-message",
      error?.code === "SUBMISSION_WINDOW_OPEN"
        ? error.message || "Evaluation opens once the submission window closes."
        : error?.message ?? "Unable to save evaluation.",
    );
  } finally {
    state.savingIds.delete(submissionId);

    renderQueue();

    if (state.selected?.id === submissionId) {
      updateGradingButtonState(state.selected);
    }
  }
}

// ---------- Bulk ----------

/**
 * Retries on Groq rate limits, honouring "try again in Xs".
 */
async function gradeWithRetry(candidate, onWaiting) {
  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
    try {
      return await gradeJournalWithAI({ submission: candidate });
    } catch (aiError) {
      if (!isJournalRateLimitError(aiError) || attempt >= MAX_AI_RETRIES) {
        throw aiError;
      }

      const waitMs = journalRetryDelayMs(aiError, attempt);
      onWaiting(waitMs, attempt);
      await sleep(waitMs);
    }
  }
}

async function bulkEvaluate() {
  const assessmentId = view.getSelectedAssessmentId();
  if (!assessmentId) return;

  const isReeval = view.getStatusFilter() === "EVALUATED";

  const candidates = getBulkCandidates(assessmentId, isReeval ? "EVALUATED" : "SUBMITTED");

  if (!candidates.length) {
    alert(isReeval ? "No evaluated submissions to re-evaluate." : "No pending submissions to evaluate.");
    return;
  }

  const actionLabel = isReeval
    ? `Re-evaluate ${candidates.length} already-evaluated submission(s) with AI and overwrite in ERP?`
    : `AI-grade and auto-save ${candidates.length} pending submission(s) to Aurora ERP?`;

  if (!confirm(`${actionLabel}\n\nThis will apply custom AI rules and immediately save results to Aurora ERP.`)) {
    return;
  }

  const log = view.startBulkLog();

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const studentName = candidate.studentName || "Student";

    log.progress(`⏳ Evaluating ${i + 1} of ${candidates.length}: ${studentName}…`);

    try {
      state.savingIds.add(candidate.id);

      const aiResult = await gradeWithRetry(candidate, (waitMs, attempt) => {
        log.progress(
          `⏳ Rate limited. Waiting ${(waitMs / 1000).toFixed(1)}s before retrying ${studentName} (Attempt ${attempt}/${MAX_AI_RETRIES})…`,
        );
      });

      const payload = buildPayloadFromAiResult(aiResult);

      const response = await evaluateSubmission(candidate.id, payload);

      replaceSubmissionLocally(candidate.id, verifyEvaluationResponse(response, candidate.id, payload));

      successCount++;
      log.log(`✓ ${candidate.studentName || candidate.id} — ${payload.marks}/20`, true);
    } catch (error) {
      failCount++;
      console.error(`Failed to bulk evaluate submission ${candidate.id}:`, error);
      log.log(`✗ ${candidate.studentName || candidate.id}: ${error?.message ?? "Unknown error"}`, false);
    } finally {
      state.savingIds.delete(candidate.id);
      renderQueue();
    }

    if (i < candidates.length - 1) {
      await sleep(BULK_DELAY_MS);
    }
  }

  syncAssessmentCounts(selectedAssessment());

  log.progress(`Bulk evaluation complete — ${successCount} saved ✓ | ${failCount} failed ✗`);
  log.finish(failCount === 0 ? "success-message" : "warning-message");
}

// ---------- Init ----------

export function initializeJournalGrading() {
  if (state.initialized) return;
  state.initialized = true;

  view.bindJournalEvents({
    onTermChange: () => {
      buildJournalClasses(view.getTermFilter());
      renderClassOptions();
    },
    onClassChange: renderAssessmentOptions,
    onAssessmentChange: () => {
      resetJournalView();
      updateSelectedAssessmentStatus();
      view.setLoadEnabled(Boolean(view.getSelectedAssessmentId()));
    },
    onLoad: loadSubmissions,
    onFilterChange: renderQueue,
    onBack: backToQueue,
    onEvaluate: evaluateWithAI,
    onSave: saveEvaluation,
    onBulk: bulkEvaluate,
  });
}
