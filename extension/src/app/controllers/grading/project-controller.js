import { sleep } from "../../core/async.js";
import { isCacheFresh, readStorage, writeStorage } from "../../core/storage.js";
import { evaluateSubmission, getAssessmentSubmissions } from "../../services/erp-api.js";
import { gradeProjectReportWithAI } from "../../services/ai/project-ai.js";
import { PROJECT_CRITERIA, PROJECT_MAX_MARKS } from "../../models/grading/rubrics.js";
import { DISCOVERY_CACHE_TTL, countByStatus, discoverAssessments } from "../../models/grading/assessment-catalog.js";
import {
  PROJECT_DISCOVERY_CACHE_KEY,
  clampProjectTotal,
  fetchPdfBlob,
  filterProjectSubmissions,
  findSubmissionPdfUrl,
  nextPendingAfter,
  normalizeProjectSubmission,
  projectMarksDisplay,
  projectMetadataCache,
  projectState as state,
  rebuildProjectClasses,
  recordProjectEvaluation,
  refreshSubmissionPdfUrl,
  selectProjectAssessments,
  sortByRollNumber,
} from "../../models/grading/project-model.js";
import * as view from "../../views/grading/project-view.js";

// =====================================================
// PROJECT REPORT GRADING CONTROLLER
// Marks are strictly within 80–95 out of 100.
// =====================================================

const SAVE_RETRIES = 3;

function findSelectedAssessment() {
  const assessmentId = view.getSelectedAssessmentId();
  return state.assessments.find((a) => a.assessmentId === assessmentId);
}

function renderClassOptions() {
  view.renderClassOptions(state.classes);
}

function renderAssessmentOptions() {
  const classId = view.getSelectedClassId();

  if (!classId) {
    view.renderAssessmentOptions("none");
    return;
  }

  const currentClass = state.classes.find((c) => c.id === classId);

  if (currentClass?.assessments?.length > 0) {
    view.renderAssessmentOptions("class", currentClass.assessments);
  } else if (state.assessments.length > 0) {
    // No assessment matched this class pattern: offer every Project Report.
    view.renderAssessmentOptions("all", state.assessments);
  } else {
    view.renderAssessmentOptions("loading");
    discoverProjectAssessments({ background: true });
  }
}

function renderSubmissionList() {
  const filter = view.getStatusFilter();

  const cards = filterProjectSubmissions(state.submissions, filter).map((sub) => ({
    sub,
    marksDisplay: projectMarksDisplay(sub),
    selected: state.selected?.id === sub.id,
  }));

  view.renderSubmissionList(cards, filter, openSubmission);
}

// ---------- Discovery ----------

export async function discoverProjectAssessments({ background = false } = {}) {
  if (state.discoveryRunning) return;
  state.discoveryRunning = true;

  if (!background) {
    view.setClassStatus("Discovering classes and Project Report assessments from Aurora ERP...");
  }

  try {
    const { assessments, timetableClasses } = await discoverAssessments({
      metadataCache: projectMetadataCache,
      defaultTitle: "Project Report",
      defaultMaxMarks: PROJECT_MAX_MARKS,
      logPrefix: "ProjectUI",
    });

    state.rawAssessments = selectProjectAssessments(assessments);
    state.timetableClasses = timetableClasses;

    rebuildProjectClasses(view.getTermFilter());

    await writeStorage({
      [PROJECT_DISCOVERY_CACHE_KEY]: { cachedAt: Date.now(), assessments: state.assessments },
    });

    renderClassOptions();
    renderAssessmentOptions();
    state.discovered = true;

    view.setClassStatus(
      `Found ${state.classes.length} classes and ${state.assessments.length} Project Report assessments.`,
    );
  } catch (error) {
    console.error("[ProjectUI] Discovery failed:", error);
    if (!background) {
      view.setClassStatus(`Error discovering assessments: ${error.message}`);
    }
  } finally {
    state.discoveryRunning = false;
  }
}

async function renderCachedDiscovery() {
  const cached = await readStorage([PROJECT_DISCOVERY_CACHE_KEY]);
  const data = cached?.[PROJECT_DISCOVERY_CACHE_KEY];

  if (!data?.assessments?.length) {
    return { loaded: false, fresh: false };
  }

  state.rawAssessments = data.assessments;
  rebuildProjectClasses(view.getTermFilter());
  renderClassOptions();
  renderAssessmentOptions();

  return { loaded: true, fresh: isCacheFresh(data.cachedAt, DISCOVERY_CACHE_TTL) };
}

export function onProjectTabActivated() {
  discoverProjectAssessments();
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
    view.resetProjectView();

    const raw = await getAssessmentSubmissions(assessmentId, { force: true });

    state.submissions = sortByRollNumber(raw.map(normalizeProjectSubmission));

    view.showQueueSection();
    renderSubmissionList();

    const counts = countByStatus(state.submissions);
    view.setQueueSummaryLoaded(counts);
    view.toggleBulkButton(counts.pending > 0);
  } catch (error) {
    console.error("[ProjectUI] Failed to load submissions:", error);
    view.setQueueSummaryText(`Error loading submissions: ${error.message}`);
  } finally {
    view.setLoadBusy(false);
  }
}

/**
 * Loads the PDF as a blob (avoids S3 content-disposition issues);
 * refreshes an expired presigned URL once before falling back to
 * a direct iframe link.
 */
async function loadPdfPreview(preview, submission, initialUrl) {
  preview.setStatus("Loading PDF...");
  let urlToFetch = initialUrl;

  let fetchRes = await fetchPdfBlob(urlToFetch);

  if (!fetchRes.ok) {
    preview.setStatus("Presigned URL expired, refreshing from Aurora ERP...");
    try {
      const assessmentId = view.getSelectedAssessmentId();
      if (assessmentId) {
        const freshUrl = await refreshSubmissionPdfUrl(assessmentId, submission);
        if (freshUrl && freshUrl !== urlToFetch) {
          urlToFetch = freshUrl;
          preview.setLink(freshUrl);
          fetchRes = await fetchPdfBlob(urlToFetch);
        }
      }
    } catch (refreshErr) {
      console.warn("[ProjectUI] Refresh failed:", refreshErr);
    }
  }

  if (fetchRes.ok && fetchRes.blob) {
    preview.setFrameSrc(URL.createObjectURL(fetchRes.blob));
    preview.setStatus("✓ PDF Loaded Successfully");
  } else {
    preview.setFrameSrc(`${urlToFetch}#toolbar=1`);
    preview.setStatus("Previewing via direct link (click Open in New Tab if blocked)");
  }
}

function openSubmission(submission) {
  state.selected = submission;
  state.aiResult = null;

  view.showDetail(submission);

  const preview = view.renderPdfPreview(findSubmissionPdfUrl(submission), async () => {
    try {
      const freshUrl = await refreshSubmissionPdfUrl(view.getSelectedAssessmentId(), submission);
      if (freshUrl) {
        preview.setLink(freshUrl);
        await loadPdfPreview(preview, submission, freshUrl);
      }
    } catch (e) {
      alert(`Refresh failed: ${e.message}`);
    }
  });

  if (preview) {
    loadPdfPreview(preview, submission, findSubmissionPdfUrl(submission));
  }
}

function backToQueue() {
  view.showQueueView();
  renderSubmissionList();
}

// ---------- Single evaluation ----------

async function evaluateSelected() {
  if (!state.selected) return;

  const studentIndex = Math.max(0, state.submissions.indexOf(state.selected));

  view.setAiBusy(true);
  view.setAiStatus("info", "Evaluating Project Report PDF (Target: 80–95 Marks)...");

  try {
    const result = await gradeProjectReportWithAI({
      submission: state.selected,
      assessment: findSelectedAssessment(),
      studentIndex,
    });

    state.aiResult = result;
    view.renderReview(result, PROJECT_CRITERIA, () => view.setTotal(view.readRubricTotal(PROJECT_CRITERIA)));
    view.showReviewSection();

    view.setAiStatus("success", `✓ Evaluation complete: ${result.marks} / 100 marks awarded.`);
  } catch (error) {
    console.error("[ProjectUI] Single AI Evaluation error:", error);
    view.setAiStatus("error", `Evaluation failed: ${error.message}`);
  } finally {
    view.setAiBusy(false);
  }
}

async function saveEvaluation({ andNext = false } = {}) {
  const submission = state.selected;
  if (!submission) return;

  const marks = clampProjectTotal(view.readRubricTotal(PROJECT_CRITERIA));
  const feedback = view.getFeedback();
  const maxMarks = Number(submission.maxMarks || PROJECT_MAX_MARKS || 100);
  const rubric = state.aiResult?.rubric || null;

  view.setSaveButtonsDisabled(true);
  view.setSaveStatus("info", "Saving marks to Aurora ERP...");

  try {
    state.savingIds.add(submission.id);

    await evaluateSubmission(submission.id, { marks, maxMarks, feedback, rubric });

    recordProjectEvaluation(submission, { marks, maxMarks, feedback, rubric });

    view.setSaveStatus("success", `✓ Successfully saved ${marks}/100 to Aurora ERP!`);

    renderSubmissionList();

    if (andNext) {
      const nextPending = nextPendingAfter(state.submissions, submission);
      if (nextPending) {
        setTimeout(() => openSubmission(nextPending), 600);
      } else {
        setTimeout(backToQueue, 1000);
      }
    }
  } catch (error) {
    console.error("[ProjectUI] Save error:", error);
    view.setSaveStatus("error", `Save failed: ${error.message}`);
  } finally {
    state.savingIds.delete(submission.id);
    view.setSaveButtonsDisabled(false);
  }
}

// ---------- Batch evaluation ----------

async function saveWithRetries(sub, payload) {
  let lastSaveErr = null;

  for (let attempt = 1; attempt <= SAVE_RETRIES; attempt++) {
    try {
      await evaluateSubmission(sub.id, payload);
      return;
    } catch (saveErr) {
      lastSaveErr = saveErr;
      console.warn(`[ProjectUI] Save attempt ${attempt} failed for ${sub.studentName || sub.id}:`, saveErr);
      if (attempt < SAVE_RETRIES) {
        await sleep(1500 * attempt);
      }
    }
  }

  throw lastSaveErr || new Error("Failed to save evaluation to Aurora ERP after retries");
}

async function runBatchEvaluation() {
  const assessment = findSelectedAssessment();
  const pendingSubmissions = state.submissions.filter((s) => s.status === "SUBMITTED");

  if (pendingSubmissions.length === 0) {
    alert("No pending submissions left to evaluate.");
    return;
  }

  const confirmed = confirm(
    `Start Batch AI Evaluation for ${pendingSubmissions.length} pending Project Report submissions?\n\n` +
    `• Marks Range: strictly between 80 and 95 Marks out of 100\n` +
    `• Individual varied grades based on project scope, architecture, implementation, testing & documentation\n` +
    `• Saves evaluated marks and feedback directly to Aurora ERP.`
  );
  if (!confirmed) return;

  view.setBulkBusy(true);
  view.setBulkStatus("info", `Starting batch evaluation of ${pendingSubmissions.length} project reports...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pendingSubmissions.length; i++) {
    const sub = pendingSubmissions[i];

    view.setBulkStatusText(
      `Evaluating ${i + 1} of ${pendingSubmissions.length} • ✓ ${successCount} Evaluated • ✗ ${failCount} Failed • Student: ${sub.studentName || "Student"} (${sub.rollNumber || "N/A"})...`,
    );

    try {
      const aiResult = await gradeProjectReportWithAI({
        submission: sub,
        assessment,
        studentIndex: state.submissions.indexOf(sub),
      });

      const payload = {
        marks: aiResult.marks,
        maxMarks: Number(sub.maxMarks || PROJECT_MAX_MARKS || 100),
        feedback: aiResult.feedback,
        rubric: aiResult.rubric || null,
      };

      await saveWithRetries(sub, payload);

      recordProjectEvaluation(sub, payload);

      successCount++;
    } catch (err) {
      console.error(`[ProjectUI] Batch eval failed for student ${sub.studentName || sub.rollNumber}:`, err);
      failCount++;
    }

    renderSubmissionList();

    // Pacing delay between requests to avoid request throttling
    if (i < pendingSubmissions.length - 1) {
      await sleep(1200);
    }
  }

  view.setBulkStatus(
    failCount === 0 ? "success" : "info",
    `✓ Batch Evaluation Finished! • ✓ ${successCount} Evaluated Successfully • ✗ ${failCount} Failed.`,
  );

  view.setBulkBusy(false, countByStatus(state.submissions).pending);
}

// ---------- Init ----------

export function initializeProjectGrading() {
  if (state.initialized) return;
  state.initialized = true;

  // Build default classes immediately so the dropdown is never disabled.
  rebuildProjectClasses(view.getTermFilter());
  renderClassOptions();

  view.bindProjectEvents({
    onTermChange: () => {
      rebuildProjectClasses(view.getTermFilter());
      renderClassOptions();
      renderAssessmentOptions();
    },
    onClassChange: renderAssessmentOptions,
    onLoad: loadSubmissions,
    onFilterChange: renderSubmissionList,
    onBatch: runBatchEvaluation,
    onBack: backToQueue,
    onEvaluate: evaluateSelected,
    onSave: saveEvaluation,
  });

  renderCachedDiscovery().then(({ loaded, fresh }) => {
    if (!loaded || !fresh) {
      discoverProjectAssessments({ background: loaded });
    }
  });
}
