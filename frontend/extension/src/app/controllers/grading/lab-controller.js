import { sleep } from "../../core/async.js";
import { isCacheFresh, readStorage, writeStorage } from "../../core/storage.js";
import { evaluateSubmission, getAssessmentSubmissions } from "../../services/erp-api.js";
import { gradeLabReportWithAI } from "../../services/ai/lab-ai.js";
import { LAB_REPORT_CRITERIA } from "../../models/grading/rubrics.js";
import {
  DISCOVERY_CACHE_TTL,
  countByStatus,
  discoverAssessments,
  filterByStatus,
  findNextPending,
  markEvaluated,
  normalizePdfSubmission,
  sortByTitle,
} from "../../models/grading/assessment-catalog.js";
import {
  LAB_DEFAULT_MAX_MARKS,
  LAB_DISCOVERY_CACHE_KEY,
  applyPlagiarismCheck,
  isLabCacheEntry,
  isLabReport,
  isRateLimitError,
  labMetadataCache,
  labState as state,
  noPdfLabResult,
  rebuildLabClasses,
  retryDelayMs,
} from "../../models/grading/lab-model.js";
import { labView as view } from "../../views/grading/lab-view.js";
import {
  batchProgressHtml,
  batchSummaryHtml,
  failureNote,
  successNote,
  waitingHtml,
} from "../../views/grading/batch-progress-view.js";

// =====================================================
// LAB REPORT GRADING CONTROLLER
// =====================================================

const MAX_AI_RETRIES = 5;

function resetLabView() {
  state.submissions = [];
  state.selected = null;
  state.aiResult = null;
  view.reset();
}

function renderClassAndAssessmentOptions() {
  view.renderClassOptions(state.classes);
  renderAssessmentOptions();
}

function renderAssessmentOptions() {
  const key = view.getSelectedClassKey();
  const selectedClass = state.classes.find((c) => c.key === key);
  view.renderAssessmentOptions(key, selectedClass, sortByTitle(selectedClass?.assessments || []));
}

function renderQueue() {
  view.renderQueue(
    filterByStatus(state.submissions, view.getStatusFilter()),
    countByStatus(state.submissions),
    selectSubmission,
  );
}

function getSelectedAssessment(fallbackMaxMarks) {
  const assessmentId = view.getSelectedAssessmentId();
  return (
    state.assessments.find((a) => a.assessmentId === assessmentId) || {
      title: "Lab Report",
      maxMarks: fallbackMaxMarks,
    }
  );
}

// ---------- Discovery ----------

export async function discoverLabAssessments({ background = false } = {}) {
  if (state.discoveryRunning) return;
  state.discoveryRunning = true;

  if (!background) {
    view.setClassStatus("Discovering faculty classes and lab assessments from Aurora ERP...");
  }

  try {
    const { assessments, timetableClasses } = await discoverAssessments({
      metadataCache: labMetadataCache,
      defaultTitle: "Assessment",
      defaultMaxMarks: LAB_DEFAULT_MAX_MARKS,
      logPrefix: "LabUI",
    });

    // Reflective Essays, Open Ended Problems and Project Reports have their own tabs.
    state.rawAssessments = assessments.filter(isLabReport);
    state.timetableClasses = timetableClasses;

    rebuildLabClasses(view.getTermFilter());

    await writeStorage({
      [LAB_DISCOVERY_CACHE_KEY]: { cachedAt: Date.now(), assessments: state.assessments },
    });

    renderClassAndAssessmentOptions();
    state.discovered = true;

    view.setClassStatus(`Found ${state.classes.length} classes and ${state.assessments.length} assessments.`);
  } catch (error) {
    console.error("[LabUI] Discovery failed:", error);
    if (!background) {
      view.setClassStatus(`Error discovering assessments: ${error.message}`);
    }
  } finally {
    state.discoveryRunning = false;
  }
}

async function renderCachedDiscovery() {
  const cached = await readStorage([LAB_DISCOVERY_CACHE_KEY]);
  const data = cached[LAB_DISCOVERY_CACHE_KEY];

  if (!data?.assessments?.length) {
    return { loaded: false, fresh: false };
  }

  state.rawAssessments = data.assessments.filter(isLabCacheEntry);
  rebuildLabClasses(view.getTermFilter());
  renderClassAndAssessmentOptions();

  return { loaded: true, fresh: isCacheFresh(data.cachedAt, DISCOVERY_CACHE_TTL) };
}

/**
 * Tab hook: show cached classes instantly, refresh if stale.
 */
export async function onLabTabActivated() {
  if (state.discovered || state.discoveryRunning) return;

  const cache = await renderCachedDiscovery();

  if (cache.loaded) {
    state.discovered = true;
    if (!cache.fresh) {
      discoverLabAssessments({ background: true }).catch(() => {});
    }
    return;
  }

  await discoverLabAssessments();
}

// ---------- Submissions ----------

async function loadSubmissions() {
  const assessmentId = view.getSelectedAssessmentId();
  if (!assessmentId) return;

  view.setLoadBusy(true);

  try {
    resetLabView();
    view.setQueueSummary("Fetching submissions from Aurora ERP...");
    view.showQueueSection();

    const rawSubmissions = await getAssessmentSubmissions(assessmentId, { force: true });

    state.submissions = rawSubmissions.map((s) =>
      normalizePdfSubmission(s, { defaultMaxMarks: LAB_DEFAULT_MAX_MARKS }),
    );

    renderQueue();
  } catch (error) {
    console.error("[LabUI] Failed to load submissions:", error);
    view.setQueueSummary(`Failed to load: ${error.message}`);
  } finally {
    view.setLoadBusy(false);
  }
}

function selectSubmission(sub) {
  state.selected = sub;
  state.aiResult = null;

  view.showDetail(sub);

  // Pre-fill review if already evaluated
  if (sub.status === "EVALUATED" && sub.rubric) {
    showReview({
      rubric: sub.rubric,
      marks: sub.marks,
      maxMarks: sub.maxMarks,
      feedback: sub.feedback,
      reasoning: {},
      flags: [],
    });
  }
}

function showReview(result) {
  view.renderReview(result, LAB_REPORT_CRITERIA, result.maxMarks, recalculateTotal);
}

function recalculateTotal() {
  view.setTotal(view.readRubric().total, state.selected?.maxMarks || LAB_DEFAULT_MAX_MARKS);
}

function backToQueue() {
  state.selected = null;
  state.aiResult = null;
  view.showQueueView();
  renderQueue();
}

// ---------- Single evaluation ----------

async function evaluateSelected() {
  if (!state.selected) return;

  const assessment = getSelectedAssessment(state.selected.maxMarks || LAB_DEFAULT_MAX_MARKS);

  view.setAiBusy(true, "Analyzing PDF with Gemini Flash Multimodal...", "⚡ Evaluate with AI (Gemini Flash)");
  view.setAiStatus(
    "info-message",
    "Sending PDF document to Gemini 2.0 Flash (analyzing text, tables, and handwritten diagrams)...",
  );

  try {
    const result = await gradeLabReportWithAI({ submission: state.selected, assessment });

    state.aiResult = result;
    showReview(result);

    view.setAiStatus("success-message", `Evaluation complete: Suggested ${result.marks} / ${result.maxMarks} marks!`);
  } catch (error) {
    console.error("[LabUI] AI evaluation failed:", error);
    view.setAiStatus("warning-message", `AI Evaluation Error: ${error.message}`);
  } finally {
    view.setAiBusy(false, "Analyzing PDF with Gemini Flash Multimodal...", "⚡ Evaluate with AI (Gemini Flash)");
  }
}

async function saveEvaluation({ moveNext = false } = {}) {
  const submission = state.selected;
  if (!submission) return;

  view.setSaveButtonsDisabled(true);
  view.setSaveStatus("info-message", "Saving evaluation directly to Aurora ERP...");

  try {
    const { rubric, total } = view.readRubric();
    const feedback = view.getFeedback() || "Good submission.";
    const maxMarks = Number(submission.maxMarks || LAB_DEFAULT_MAX_MARKS);

    state.savingIds.add(submission.id);
    await evaluateSubmission(submission.id, { marks: total, maxMarks, feedback, rubric });
    state.savingIds.delete(submission.id);

    markEvaluated(submission, { marks: total, feedback, rubric });

    view.setSaveStatus("success-message", "✓ Evaluation saved to Aurora ERP successfully!");

    if (moveNext) {
      const nextPending = findNextPending(state.submissions, submission.id);
      if (nextPending) {
        setTimeout(() => selectSubmission(nextPending), 600);
      } else {
        setTimeout(backToQueue, 800);
      }
    }
  } catch (error) {
    console.error("[LabUI] Save failed:", error);
    view.setSaveStatus("warning-message", `Failed to save to Aurora ERP: ${error.message}`);
  } finally {
    view.setSaveButtonsDisabled(false);
  }
}

// ---------- Batch evaluation ----------

/**
 * Retries on model rate limits, honouring Gemini's "retry in Xs" hint.
 */
async function gradeWithRetry(sub, assessment, { onWaiting, onRetry }) {
  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
    try {
      return await gradeLabReportWithAI({ submission: sub, assessment });
    } catch (aiError) {
      if (!isRateLimitError(aiError) || attempt >= MAX_AI_RETRIES) {
        throw aiError;
      }

      const waitMs = retryDelayMs(aiError, attempt);
      onWaiting(waitMs, attempt);
      await sleep(waitMs);
      onRetry();
    }
  }
}

async function runBatchEvaluation() {
  const pending = state.submissions.filter((s) => s.status !== "EVALUATED");
  if (pending.length === 0) {
    alert("No pending submissions found to evaluate.");
    return;
  }

  const confirmMsg = `Start 1-Click AI Evaluation for ${pending.length} pending Lab Report submissions?\n\nThis will evaluate each student's PDF with Gemini Flash Multimodal and save their grades to Aurora ERP.`;
  if (!confirm(confirmMsg)) return;

  const assessment = getSelectedAssessment(LAB_DEFAULT_MAX_MARKS);

  view.startBatch(pending.length);

  let successCount = 0;
  let failCount = 0;
  const seenFingerprints = new Map(); // fingerprint -> original roll number

  for (let i = 0; i < pending.length; i++) {
    const sub = pending[i];

    const updateProgress = (noteHtml = "") => {
      view.setBatchHtml(
        batchProgressHtml({ index: i, total: pending.length, successCount, failCount, submission: sub, noteHtml }),
      );
      view.setBulkButtonText(`⚡ Evaluating ${i + 1}/${pending.length} (✓ ${successCount} • ✗ ${failCount})`);
    };

    updateProgress("Evaluating Lab PDF...");

    try {
      const aiResult = sub.pdfUrl
        ? await gradeWithRetry(sub, assessment, {
            onWaiting: (waitMs, attempt) => {
              view.setBatchHtml(
                waitingHtml(
                  `⏳ Model busy/rate limited. Waiting ${(waitMs / 1000).toFixed(1)}s before retrying ${sub.studentName} (Attempt ${attempt}/${MAX_AI_RETRIES})...`,
                ),
              );
            },
            onRetry: () => updateProgress("Retrying PDF evaluation..."),
          })
        : noPdfLabResult(assessment.maxMarks);

      applyPlagiarismCheck(aiResult, sub.rollNumber, seenFingerprints);

      await evaluateSubmission(sub.id, {
        marks: aiResult.marks,
        maxMarks: aiResult.maxMarks,
        feedback: aiResult.feedback,
        rubric: aiResult.rubric,
      });

      markEvaluated(sub, aiResult);

      successCount++;
      updateProgress(successNote(`✓ Saved to ERP (${aiResult.marks}/${aiResult.maxMarks} M)`));
    } catch (err) {
      console.error(`[LabUI] Batch grading error on student ${sub.studentName}:`, err);
      failCount++;
      updateProgress(failureNote(`✗ Failed: ${err.message}`));
    }

    renderQueue();

    // Small courteous pause between items
    await sleep(600);
  }

  view.finishBatch(
    batchSummaryHtml({ title: "✓ Batch Lab Evaluation Complete!", successCount, failCount }),
    failCount,
    `⚡ 1-Click Batch AI Evaluation (${successCount} Evaluated • ${failCount} Failed)`,
  );
}

// ---------- Init ----------

export function initializeLabGrading() {
  if (state.initialized) return;
  state.initialized = true;

  view.bind({
    onTermChange: () => {
      rebuildLabClasses(view.getTermFilter());
      renderClassAndAssessmentOptions();
    },
    onClassChange: renderAssessmentOptions,
    onAssessmentChange: () => {
      resetLabView();
      view.setLoadEnabled(Boolean(view.getSelectedAssessmentId()));
    },
    onLoad: loadSubmissions,
    onFilterChange: renderQueue,
    onBack: backToQueue,
    onEvaluate: evaluateSelected,
    onSave: saveEvaluation,
    onBatch: runBatchEvaluation,
  });
}
