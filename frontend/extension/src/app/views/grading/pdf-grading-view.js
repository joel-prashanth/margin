import { clearElement, createOption, escapeHtml, getElement, hide, hideStatus, setStatus, show } from "../../core/dom.js";

// =====================================================
// PDF GRADING VIEW (shared by Lab and Essay)
// Class/assessment pickers, submission queue, detail
// pane, rubric review and batch status. Each module
// supplies element ids, copy and a rubric row renderer.
// =====================================================

const PDF_READY_STYLE =
  "display: inline-block; margin-left: 8px; font-size: 11px; padding: 2px 6px; background: #e0f2fe; color: #0369a1; border-radius: 4px; font-weight: 600;";

const NO_PDF_STYLE =
  "display: inline-block; margin-left: 8px; font-size: 11px; padding: 2px 6px; background: #fee2e2; color: #b91c1c; border-radius: 4px;";

/**
 * config: { ids, text, renderRubricRow(criterion, rubric, reasoning, onChange) }
 */
export function createPdfGradingView({ ids, text, renderRubricRow }) {
  const $ = (key) => getElement(ids[key]);

  function reset() {
    hide($("detailSection"));
    hide($("reviewSection"));

    const queueSummary = $("queueSummary");
    if (queueSummary) queueSummary.textContent = "";

    clearElement($("submissionList"));
    hideStatus($("saveStatus"));
    hideStatus($("aiStatus"));
  }

  function renderClassOptions(classes) {
    const select = $("classSelect");
    if (!select) return;

    clearElement(select);

    if (classes.length === 0) {
      select.appendChild(createOption("", text.noClasses));
      select.disabled = true;
      return;
    }

    select.appendChild(createOption("", "— Select a Class —"));

    for (const c of classes) {
      select.appendChild(createOption(c.key, c.label));
    }

    select.disabled = false;
    if (classes.length === 1) {
      select.value = classes[0].key;
    }
  }

  /**
   * `selectedClass` is undefined when no class key is selected.
   */
  function renderAssessmentOptions(selectedKey, selectedClass, assessments) {
    const assessSelect = $("assessmentSelect");
    const loadButton = $("loadButton");
    const assessStatus = $("assessmentStatus");
    if (!assessSelect) return;

    clearElement(assessSelect);

    if (!selectedKey) {
      assessSelect.appendChild(createOption("", "Select a class first"));
      assessSelect.disabled = true;
      if (loadButton) loadButton.disabled = true;
      return;
    }

    if (assessments.length === 0) {
      assessSelect.appendChild(createOption("", text.noAssessments));
      assessSelect.disabled = true;
      if (loadButton) loadButton.disabled = true;
      if (assessStatus) assessStatus.textContent = text.noAssessmentsStatus;
      return;
    }

    assessSelect.appendChild(createOption("", text.assessmentPlaceholder));

    for (const a of assessments) {
      const tag = a.hasPdf ? " [📄 PDF Attached]" : "";
      assessSelect.appendChild(
        createOption(
          a.assessmentId,
          `${a.title || text.defaultTitle} (${a.pending} pending / ${a.total} total)${tag}`,
        ),
      );
    }

    assessSelect.disabled = false;
    if (assessments.length === 1) {
      assessSelect.value = assessments[0].assessmentId;
    }

    if (loadButton) {
      loadButton.disabled = !assessSelect.value;
    }

    if (assessStatus) {
      assessStatus.textContent = text.assessmentsFound(assessments.length, selectedClass.label);
    }
  }

  function renderQueue(filtered, counts, onSelect) {
    const list = $("submissionList");
    const summary = $("queueSummary");
    const bulkButton = $("bulkButton");

    if (!list) return;
    clearElement(list);

    if (summary) {
      summary.textContent = `Total: ${counts.total} | Pending: ${counts.pending} | Evaluated: ${counts.evaluated}`;
    }

    if (bulkButton) {
      bulkButton.classList.toggle("hidden", counts.pending === 0);
      bulkButton.textContent = `⚡ 1-Click Batch AI Evaluation (${counts.pending} Pending)`;
    }

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "journal-empty-state";
      empty.textContent = text.emptyQueue;
      list.appendChild(empty);
      return;
    }

    for (const sub of filtered) {
      list.appendChild(renderSubmissionCard(sub, onSelect));
    }
  }

  function renderSubmissionCard(sub, onSelect) {
    const card = document.createElement("div");
    card.className = "journal-submission-card";

    const info = document.createElement("div");
    info.className = "journal-submission-info";

    const name = document.createElement("div");
    name.className = "journal-student-name";
    name.textContent = sub.studentName;

    const meta = document.createElement("div");
    meta.className = "journal-student-meta";
    const dateStr = sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : "Date N/A";
    meta.textContent = `Roll: ${sub.rollNumber} • Submitted: ${dateStr}`;

    const statusBadge = document.createElement("span");
    statusBadge.className = `journal-status ${sub.status.toLowerCase()}`;
    statusBadge.textContent =
      sub.status === "EVALUATED" ? `✓ Evaluated (${sub.marks}/${sub.maxMarks})` : "Pending Evaluation";

    const pdfBadge = document.createElement("span");
    pdfBadge.style.cssText = sub.pdfUrl ? PDF_READY_STYLE : NO_PDF_STYLE;
    pdfBadge.textContent = sub.pdfUrl ? text.pdfReadyBadge : "⚠️ No PDF Attachment";

    const badgeContainer = document.createElement("div");
    badgeContainer.append(statusBadge, pdfBadge);

    info.append(name, meta, badgeContainer);

    const actionRow = document.createElement("div");
    actionRow.style.cssText = "display: flex; gap: 8px; align-items: center;";

    if (sub.pdfUrl) {
      const viewPdfLink = document.createElement("a");
      viewPdfLink.href = sub.pdfUrl;
      viewPdfLink.target = "_blank";
      viewPdfLink.rel = "noopener noreferrer";
      viewPdfLink.className = "secondary";
      viewPdfLink.style.cssText =
        "padding: 8px 12px; font-size: 12px; text-decoration: none; display: inline-flex; align-items: center; border-radius: 8px; border: 1px solid #cbd5e1; color: #334155;";
      viewPdfLink.textContent = "Open PDF ↗";
      actionRow.appendChild(viewPdfLink);
    }

    const openBtn = document.createElement("button");
    openBtn.className = "journal-open-button primary";
    openBtn.textContent = sub.status === "EVALUATED" ? "Review / Re-grade" : "Grade with AI";
    openBtn.addEventListener("click", () => onSelect(sub));
    actionRow.appendChild(openBtn);

    card.append(info, actionRow);
    return card;
  }

  function showDetail(sub) {
    hide($("queueSection"));
    show($("detailSection"));
    hide($("reviewSection"));

    const nameEl = $("studentName");
    const metaEl = $("studentMeta");
    const pdfContainer = $("pdfContainer");

    if (nameEl) nameEl.textContent = sub.studentName;
    if (metaEl) {
      metaEl.textContent = `Roll No: ${sub.rollNumber} | Status: ${sub.status} | Marks: ${sub.marks ?? "N/A"}/${sub.maxMarks}`;
    }

    if (!pdfContainer) return;

    clearElement(pdfContainer);

    if (!sub.pdfUrl) {
      const noPdf = document.createElement("div");
      noPdf.className = "warning-message";
      noPdf.textContent = "This submission contains no PDF attachment.";
      pdfContainer.appendChild(noPdf);
      return;
    }

    const linkBox = document.createElement("div");
    linkBox.style.cssText =
      "padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; display: flex; justify-content: space-between; align-items: center;";

    const linkText = document.createElement("div");
    const filename = sub.pdfUrl.split("?")[0].split("/").pop() || "submission.pdf";
    linkText.innerHTML = `<strong>${text.pdfLabel}</strong> <span style="font-family: monospace; font-size: 12px;${text.pdfFilenameColor ? ` color: ${text.pdfFilenameColor};` : ""}">${escapeHtml(filename)}</span>`;

    const viewLink = document.createElement("a");
    viewLink.href = sub.pdfUrl;
    viewLink.target = "_blank";
    viewLink.rel = "noopener noreferrer";
    viewLink.className = "primary";
    viewLink.style.cssText =
      "padding: 8px 16px; border-radius: 8px; text-decoration: none; font-weight: bold; background: #2563eb; color: white;";
    viewLink.textContent = "View PDF Document ↗";

    linkBox.append(linkText, viewLink);
    pdfContainer.appendChild(linkBox);
  }

  function showQueueView() {
    hide($("detailSection"));
    hide($("reviewSection"));
    show($("queueSection"));
  }

  function renderReview(result, criteria, maxMarks, onRubricChange) {
    const reviewSection = $("reviewSection");
    const rubricEditor = $("rubricEditor");
    const feedbackInput = $("feedbackInput");
    const flagsEl = $("flags");

    if (!reviewSection || !rubricEditor) return;

    clearElement(rubricEditor);

    const rubric = result.rubric || {};
    const reasoning = result.reasoning || {};

    for (const crit of criteria) {
      rubricEditor.appendChild(renderRubricRow(crit, rubric, reasoning, onRubricChange));
    }

    if (feedbackInput) {
      feedbackInput.value = result.feedback || "";
    }

    setTotal(result.marks, maxMarks);

    if (flagsEl) {
      clearElement(flagsEl);
      if (result.flags && result.flags.length > 0) {
        flagsEl.className = "warning-message";
        flagsEl.innerHTML = `<strong>Notes / Flags:</strong><br>${result.flags.map(escapeHtml).join("<br>")}`;
        flagsEl.classList.remove("hidden");
      } else {
        flagsEl.classList.add("hidden");
      }
    }

    reviewSection.classList.remove("hidden");
    reviewSection.scrollIntoView({ behavior: "smooth" });
  }

  /**
   * Returns { rubric, total } from the rubric editor selects.
   */
  function readRubric() {
    const rubric = {};
    let total = 0;

    $("rubricEditor")?.querySelectorAll("select").forEach((sel) => {
      const val = Number(sel.value || 0);
      rubric[sel.dataset.criterionKey] = val;
      total += val;
    });

    return { rubric, total };
  }

  function setTotal(total, maxMarks) {
    const totalMarksEl = $("totalMarks");
    if (totalMarksEl) {
      totalMarksEl.textContent = `${total} / ${maxMarks}`;
    }
  }

  function setAiBusy(busy, busyText, idleText) {
    const btn = $("aiButton");
    if (!btn) return;
    btn.disabled = busy;
    if (busyText && idleText) {
      btn.textContent = busy ? busyText : idleText;
    }
  }

  function setSaveButtonsDisabled(disabled) {
    const saveBtn = $("saveButton");
    const saveNextBtn = $("saveNextButton");
    if (saveBtn) saveBtn.disabled = disabled;
    if (saveNextBtn) saveNextBtn.disabled = disabled;
  }

  function setLoadBusy(busy) {
    const loadButton = $("loadButton");
    if (!loadButton) return;
    loadButton.disabled = busy;
    loadButton.textContent = busy ? "Loading Submissions..." : text.loadButtonLabel;
  }

  function startBatch(total) {
    const bulkButton = $("bulkButton");
    const bulkStatus = $("bulkStatus");
    if (bulkButton) bulkButton.disabled = true;
    if (bulkStatus) {
      bulkStatus.classList.remove("hidden");
      bulkStatus.className = "info-message";
      bulkStatus.textContent = `Starting Batch Evaluation (0 / ${total})...`;
    }
  }

  function setBatchHtml(html) {
    const bulkStatus = $("bulkStatus");
    if (bulkStatus) bulkStatus.innerHTML = html;
  }

  function setBulkButtonText(label) {
    const bulkButton = $("bulkButton");
    if (bulkButton) bulkButton.textContent = label;
  }

  function finishBatch(html, failCount, label) {
    const bulkButton = $("bulkButton");
    const bulkStatus = $("bulkStatus");
    if (bulkStatus) {
      bulkStatus.className = failCount === 0 ? "success-message" : "warning-message";
      bulkStatus.innerHTML = html;
    }
    if (bulkButton) {
      bulkButton.disabled = false;
      bulkButton.textContent = label;
    }
  }

  function bind(handlers) {
    $("termSelect")?.addEventListener("change", handlers.onTermChange);
    $("classSelect")?.addEventListener("change", handlers.onClassChange);
    $("assessmentSelect")?.addEventListener("change", handlers.onAssessmentChange);
    $("loadButton")?.addEventListener("click", handlers.onLoad);
    $("statusFilter")?.addEventListener("change", handlers.onFilterChange);
    $("backButton")?.addEventListener("click", handlers.onBack);
    $("aiButton")?.addEventListener("click", handlers.onEvaluate);
    $("regenerateButton")?.addEventListener("click", handlers.onEvaluate);
    $("saveButton")?.addEventListener("click", () => handlers.onSave({ moveNext: false }));
    $("saveNextButton")?.addEventListener("click", () => handlers.onSave({ moveNext: true }));
    $("bulkButton")?.addEventListener("click", handlers.onBatch);
  }

  return {
    reset,
    renderClassOptions,
    renderAssessmentOptions,
    renderQueue,
    showDetail,
    showQueueView,
    renderReview,
    readRubric,
    setTotal,
    setAiBusy,
    setSaveButtonsDisabled,
    setLoadBusy,
    startBatch,
    setBatchHtml,
    setBulkButtonText,
    finishBatch,
    bind,
    showQueueSection: () => show($("queueSection")),
    setQueueSummary: (value) => {
      const el = $("queueSummary");
      if (el) el.textContent = value;
    },
    setClassStatus: (value) => {
      const el = $("classStatus");
      if (el) el.textContent = value;
    },
    setAiStatus: (className, value) => setStatus($("aiStatus"), className, value),
    setSaveStatus: (className, value) => setStatus($("saveStatus"), className, value),
    setLoadEnabled: (enabled) => {
      const btn = $("loadButton");
      if (btn) btn.disabled = !enabled;
    },
    getTermFilter: () => $("termSelect")?.value || "TERM2",
    getSelectedClassKey: () => $("classSelect")?.value,
    getSelectedAssessmentId: () => $("assessmentSelect")?.value,
    getStatusFilter: () => $("statusFilter")?.value || "ALL",
    getFeedback: () => $("feedbackInput")?.value || "",
  };
}
