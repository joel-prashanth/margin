import { createPdfGradingView } from "./pdf-grading-view.js";

// =====================================================
// LAB REPORT VIEW
// =====================================================

function renderLabRubricRow(crit, rubric, reasoning, onChange) {
  const row = document.createElement("div");
  row.style.cssText = "padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px;";

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;";

  const label = document.createElement("strong");
  label.style.cssText = "font-size: 14px; color: #1e293b;";
  label.textContent = `${crit.label} (Max ${crit.max})`;

  const select = document.createElement("select");
  select.dataset.criterionKey = crit.key;
  select.style.cssText = "width: 90px; padding: 6px 10px; font-weight: bold; border-radius: 8px;";

  for (let i = crit.max; i >= 0; i--) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${i} / ${crit.max}`;
    opt.selected = Number(rubric[crit.key]) === i;
    select.appendChild(opt);
  }

  select.addEventListener("change", onChange);

  header.append(label, select);
  row.appendChild(header);

  if (reasoning[crit.key]) {
    const reason = document.createElement("div");
    reason.style.cssText = "font-size: 12px; color: #64748b; margin-top: 4px;";
    reason.textContent = `AI Note: ${reasoning[crit.key]}`;
    row.appendChild(reason);
  }

  return row;
}

export const labView = createPdfGradingView({
  ids: {
    classStatus: "labClassStatus",
    termSelect: "labTermSelect",
    classSelect: "labClassSelect",
    assessmentSelect: "labAssessmentId",
    assessmentStatus: "labAssessmentStatus",
    loadButton: "loadLabSubmissionsButton",
    queueSection: "labQueueSection",
    queueSummary: "labQueueSummary",
    submissionList: "labSubmissionList",
    statusFilter: "labStatusFilter",
    bulkButton: "bulkEvaluateLabButton",
    bulkStatus: "bulkEvaluateLabStatus",
    detailSection: "labDetailSection",
    reviewSection: "labReviewSection",
    studentName: "labStudentName",
    studentMeta: "labStudentMeta",
    pdfContainer: "labPdfPreviewContainer",
    aiButton: "aiEvaluateLabButton",
    regenerateButton: "labRegenerateButton",
    aiStatus: "labAiStatus",
    rubricEditor: "labRubricEditor",
    totalMarks: "labTotalMarks",
    feedbackInput: "labFeedbackInput",
    flags: "labFlags",
    saveButton: "labSaveButton",
    saveNextButton: "labSaveNextButton",
    saveStatus: "labSaveStatus",
    backButton: "labBackButton",
  },
  text: {
    noClasses: "No classes detected in ERP",
    noAssessments: "No assessments found for this class",
    noAssessmentsStatus: "No assessments with submissions found in Aurora ERP.",
    assessmentPlaceholder: "— Select Assessment (e.g. Lab 5) —",
    defaultTitle: "Assessment",
    assessmentsFound: (count, label) => `Found ${count} assessments for ${label}`,
    emptyQueue: "No submissions match the selected filter.",
    pdfReadyBadge: "📄 PDF Report Ready",
    pdfLabel: "PDF Attachment:",
    pdfFilenameColor: null,
    loadButtonLabel: "Load Lab Submissions",
  },
  renderRubricRow: renderLabRubricRow,
});
