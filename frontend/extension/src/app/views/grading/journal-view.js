import { clearElement, createOption, getElement, hide, show } from "../../core/dom.js";
import { formatTimeSpent } from "../../models/grading/journal-submission.js";

// =====================================================
// REFLECTIVE JOURNAL VIEW
// =====================================================

const $ = getElement;

export function getTermFilter() {
  return $("journalTermSelect")?.value || "TERM2";
}

export function getSelectedClassKey() {
  return $("journalClassSelect")?.value;
}

export function getSelectedAssessmentId() {
  return $("journalAssessmentId")?.value;
}

export function getStatusFilter() {
  return $("journalStatusFilter")?.value ?? "ALL";
}

export function setLoadEnabled(enabled) {
  const button = $("loadJournalSubmissionsButton");
  if (button) button.disabled = !enabled;
}

export function setClassStatus(text) {
  $("journalClassStatus").textContent = text;
}

export function setAssessmentStatus(text) {
  const el = $("journalAssessmentStatus");
  if (el) el.textContent = text;
}

export function resetJournalView() {
  hide($("journalQueueSection"));
  hide($("journalDetailSection"));
  hide($("journalReviewSection"));

  const queueSummary = $("journalQueueSummary");
  if (queueSummary) queueSummary.textContent = "";

  clearElement($("journalSubmissionList"));

  for (const id of ["journalSaveStatus", "journalAiStatus"]) {
    const el = $(id);
    if (el) {
      el.textContent = "";
      el.classList.add("hidden");
    }
  }
}

export function showQueueView() {
  hide($("journalDetailSection"));
  hide($("journalReviewSection"));
  show($("journalQueueSection"));
}

// ---------- Class / assessment pickers ----------

/**
 * Restores the previous class when present. Returns false when empty.
 */
export function renderClassOptions(classes, { cached = false } = {}) {
  const select = $("journalClassSelect");
  const previousValue = select?.value;

  clearElement(select);

  if (!classes.length) {
    select.appendChild(createOption("", "No Reflective Journal classes found"));
    select.disabled = true;
    setClassStatus("No classes with Reflective Journal assessments were detected.");
    return false;
  }

  for (const journalClass of classes) {
    select.appendChild(
      createOption(journalClass.key, `${journalClass.subjectCode || "Subject"} • ${journalClass.sectionCode}`),
    );
  }

  const oldIndex = classes.findIndex((item) => item.key === previousValue);

  select.selectedIndex = oldIndex >= 0 ? oldIndex : 0;
  select.disabled = false;

  setClassStatus(
    cached
      ? `${classes.length} class(es) loaded from cache.`
      : `${classes.length} class(es) with Reflective Journal assessments detected.`,
  );

  return true;
}

/**
 * `titleOf(assessment)` provides the display title.
 */
export function renderAssessmentOptions(journalClass, titleOf) {
  const select = $("journalAssessmentId");
  const loadButton = $("loadJournalSubmissionsButton");
  const previousAssessmentId = select?.value;

  clearElement(select);

  if (!journalClass || !journalClass.assessments.length) {
    select.appendChild(createOption("", "No Reflective Journals found"));
    select.disabled = true;
    loadButton.disabled = true;
    setAssessmentStatus("No Reflective Journal assessment was found for this class.");
    return;
  }

  for (const assessment of journalClass.assessments) {
    select.appendChild(
      createOption(
        assessment.assessmentId,
        `${titleOf(assessment)} — ${assessment.pending} pending • ${assessment.evaluated} evaluated`,
      ),
    );
  }

  const oldIndex = journalClass.assessments.findIndex(
    (assessment) => assessment.assessmentId === previousAssessmentId,
  );

  select.selectedIndex = oldIndex >= 0 ? oldIndex : 0;
  select.disabled = false;
  loadButton.disabled = false;
}

export function showDiscoveryLoading() {
  const classSelect = $("journalClassSelect");
  const assessmentSelect = $("journalAssessmentId");

  classSelect.disabled = true;
  assessmentSelect.disabled = true;
  $("loadJournalSubmissionsButton").disabled = true;

  setClassStatus("Reading Reflective Journals from Aurora ERP...");
  setAssessmentStatus("Detecting assessments...");

  classSelect.replaceChildren(createOption("", "Detecting classes..."));
  assessmentSelect.replaceChildren(createOption("", "Detecting assessments..."));
}

export function showDiscoveryError(message) {
  const classSelect = $("journalClassSelect");
  const assessmentSelect = $("journalAssessmentId");

  classSelect.replaceChildren(createOption("", "Unable to detect classes"));
  assessmentSelect.replaceChildren(createOption("", "Unable to detect assessments"));

  classSelect.disabled = true;
  assessmentSelect.disabled = true;
  $("loadJournalSubmissionsButton").disabled = true;

  setClassStatus(message);
  setAssessmentStatus("Assessment detection failed.");
}

export function setLoadBusy(busy) {
  const loadButton = $("loadJournalSubmissionsButton");
  loadButton.disabled = busy;
  loadButton.textContent = busy ? "Loading..." : "Load Submissions";
}

// ---------- Queue ----------

function statusLabel(submission, saving) {
  if (saving) return "Saving to ERP…";
  if (submission.status === "SUBMITTED") return "Pending Evaluation";
  if (submission.status === "EVALUATED") return "Evaluated";
  if (submission.status === "NOT_SUBMITTED") return "Not Submitted";
  return submission.status ?? "UNKNOWN";
}

export function renderQueue({ counts, visible, savingIds, onOpen }) {
  const list = $("journalSubmissionList");
  const summary = $("journalQueueSummary");

  clearElement(list);

  summary.textContent =
    `${counts.total} students • ` +
    `${counts.pending} pending evaluation • ` +
    `${counts.evaluated} evaluated • ` +
    `${counts.notSubmitted} not submitted`;

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.textContent = "No submissions found for this filter.";
    list.appendChild(empty);
    return;
  }

  for (const submission of visible) {
    const saving = savingIds.has(submission.id);

    const card = document.createElement("div");
    card.className = "journal-submission-card";

    const left = document.createElement("div");

    const name = document.createElement("div");
    name.className = "journal-student-name";
    name.textContent = submission.studentName || "Student";

    const meta = document.createElement("div");
    meta.className = "journal-student-meta";
    meta.textContent = submission.registrationNo || "No registration number";

    if (submission.marksObtained !== null && submission.marksObtained !== undefined) {
      meta.textContent += ` • ${submission.marksObtained}/20`;
    }

    const status = document.createElement("div");
    status.className = `journal-status ${String(submission.status ?? "").toLowerCase()}`;
    status.textContent = statusLabel(submission, saving);

    left.append(name, meta, status);

    const button = document.createElement("button");
    button.className = "secondary";
    button.type = "button";
    button.textContent = submission.status === "EVALUATED" ? "View" : "Open";
    button.disabled = saving;
    button.addEventListener("click", () => onOpen(submission));

    card.append(left, button);
    list.appendChild(card);
  }
}

/**
 * `count` null hides the button (ambiguous "All" filter).
 */
export function updateBulkButton(filter, count) {
  const bulkBtn = $("bulkEvaluateButton");
  if (!bulkBtn) return;

  if (count === null || count === 0) {
    bulkBtn.classList.add("hidden");
    return;
  }

  bulkBtn.textContent =
    filter === "EVALUATED"
      ? `Re-evaluate ${count} Evaluated Journals`
      : `Bulk Evaluate ${count} Pending Journals`;
  bulkBtn.classList.remove("hidden");
}

// ---------- Detail ----------

function addMeta(container, label, value) {
  const item = document.createElement("div");
  item.className = "journal-meta-item";

  const heading = document.createElement("div");
  heading.className = "journal-meta-label";
  heading.textContent = label;

  const content = document.createElement("div");
  content.className = "journal-meta-value";
  content.textContent = value;

  item.append(heading, content);
  container.appendChild(item);
}

export function showDetail(submission, completeness, criteria) {
  hide($("journalQueueSection"));
  show($("journalDetailSection"));
  hide($("journalReviewSection"));

  const saveStatus = $("journalSaveStatus");
  if (saveStatus) {
    saveStatus.textContent = "";
    saveStatus.classList.add("hidden");
    delete saveStatus.dataset.state;
  }

  $("journalStudentName").textContent = submission.studentName || "Unknown Student";
  $("journalStudentMeta").textContent = submission.registrationNo || "";

  const metadata = $("journalMetadata");
  clearElement(metadata);

  addMeta(metadata, "Status", submission.status ?? "UNKNOWN");
  addMeta(metadata, "Word Count", String(submission.content?.wordCount ?? 0));
  addMeta(metadata, "Time Spent", formatTimeSpent(submission.content?.timeSpent ?? 0));
  addMeta(metadata, "Violations", String(submission.content?.violations ?? 0));
  addMeta(metadata, "Response Completeness", `${completeness.completed} / ${completeness.total} sections`);

  const contentContainer = $("journalContent");
  clearElement(contentContainer);

  for (const criterion of criteria) {
    const key = criterion.contentKey ?? criterion.key;

    const section = document.createElement("div");
    section.className = "journal-response-card";

    const heading = document.createElement("h3");
    heading.textContent = criterion.label;

    const body = document.createElement("p");
    body.textContent = submission.content?.[key] || "No response provided.";

    section.append(heading, body);
    contentContainer.appendChild(section);
  }

  const aiStatus = $("journalAiStatus");
  aiStatus.textContent = "";
  aiStatus.classList.add("hidden");

  let notice = null;

  if (submission.status === "EVALUATED") {
    notice = "Already evaluated. You can re-evaluate with AI and save to overwrite.";
  } else if (submission.status === "NOT_SUBMITTED") {
    notice = "This student has not submitted this Reflective Journal.";
  } else if (completeness.missing.length > 0) {
    notice = `Partial journal submission: ${completeness.completed}/${completeness.total} sections contain responses. Missing: ${completeness.missing.join(", ")}.`;
  }

  if (notice) {
    setAiStatus("warning-message", notice);
  }
}

export function renderExistingEvaluation(submission, criteria) {
  const section = $("journalExistingEvaluation");
  const container = $("journalExistingEvaluationContent");

  if (!section || !container) return;

  clearElement(container);

  const evaluation = submission?.evaluation;

  const hasEvaluation =
    submission?.status === "EVALUATED" ||
    Boolean(evaluation) ||
    (submission?.marksObtained !== null && submission?.marksObtained !== undefined);

  if (!hasEvaluation) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");

  const marksLine = document.createElement("p");
  marksLine.textContent = `Marks: ${submission?.marksObtained ?? evaluation?.marks ?? "—"}/20`;
  container.appendChild(marksLine);

  const rubric = evaluation?.rubric;

  if (rubric) {
    for (const criterion of criteria) {
      const line = document.createElement("p");
      line.textContent = `${criterion.label}: ${rubric[criterion.key] ?? "—"} / 4`;
      container.appendChild(line);
    }
  }

  const feedback = submission?.feedback ?? evaluation?.feedback;

  if (feedback) {
    const heading = document.createElement("strong");
    heading.textContent = "Feedback";

    const paragraph = document.createElement("p");
    paragraph.textContent = feedback;

    container.append(heading, paragraph);
  }
}

export function setAiStatus(className, text) {
  const aiStatus = $("journalAiStatus");
  aiStatus.className = className;
  aiStatus.textContent = text;
  aiStatus.classList.remove("hidden");
}

// ---------- Grading buttons / save status ----------

export function setGradingButtons({ gradeable, saving, saveEnabled }) {
  const aiButton = $("aiEvaluateJournalButton");
  const regenerateButton = $("journalRegenerateButton");
  const saveButton = $("journalSaveButton");
  const saveNextButton = $("journalSaveNextButton");

  if (aiButton) aiButton.disabled = !gradeable || saving;
  if (regenerateButton) regenerateButton.disabled = !gradeable || saving;
  if (saveButton) saveButton.disabled = !saveEnabled;
  if (saveNextButton) saveNextButton.disabled = !saveEnabled;
}

export function disableAiButtons() {
  $("aiEvaluateJournalButton").disabled = true;
  $("journalRegenerateButton").disabled = true;
}

/**
 * Availability messages never overwrite an active save result.
 */
export function showSaveAvailability(availability) {
  const status = $("journalSaveStatus");
  if (!status) return;

  if (availability.enabled) {
    if (status.dataset.state === "availability") {
      status.textContent = "";
      status.classList.add("hidden");
      delete status.dataset.state;
    }
    return;
  }

  if (status.dataset.state === "result") return;

  status.dataset.state = "availability";
  status.className = "warning-message";
  status.textContent = availability.reason;
  status.classList.remove("hidden");
}

export function showSaveResult(className, text) {
  const status = $("journalSaveStatus");
  status.dataset.state = "result";
  status.className = className;
  status.textContent = text;
  status.classList.remove("hidden");
}

// ---------- Review ----------

export function renderReview(result, criteria, onScoreInput) {
  const editor = $("journalRubricEditor");
  const flags = $("journalFlags");

  clearElement(editor);

  for (const criterion of criteria) {
    const row = document.createElement("div");
    row.className = "rubric-row";

    const title = document.createElement("div");
    title.className = "rubric-title";
    title.textContent = criterion.label;

    const scoreContainer = document.createElement("div");
    scoreContainer.className = "rubric-score";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "4";
    input.step = "1";
    input.value = String(result.rubric?.[criterion.key] ?? 0);
    input.dataset.rubricKey = criterion.key;
    input.addEventListener("input", onScoreInput);

    scoreContainer.appendChild(input);

    const reason = document.createElement("div");
    reason.className = "rubric-reason";
    reason.textContent = result.reasoning?.[criterion.key] || "No reasoning returned.";

    row.append(title, scoreContainer, reason);
    editor.appendChild(row);
  }

  $("journalFeedbackInput").value = result.feedback ?? "";

  clearElement(flags);

  if (Array.isArray(result.flags) && result.flags.length > 0) {
    const list = document.createElement("ul");

    for (const flag of result.flags) {
      const item = document.createElement("li");
      item.textContent = flag;
      list.appendChild(item);
    }

    flags.appendChild(list);
  } else {
    flags.textContent = "No specific AI review flags.";
  }

  show($("journalReviewSection"));
}

export function readRubricInputs() {
  const rubric = {};
  const inputs = $("journalRubricEditor")?.querySelectorAll("[data-rubric-key]") ?? [];

  for (const input of inputs) {
    rubric[input.dataset.rubricKey] = Number(input.value);
  }

  return rubric;
}

export function setTotal(total) {
  const element = $("journalTotalMarks");
  if (element) element.textContent = `${total} / 20`;
}

export function getFeedback() {
  return $("journalFeedbackInput")?.value ?? "";
}

export function scrollToDetail() {
  $("journalDetailSection")?.scrollIntoView({ behavior: "smooth" });
}

// ---------- Bulk ----------

/**
 * Returns { progress(text), log(text, ok), finish(className) }.
 */
export function startBulkLog() {
  const bulkStatus = $("bulkEvaluateStatus");
  const bulkButton = $("bulkEvaluateButton");
  if (bulkButton) bulkButton.disabled = true;

  clearElement(bulkStatus);

  const progressLine = document.createElement("div");
  progressLine.style.cssText = "font-weight:600;margin-bottom:8px;";

  const errorLog = document.createElement("div");
  errorLog.style.cssText = "font-size:12px;margin-top:6px;max-height:150px;overflow-y:auto;";

  bulkStatus?.append(progressLine, errorLog);

  if (bulkStatus) {
    bulkStatus.classList.remove("hidden");
    bulkStatus.className = "warning-message";
  }

  return {
    progress(text) {
      progressLine.textContent = text;
    },
    log(text, ok) {
      const line = document.createElement("div");
      line.style.color = ok ? "#166534" : "#dc2626";
      line.textContent = text;
      errorLog.appendChild(line);
    },
    finish(className) {
      if (bulkStatus) bulkStatus.className = className;
      if (bulkButton) bulkButton.disabled = false;
    },
  };
}

export function bindJournalEvents(handlers) {
  $("journalTermSelect")?.addEventListener("change", handlers.onTermChange);
  $("journalClassSelect")?.addEventListener("change", handlers.onClassChange);
  $("journalAssessmentId")?.addEventListener("change", handlers.onAssessmentChange);
  $("loadJournalSubmissionsButton")?.addEventListener("click", handlers.onLoad);
  $("journalStatusFilter")?.addEventListener("change", handlers.onFilterChange);
  $("journalBackButton")?.addEventListener("click", handlers.onBack);
  $("aiEvaluateJournalButton")?.addEventListener("click", handlers.onEvaluate);
  $("journalRegenerateButton")?.addEventListener("click", handlers.onEvaluate);
  $("journalSaveButton")?.addEventListener("click", () => handlers.onSave({ moveNext: false }));
  $("journalSaveNextButton")?.addEventListener("click", () => handlers.onSave({ moveNext: true }));
  $("bulkEvaluateButton")?.addEventListener("click", handlers.onBulk);
}
