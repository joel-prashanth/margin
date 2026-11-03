import { sleep } from "../../core/async.js";
import { isCacheFresh, readStorage, writeStorage } from "../../core/storage.js";
import { evaluateSubmission, getAssessmentSubmissions } from "../../services/erp-api.js";
import { gradeReflectiveEssayWithAI } from "../../services/ai/essay-ai.js";
import { ESSAY_CRITERIA, ESSAY_MAX_MARKS } from "../../models/grading/rubrics.js";
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
  ESSAY_DISCOVERY_CACHE_KEY,
  essayMetadataCache,
  essayState as state,
  isReflectiveEssay,
  noPdfEssayResult,
  rebuildEssayClasses,
} from "../../models/grading/essay-model.js";
import { essayView as view } from "../../views/grading/essay-view.js";
import {
  batchProgressHtml,
  batchSummaryHtml,
  failureNote,
  successNote,
} from "../../views/grading/batch-progress-view.js";

// =====================================================
// REFLECTIVE ESSAY GRADING CONTROLLER
// Essays are scored 5 x 40 with a 120 floor and no
// written feedback.
// =====================================================

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

function getSelectedAssessment() {
  const assessmentId = view.getSelectedAssessmentId();
  return (
    state.assessments.find((a) => a.assessmentId === assessmentId) || {
      title: "Reflective Essay",
      maxMarks: ESSAY_MAX_MARKS,
    }
  );
}

// ---------- Discovery ----------

export async function discoverEssayAssessments({ background = false } = {}) {
  if (state.discoveryRunning) return;
  state.discoveryRunning = true;

  if (!background) {
    view.setClassStatus("Discovering Reflective Essay assessments from Aurora ERP...");
  }

  try {
    const { assessments, timetableClasses } = await discoverAssessments({
      metadataCache: essayMetadataCache,
      defaultTitle: "Reflective Essay",
      defaultMaxMarks: ESSAY_MAX_MARKS,
      logPrefix: "EssayUI",
    });

    state.rawAssessments = assessments.filter(isReflectiveEssay);
    state.timetableClasses = timetableClasses;

    rebuildEssayClasses(view.getTermFilter());

    await writeStorage({
      [ESSAY_DISCOVERY_CACHE_KEY]: { cachedAt: Date.now(), assessments: state.assessments },
    });

    renderClassAndAssessmentOptions();
    state.discovered = true;

    view.setClassStatus(
      `Found ${state.classes.length} classes and ${state.assessments.length} Reflective Essay assessments.`,
    );
  } catch (error) {
    console.error("[EssayUI] Discovery failed:", error);
    if (!background) {
      view.setClassStatus(`Error discovering assessments: ${error.message}`);
    }
  } finally {
    state.discoveryRunning = false;
  }
}

async function renderCachedDiscovery() {
  const cached = await readStorage([ESSAY_DISCOVERY_CACHE_KEY]);
  const data = cached[ESSAY_DISCOVERY_CACHE_KEY];

  if (!data?.assessments?.length) {
    return { loaded: false, fresh: false };
  }

  state.rawAssessments = data.assessments.filter(isReflectiveEssay);
  rebuildEssayClasses(view.getTermFilter());
  renderClassAndAssessmentOptions();

  return { loaded: true, fresh: isCacheFresh(data.cachedAt, DISCOVERY_CACHE_TTL) };
}

// ---------- Submissions ----------

async function loadSubmissions() {
  const assessmentId = view.getSelectedAssessmentId();
  if (!assessmentId) return;

  view.setLoadBusy(true);

  try {
    state.submissions = [];
    state.selected = null;
    state.aiResult = null;
    view.reset();
    view.setQueueSummary("Fetching submissions from Aurora ERP...");
    view.showQueueSection();

    const rawSubmissions = await getAssessmentSubmissions(assessmentId, { force: true });

    state.submissions = rawSubmissions.map((s) =>
      normalizePdfSubmission(s, { defaultMaxMarks: ESSAY_MAX_MARKS }),
    );

    renderQueue();
  } catch (error) {
    console.error("[EssayUI] Failed to load submissions:", error);
    view.setQueueSummary(`Failed to load: ${error.message}`);
  } finally {
    view.setLoadBusy(false);
  }
}

function selectSubmission(sub) {
  state.selected = sub;
  state.aiResult = null;

  view.showDetail(sub);

  if (sub.status === "EVALUATED" && sub.rubric) {
    showReview({
      rubric: sub.rubric,
      marks: sub.marks,
      maxMarks: sub.maxMarks,
      feedback: sub.feedback || "",
      reasoning: {},
      flags: [],
    });
  }
}

function showReview(result) {
  view.renderReview(result, ESSAY_CRITERIA, result.maxMarks || ESSAY_MAX_MARKS, recalculateTotal);
}

function recalculateTotal() {
  view.setTotal(view.readRubric().total, state.selected?.maxMarks || ESSAY_MAX_MARKS);
}

function backToQueue() {
  view.showQueueView();
  renderQueue();
}

// ---------- Single evaluation ----------

async function evaluateSelected() {
  if (!state.selected) return;

  view.setAiBusy(true);
  view.setAiStatus(
    "info-message",
    "Evaluating Reflective Essay PDF with AI (5 questions x 40 marks, min 120 floor)...",
  );

  try {
    const result = await gradeReflectiveEssayWithAI({
      submission: state.selected,
      assessment: getSelectedAssessment(),
    });

    state.aiResult = result;
    showReview(result);

    view.setAiStatus(
      "success-message",
      `✓ Evaluation complete: Awarded ${result.marks} / ${result.maxMarks} marks (Minimum 120 floor applied, no feedback written).`,
    );
  } catch (error) {
    console.error("[EssayUI] Evaluation failed:", error);
    view.setAiStatus("warning-message", `AI Evaluation Error: ${error.message}`);
  } finally {
    view.setAiBusy(false);
  }
}

async function saveEvaluation({ moveNext = false } = {}) {
  const submission = state.selected;
  if (!submission) return;

  view.setSaveButtonsDisabled(true);
  view.setSaveStatus("info-message", "Saving evaluation directly to Aurora ERP...");

  try {
    const { rubric, total } = view.readRubric();
    // Feedback is intentionally empty for essays.
    const feedback = view.getFeedback();
    const maxMarks = Number(submission.maxMarks || ESSAY_MAX_MARKS);

    state.savingIds.add(submission.id);
    await evaluateSubmission(submission.id, { marks: total, maxMarks, feedback, rubric });
    state.savingIds.delete(submission.id);

    markEvaluated(submission, { marks: total, feedback, rubric });

    view.setSaveStatus(
      "success-message",
      `✓ Evaluation saved to Aurora ERP successfully! (${total}/${maxMarks} Marks)`,
    );

    if (moveNext) {
      const nextPending = findNextPending(state.submissions, submission.id);
      if (nextPending) {
        setTimeout(() => selectSubmission(nextPending), 600);
      } else {
        setTimeout(backToQueue, 800);
      }
    }
  } catch (error) {
    console.error("[EssayUI] Save failed:", error);
    view.setSaveStatus("warning-message", `Failed to save to Aurora ERP: ${error.message}`);
  } finally {
    view.setSaveButtonsDisabled(false);
  }
}

// ---------- Batch evaluation ----------

async function runBatchEvaluation() {
  const pending = state.submissions.filter((s) => s.status !== "EVALUATED");
  if (pending.length === 0) {
    alert("No pending Reflective Essay submissions found to evaluate.");
    return;
  }

  const confirmMsg = `Start 1-Click AI Evaluation for ${pending.length} pending Reflective Essay submissions?\n\nThis will evaluate each student's PDF with AI (minimum 120 marks floor, no feedback) and save their grades to Aurora ERP.`;
  if (!confirm(confirmMsg)) return;

  const assessment = getSelectedAssessment();

  view.startBatch(pending.length);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const sub = pending[i];

    const updateProgress = (noteHtml = "") => {
      view.setBatchHtml(
        batchProgressHtml({ index: i, total: pending.length, successCount, failCount, submission: sub, noteHtml }),
      );
      view.setBulkButtonText(`⚡ Evaluating ${i + 1}/${pending.length} (✓ ${successCount} • ✗ ${failCount})`);
    };

    updateProgress("Processing PDF with AI...");

    try {
      const aiResult = sub.pdfUrl
        ? await gradeReflectiveEssayWithAI({ submission: sub, assessment })
        : noPdfEssayResult(assessment.maxMarks);

      await evaluateSubmission(sub.id, {
        marks: aiResult.marks,
        maxMarks: aiResult.maxMarks,
        feedback: "", // No feedback required
        rubric: aiResult.rubric,
      });

      markEvaluated(sub, { marks: aiResult.marks, feedback: "", rubric: aiResult.rubric });

      successCount++;
      updateProgress(successNote(`✓ Saved to ERP (${aiResult.marks}/200 M)`));
      renderQueue();
    } catch (err) {
      console.error(`[EssayUI] Batch evaluation failed for ${sub.studentName}:`, err);
      failCount++;
      updateProgress(failureNote(`✗ Failed: ${err.message}`));
    }

    // Small delay between calls to prevent rate limits
    await sleep(350);
  }

  view.finishBatch(
    batchSummaryHtml({ title: "✓ Batch Evaluation Complete!", successCount, failCount }),
    failCount,
    `⚡ 1-Click Batch AI Evaluation (${successCount} Evaluated • ${failCount} Failed)`,
  );

  renderQueue();
}

// ---------- Init ----------

export function initializeEssayGrading() {
  if (state.initialized) return;
  state.initialized = true;

  view.bind({
    onTermChange: () => {
      rebuildEssayClasses(view.getTermFilter());
      renderClassAndAssessmentOptions();
    },
    onClassChange: renderAssessmentOptions,
    onAssessmentChange: () => view.setLoadEnabled(Boolean(view.getSelectedAssessmentId())),
    onLoad: loadSubmissions,
    onFilterChange: renderQueue,
    onBack: backToQueue,
    onEvaluate: evaluateSelected,
    onSave: saveEvaluation,
    onBatch: runBatchEvaluation,
  });

  // Fast start with cache, then background discovery
  renderCachedDiscovery().then(({ loaded, fresh }) => {
    if (!loaded || !fresh) {
      discoverEssayAssessments({ background: loaded });
    }
  });
}
