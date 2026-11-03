import { clearElement, getElement, hide, show, showMessage } from "../core/dom.js";

// =====================================================
// SHEET ATTENDANCE VIEW (load classes, preview, submit)
// =====================================================

export const attendanceElements = {
  get modeSelect() { return getElement("modeSelect"); },
  get dateField() { return getElement("dateField"); },
  get dateInput() { return getElement("dateInput"); },
  get loadClassesButton() { return getElement("loadClassesButton"); },
  get classSection() { return getElement("classSection"); },
  get classSelect() { return getElement("classSelect"); },
  get previewButton() { return getElement("previewButton"); },
  get previewSection() { return getElement("previewSection"); },
  get previewInfo() { return getElement("previewInfo"); },
  get validationMessage() { return getElement("validationMessage"); },
  get absenteesSection() { return getElement("absenteesSection"); },
  get absenteesList() { return getElement("absenteesList"); },
  get invalidSection() { return getElement("invalidSection"); },
  get invalidList() { return getElement("invalidList"); },
  get submitButton() { return getElement("submitButton"); },
  get resultSection() { return getElement("resultSection"); },
  get resultOutput() { return getElement("resultOutput"); },
};

const el = attendanceElements;

function appendSummaryLine(container, label, value, bold = false) {
  const line = document.createElement("div");

  if (bold) {
    const strong = document.createElement("strong");

    strong.textContent = `${label}: ${value}`;

    line.appendChild(strong);
  } else {
    line.textContent = `${label}: ${value}`;
  }

  container.appendChild(line);
}

function appendSpacer(container) {
  const spacer = document.createElement("div");

  spacer.className = "summary-spacer";

  spacer.style.height = "12px";

  container.appendChild(spacer);
}

export function toggleDateField(isHistorical) {
  el.dateField.classList.toggle("hidden", !isHistorical);
}

export function resetForClassLoad() {
  hide(el.classSection);

  hide(el.previewSection);

  hide(el.resultSection);
}

/**
 * `statusOf(session)` returns "" | " | LOCKED" | " | MARKED".
 */
export function renderSessionOptions(sessions, statusOf) {
  clearElement(el.classSelect);

  sessions.forEach((session, index) => {
    const option = document.createElement("option");

    option.value = String(index);

    option.textContent =
      `${session.subjectCode ?? "Subject"} | ` +
      `${session.sectionCode ?? "Section"} | ` +
      `${session.startTime ?? ""}-${session.endTime ?? ""}` +
      statusOf(session);

    el.classSelect.appendChild(option);
  });

  show(el.classSection);
}

export function getSelectedSessionIndex() {
  return Number(el.classSelect.value);
}

export function resetPreview() {
  hide(el.submitButton);

  clearElement(el.validationMessage);

  hide(el.absenteesSection);

  hide(el.invalidSection);

  clearElement(el.absenteesList);

  clearElement(el.invalidList);
}

export function renderPreviewSummary({ session, attendanceDate, sheetName, roster, result }) {
  const info = el.previewInfo;

  clearElement(info);

  const subject = document.createElement("strong");

  subject.textContent = session.subjectName ?? session.subjectCode ?? "Attendance";

  info.appendChild(subject);

  appendSpacer(info);

  appendSummaryLine(info, "Section", session.sectionCode ?? "—");

  appendSummaryLine(info, "Date", attendanceDate);

  appendSummaryLine(info, "Time", `${session.startTime ?? "—"} - ${session.endTime ?? "—"}`);

  appendSummaryLine(info, "Sheet", sheetName);

  appendSpacer(info);

  appendSummaryLine(info, "ERP Roster", roster.length);

  appendSummaryLine(info, "Matched", result.matched.length);

  appendSummaryLine(info, "Sheet Only", result.sheetOnly.length);

  appendSummaryLine(info, "ERP Only", result.erpOnly.length);

  appendSpacer(info);

  appendSummaryLine(info, "Present", result.present, true);

  appendSummaryLine(info, "Absent", result.absent, true);

  appendSummaryLine(info, "No Class", result.noClass.length);

  appendSummaryLine(info, "Invalid", result.invalid.length);
}

function renderStudentList(target, students, formatter) {
  clearElement(target);

  for (const student of students) {
    const div = document.createElement("div");

    div.className = "student-row";

    div.textContent = formatter(student);

    target.appendChild(div);
  }
}

export function renderAbsentees(absentees) {
  if (absentees.length === 0) {
    return;
  }

  renderStudentList(
    el.absenteesList,
    absentees,
    (student) => `${student.registrationNo} | ${student.name || "Student"}`,
  );

  show(el.absenteesSection);
}

export function renderInvalidStudents(invalid) {
  if (invalid.length === 0) {
    return;
  }

  renderStudentList(el.invalidList, invalid, (student) => {
    const rawValue = String(student.rawAttendance ?? "").trim();

    return (
      `${student.registrationNo} | ` +
      `${student.name || "Student"} | ` +
      `Value: ${rawValue ? `"${rawValue}"` : "[BLANK]"}`
    );
  });

  show(el.invalidSection);
}

export function renderValidation({ type, lines, canSubmit }) {
  showMessage(el.validationMessage, type, lines);

  if (canSubmit) {
    show(el.submitButton);
  }
}

export function showPreviewSection() {
  show(el.previewSection);
}

export function showPreviewError(message) {
  show(el.previewSection);

  clearElement(el.previewInfo);

  showMessage(el.validationMessage, "error", [message]);
}

export function showSubmitResult(type, lines) {
  show(el.resultSection);

  showMessage(el.resultOutput, type, lines);
}

export function hideSubmitButton() {
  hide(el.submitButton);
}
