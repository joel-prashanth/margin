import { escapeHtml } from "../../core/dom.js";
import { createPdfGradingView } from "./pdf-grading-view.js";

// =====================================================
// REFLECTIVE ESSAY VIEW
// =====================================================

const ESSAY_DEFAULT_QUESTION_SCORE = 28;

// Options 40..20 (realistic passing marks, no low scores).
const ESSAY_OPTION_MAX = 40;
const ESSAY_OPTION_MIN = 20;

function renderEssayRubricRow(crit, rubric, reasoning, onChange) {
  const currentVal = Number(rubric[crit.key] ?? ESSAY_DEFAULT_QUESTION_SCORE);

  const row = document.createElement("div");
  row.style.cssText =
    "padding: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 12px;";

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;";

  const label = document.createElement("div");
  label.innerHTML = `<strong>${escapeHtml(crit.label)}</strong> <span style="font-size: 12px; color: #64748b;">(Max ${crit.max} Marks)</span><div style="font-size: 12px; color: #475569; margin-top: 2px;">${escapeHtml(crit.description)}</div>`;

  const select = document.createElement("select");
  select.style.cssText = "font-weight: bold; padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 14px;";
  select.dataset.criterionKey = crit.key;

  for (let m = ESSAY_OPTION_MAX; m >= ESSAY_OPTION_MIN; m--) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = `${m} / ${crit.max}`;
    opt.selected = m === currentVal;
    select.appendChild(opt);
  }

  select.addEventListener("change", onChange);

  header.append(label, select);
  row.appendChild(header);

  if (reasoning[crit.key]) {
    const reason = document.createElement("div");
    reason.style.cssText = "font-size: 12px; color: #64748b; margin-top: 6px; padding: 6px 10px; background: #f8fafc; border-radius: 6px;";
    reason.textContent = `Evaluation Note: ${reasoning[crit.key]}`;
    row.appendChild(reason);
  }

  return row;
}

export const essayView = createPdfGradingView({
  ids: {
    classStatus: "essayClassStatus",
    termSelect: "essayTermSelect",
    classSelect: "essayClassSelect",
    assessmentSelect: "essayAssessmentId",
    assessmentStatus: "essayAssessmentStatus",
    loadButton: "loadEssaySubmissionsButton",
    queueSection: "essayQueueSection",
    queueSummary: "essayQueueSummary",
    submissionList: "essaySubmissionList",
    statusFilter: "essayStatusFilter",
    bulkButton: "bulkEvaluateEssayButton",
    bulkStatus: "bulkEvaluateEssayStatus",
    detailSection: "essayDetailSection",
    reviewSection: "essayReviewSection",
    studentName: "essayStudentName",
    studentMeta: "essayStudentMeta",
    pdfContainer: "essayPdfPreviewContainer",
    aiButton: "aiEvaluateEssayButton",
    regenerateButton: "essayRegenerateButton",
    aiStatus: "essayAiStatus",
    rubricEditor: "essayRubricEditor",
    totalMarks: "essayTotalMarks",
    feedbackInput: "essayFeedbackInput",
    flags: "essayFlags",
    saveButton: "essaySaveButton",
    saveNextButton: "essaySaveNextButton",
    saveStatus: "essaySaveStatus",
    backButton: "essayBackButton",
  },
  text: {
    noClasses: "No Reflective Essay classes found",
    noAssessments: "No Reflective Essay assessments found",
    noAssessmentsStatus: "No Reflective Essay assessments found in Aurora ERP.",
    assessmentPlaceholder: "— Select Reflective Essay Assessment —",
    defaultTitle: "Reflective Essay",
    assessmentsFound: (count, label) => `Found ${count} Reflective Essay assessment(s) for ${label}`,
    emptyQueue: "No Reflective Essay submissions match the selected filter.",
    pdfReadyBadge: "📄 PDF Essay Ready",
    pdfLabel: "Reflective Essay PDF:",
    pdfFilenameColor: "#2563eb",
    loadButtonLabel: "Load Reflective Essay Submissions",
  },
  renderRubricRow: renderEssayRubricRow,
});
