import { clearElement, createOption, escapeHtml, getElement, hide, show } from "../../core/dom.js";
import { PROJECT_MAX_MARKS } from "../../models/grading/rubrics.js";

// =====================================================
// PROJECT REPORT VIEW
// =====================================================

const $ = getElement;

export function resetProjectView() {
  hide($("projectQueueSection"));
  hide($("projectDetailSection"));
  hide($("projectReviewSection"));

  const bulkStatus = $("bulkEvaluateProjectStatus");
  if (bulkStatus) {
    bulkStatus.classList.add("hidden");
    bulkStatus.textContent = "";
  }
}

export function getTermFilter() {
  return $("projectTermSelect")?.value || "TERM2";
}

export function getSelectedClassId() {
  return $("projectClassSelect")?.value;
}

export function getSelectedAssessmentId() {
  return $("projectAssessmentId")?.value;
}

export function getStatusFilter() {
  return $("projectStatusFilter")?.value || "SUBMITTED";
}

export function setClassStatus(text) {
  const el = $("projectClassStatus");
  if (el) el.textContent = text;
}

/**
 * Keeps the previous selection when that class still exists.
 */
export function renderClassOptions(classes) {
  const select = $("projectClassSelect");
  if (!select) return;

  const prevValue = select.value;
  clearElement(select);

  select.appendChild(createOption("", "Select a Class..."));

  for (const c of classes) {
    const countText = c.assessments.length > 0 ? ` (${c.assessments.length} assessments)` : "";
    select.appendChild(createOption(c.id, `${c.label || c.name}${countText}`));
  }

  select.disabled = false;
  if (prevValue && classes.some((c) => c.id === prevValue)) {
    select.value = prevValue;
  }
}

/**
 * mode: "none" (no class) | "class" (class assessments) |
 * "all" (all project assessments) | "loading".
 */
export function renderAssessmentOptions(mode, assessments = []) {
  const assessSelect = $("projectAssessmentId");
  const loadButton = $("loadProjectSubmissionsButton");

  if (!assessSelect) return;
  clearElement(assessSelect);

  const setEnabled = (enabled) => {
    assessSelect.disabled = !enabled;
    if (loadButton) loadButton.disabled = !enabled;
  };

  if (mode === "none") {
    assessSelect.appendChild(createOption("", "Select a class first"));
    setEnabled(false);
    return;
  }

  if (mode === "loading") {
    assessSelect.appendChild(createOption("", "Loading assessments from Aurora ERP..."));
    setEnabled(false);
    return;
  }

  if (mode === "all") {
    assessSelect.appendChild(createOption("", "Select assessment..."));
  }

  for (const a of assessments) {
    const scope = mode === "all" ? ` [${a.sectionCode || a.subjectName || "Project"}]` : "";
    assessSelect.appendChild(
      createOption(
        a.assessmentId,
        `${a.title || "Project Report"}${scope} (${a.pending} pending / ${a.total} total)`,
      ),
    );
  }

  setEnabled(true);
}

export function setLoadBusy(busy) {
  const btn = $("loadProjectSubmissionsButton");
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? "Loading Submissions..." : "Load Project Submissions";
}

export function showQueueSection() {
  show($("projectQueueSection"));
}

export function setQueueSummaryLoaded({ total, pending, evaluated }) {
  const el = $("projectQueueSummary");
  if (el) {
    el.innerHTML = `Loaded <strong>${total}</strong> Project Report submissions (<strong>${pending}</strong> pending, <strong>${evaluated}</strong> evaluated).`;
  }
}

export function setQueueSummaryText(text) {
  const el = $("projectQueueSummary");
  if (el) el.textContent = text;
}

export function toggleBulkButton(visible) {
  $("bulkEvaluateProjectButton")?.classList.toggle("hidden", !visible);
}

/**
 * `cards` = [{ sub, marksDisplay, selected }].
 */
export function renderSubmissionList(cards, filter, onOpen) {
  const container = $("projectSubmissionList");
  if (!container) return;
  clearElement(container);

  if (cards.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = `No submissions match filter "${filter}".`;
    container.appendChild(empty);
    return;
  }

  for (const { sub, marksDisplay, selected } of cards) {
    const card = document.createElement("div");
    card.className = `submission-card ${sub.status === "EVALUATED" ? "evaluated" : "pending"}`;
    if (selected) card.classList.add("selected");

    card.innerHTML = `
      <div class="submission-card-header">
        <div>
          <strong class="student-name">${escapeHtml(sub.studentName || "Student")}</strong>
          <span class="roll-number">${escapeHtml(sub.rollNumber || "No Roll #")}</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="status-pill status-${sub.status?.toLowerCase() || "submitted"}">
            ${sub.status === "EVALUATED" ? "✓ Evaluated" : "Pending"}
          </span>
        </div>
      </div>
      <div class="submission-card-body" style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 12px; color: #64748b;">
        <span>Project Report PDF</span>
        <span class="submission-marks" style="font-weight: 700; color: #0f172a;">${marksDisplay}</span>
      </div>
    `;

    card.addEventListener("click", () => onOpen(sub));
    container.appendChild(card);
  }
}

export function showDetail(submission) {
  hide($("projectQueueSection"));
  show($("projectDetailSection"));
  hide($("projectReviewSection"));

  const nameEl = $("projectStudentName");
  const metaEl = $("projectStudentMeta");

  if (nameEl) nameEl.textContent = submission.studentName || "Student";
  if (metaEl) {
    metaEl.innerHTML = `Roll No: <strong>${escapeHtml(submission.rollNumber || "N/A")}</strong> • Project Report PDF`;
  }

  const aiStatus = $("projectAiStatus");
  if (aiStatus) {
    aiStatus.classList.add("hidden");
    aiStatus.textContent = "";
  }
}

/**
 * Renders the PDF preview shell and returns handles the
 * controller uses to drive loading, or null without a PDF.
 */
export function renderPdfPreview(pdfUrl, onRefresh) {
  const pdfContainer = $("projectPdfPreviewContainer");
  if (!pdfContainer) return null;

  clearElement(pdfContainer);

  if (!pdfUrl) {
    pdfContainer.innerHTML = `
      <div class="empty-state" style="padding: 20px; text-align: center; color: #64748b;">
        No PDF attachment found for this student.
      </div>
    `;
    return null;
  }

  pdfContainer.innerHTML = `
    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
      <a id="projectOpenPdfLink" target="_blank" rel="noopener noreferrer" class="link-button" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; color: #2563eb; background: #eff6ff; padding: 8px 14px; border-radius: 8px; border: 1px solid #bfdbfe; text-decoration: none;">
        📄 Open Project Report PDF in New Tab ↗
      </a>
      <button id="projectRefreshPdfBtn" type="button" class="secondary" style="font-size: 12px; padding: 7px 12px;">
        🔄 Refresh Signed URL from Aurora
      </button>
      <span id="projectPdfStatus" style="font-size: 12px; color: #64748b;">Loading document preview...</span>
    </div>
    <div id="projectPdfFrameWrapper" style="position: relative; min-height: 520px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <iframe id="projectPdfIframe" style="width: 100%; height: 600px; border: none;" title="Student Project Report PDF"></iframe>
    </div>
  `;

  const iframe = pdfContainer.querySelector("#projectPdfIframe");
  const statusSpan = pdfContainer.querySelector("#projectPdfStatus");
  const openLink = pdfContainer.querySelector("#projectOpenPdfLink");
  const refreshBtn = pdfContainer.querySelector("#projectRefreshPdfBtn");

  openLink.href = pdfUrl;

  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing...";
    try {
      await onRefresh();
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "🔄 Refresh Signed URL from Aurora";
    }
  });

  return {
    setStatus: (text) => { if (statusSpan) statusSpan.textContent = text; },
    setLink: (url) => { if (openLink) openLink.href = url; },
    setFrameSrc: (src) => { if (iframe) iframe.src = src; },
  };
}

export function setAiBusy(busy) {
  const btn = $("aiEvaluateProjectButton");
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? "⚡ Evaluating with AI..." : "⚡ Evaluate with AI";
}

/**
 * kind: "info" | "success" | "error".
 */
function setNotice(id, kind, text) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("hidden");
  el.textContent = text;
  el.className = `status-notice status-notice-${kind}`;
}

export const setAiStatus = (kind, text) => setNotice("projectAiStatus", kind, text);

export const setSaveStatus = (kind, text) => setNotice("projectSaveStatus", kind, text);

export const setBulkStatus = (kind, text) => setNotice("bulkEvaluateProjectStatus", kind, text);

export function setBulkStatusText(text) {
  const el = $("bulkEvaluateProjectStatus");
  if (el) el.textContent = text;
}

export function setBulkBusy(busy, remainingPending = 0) {
  const btn = $("bulkEvaluateProjectButton");
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.textContent = "⚡ Running Batch Evaluation...";
  } else {
    btn.textContent = "⚡ 1-Click Batch AI Evaluation";
    btn.classList.toggle("hidden", remainingPending === 0);
  }
}

export function renderReview(result, criteria, onScoreInput) {
  const rubricContainer = $("projectRubricEditor");
  const feedbackInput = $("projectFeedbackInput");
  const flagsEl = $("projectFlags");

  if (rubricContainer) {
    clearElement(rubricContainer);

    for (const crit of criteria) {
      const score = result.rubric?.[crit.key] ?? crit.min;
      const reasoningText = result.reasoning?.[crit.key] || "";

      const row = document.createElement("div");
      row.className = "rubric-item";
      row.style.marginBottom = "14px";
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div>
            <strong style="color: #0f172a; font-size: 14px;">${escapeHtml(crit.label)}</strong>
            <span style="font-size: 12px; color: #64748b; margin-left: 6px;">(${escapeHtml(crit.description)})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <input type="number" id="project_score_${crit.key}" min="${crit.min}" max="${crit.max}" value="${score}"
              style="width: 65px; padding: 6px; font-weight: 700; font-size: 15px; text-align: center; border: 1px solid #cbd5e1; border-radius: 6px;" />
            <span style="font-size: 13px; font-weight: 600; color: #64748b;">/ ${crit.max}</span>
          </div>
        </div>
        <div style="font-size: 12px; color: #475569; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #8b5cf6;">
          ${escapeHtml(reasoningText)}
        </div>
      `;

      row.querySelector(`#project_score_${crit.key}`)?.addEventListener("input", onScoreInput);

      rubricContainer.appendChild(row);
    }
  }

  setTotal(result.marks);

  if (feedbackInput) {
    feedbackInput.value = result.feedback || "";
  }

  if (flagsEl) {
    if (result.flags && result.flags.length > 0) {
      flagsEl.classList.remove("hidden");
      flagsEl.innerHTML = result.flags.map((f) => `<span class="flag-pill">${escapeHtml(f)}</span>`).join(" ");
    } else {
      flagsEl.classList.add("hidden");
    }
  }
}

export function showReviewSection() {
  show($("projectReviewSection"));
}

export function readRubricTotal(criteria) {
  let sum = 0;
  for (const crit of criteria) {
    const val = parseInt($(`project_score_${crit.key}`)?.value, 10);
    if (!isNaN(val)) sum += val;
  }
  return sum;
}

export function setTotal(total) {
  const el = $("projectTotalMarks");
  if (el) el.textContent = `${total} / ${PROJECT_MAX_MARKS}`;
}

export function getFeedback() {
  return $("projectFeedbackInput")?.value ?? "";
}

export function setSaveButtonsDisabled(disabled) {
  const saveBtn = $("projectSaveButton");
  const saveNextBtn = $("projectSaveNextButton");
  if (saveBtn) saveBtn.disabled = disabled;
  if (saveNextBtn) saveNextBtn.disabled = disabled;
}

export function showQueueView() {
  hide($("projectDetailSection"));
  hide($("projectReviewSection"));
  show($("projectQueueSection"));
}

export function bindProjectEvents(handlers) {
  $("projectTermSelect")?.addEventListener("change", handlers.onTermChange);
  $("projectClassSelect")?.addEventListener("change", handlers.onClassChange);
  $("loadProjectSubmissionsButton")?.addEventListener("click", handlers.onLoad);
  $("projectStatusFilter")?.addEventListener("change", handlers.onFilterChange);
  $("bulkEvaluateProjectButton")?.addEventListener("click", handlers.onBatch);
  $("projectBackButton")?.addEventListener("click", handlers.onBack);
  $("aiEvaluateProjectButton")?.addEventListener("click", handlers.onEvaluate);
  $("projectSaveButton")?.addEventListener("click", () => handlers.onSave({ andNext: false }));
  $("projectSaveNextButton")?.addEventListener("click", () => handlers.onSave({ andNext: true }));
}
