import { setButtonBusy } from "../core/dom.js";
import { fetchSheet } from "../services/sheets-api.js";
import {
  getAttendanceDateValues,
  getHistoricalSessions,
  getRoster,
  getTodaySessions,
  submitAttendance,
} from "../services/erp-api.js";
import { assertErpIdentityAllowed, facultySession } from "../models/faculty-session.js";
import { matchAttendance } from "../models/attendance/matcher.js";
import {
  alreadyMarked,
  assertPreviewInputsValid,
  buildAttendancePayload,
  describeValidation,
  filterMappedSessions,
  getAbsentees,
  summarizeSubmitResponse,
} from "../models/attendance/attendance-session.js";
import {
  attendanceElements as el,
  getSelectedSessionIndex,
  hideSubmitButton,
  renderAbsentees,
  renderInvalidStudents,
  renderPreviewSummary,
  renderSessionOptions,
  renderValidation,
  resetForClassLoad,
  resetPreview,
  showPreviewError,
  showPreviewSection,
  showSubmitResult,
  toggleDateField,
} from "../views/attendance-view.js";

// =====================================================
// SHEET ATTENDANCE CONTROLLER
// Google Sheet -> ERP attendance: load sessions,
// dry-run preview, then submit.
// =====================================================

let sessions = [];

let selectedSession = null;

let previewState = null;

function sessionStatusSuffix(session) {
  if (session.isLocked) {
    return " | LOCKED";
  }

  return alreadyMarked(session) ? " | MARKED" : "";
}

async function loadClasses() {
  try {
    assertErpIdentityAllowed();

    setButtonBusy(el.loadClassesButton, true, "Loading...", "Load Classes");

    resetForClassLoad();

    previewState = null;

    if (el.modeSelect.value === "today") {
      sessions = await getTodaySessions();
    } else {
      if (!el.dateInput.value) {
        throw new Error("Select an attendance date.");
      }

      sessions = await getHistoricalSessions(el.dateInput.value);
    }

    sessions = filterMappedSessions(sessions, facultySession.profile);

    if (!sessions.length) {
      throw new Error("No mapped ERP classes were found for the selected date.");
    }

    renderSessionOptions(sessions, sessionStatusSuffix);
  } catch (error) {
    alert(error?.message ?? "Unable to load classes.");
  } finally {
    setButtonBusy(el.loadClassesButton, false, "Loading...", "Load Classes");
  }
}

async function previewAttendance() {
  try {
    assertErpIdentityAllowed();

    setButtonBusy(el.previewButton, true, "Loading Preview...", "Preview");

    resetPreview();

    selectedSession = sessions[getSelectedSessionIndex()];

    if (!selectedSession) {
      throw new Error("Select an ERP class.");
    }

    if (selectedSession.isLocked) {
      throw new Error("This ERP attendance session is locked.");
    }

    // Already-marked sessions may be overridden intentionally.

    const { attendanceDate, attendanceColumn } = getAttendanceDateValues(selectedSession.date);

    const { profile } = facultySession;

    const mapping = profile?.classMappings?.[selectedSession.sectionCode];

    if (!mapping) {
      throw new Error("Verified class mapping was not found.");
    }

    const [rows, roster] = await Promise.all([
      fetchSheet({ spreadsheetId: profile.spreadsheetId, sheetName: mapping.sheetName }),
      getRoster(selectedSession.sectionId, selectedSession.courseOfferingId),
    ]);

    assertPreviewInputsValid({ rows, roster, attendanceColumn });

    const result = matchAttendance({ rows, roster, attendanceColumn });

    previewState = {
      session: selectedSession,
      attendanceDate,
      attendanceColumn,
      sheetName: mapping.sheetName,
      roster,
      result,
    };

    renderPreviewSummary(previewState);

    renderAbsentees(getAbsentees(result));

    renderInvalidStudents(result.invalid);

    renderValidation(describeValidation(result));

    showPreviewSection();
  } catch (error) {
    showPreviewError(error?.message ?? "Unable to preview attendance.");
  } finally {
    setButtonBusy(el.previewButton, false, "Loading Preview...", "Preview");
  }
}

async function submitPreviewedAttendance() {
  try {
    assertErpIdentityAllowed();

    if (!previewState?.result?.safe) {
      throw new Error("Attendance has not passed validation.");
    }

    const { session, attendanceDate, result } = previewState;

    const confirmed = confirm(
      [
        "Submit attendance to Aurora ERP?",
        "",
        `Faculty: ${facultySession.detectedFacultyName}`,
        `Subject: ${session.subjectName}`,
        `Section: ${session.sectionCode}`,
        `Date: ${attendanceDate}`,
        `Present: ${result.present}`,
        `Absent: ${result.absent}`,
        `Total: ${result.records.length}`,
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    setButtonBusy(el.submitButton, true, "Submitting...", "Submit Attendance");

    const response = await submitAttendance(
      buildAttendancePayload({ session, attendanceDate, result }),
    );

    const summary = summarizeSubmitResponse(response, result);

    const { totalStudents, presentCount, absentCount } = summary;

    if (!summary.countsMatch) {
      showSubmitResult("error", [
        "ERP saved attendance, but the returned counts do not match the preview.",
        `ERP Total: ${Number.isFinite(totalStudents) ? totalStudents : "Unknown"}`,
        `ERP Present: ${Number.isFinite(presentCount) ? presentCount : "Unknown"}`,
        `ERP Absent: ${Number.isFinite(absentCount) ? absentCount : "Unknown"}`,
      ]);

      return;
    }

    showSubmitResult("success", [
      "✓ Attendance Submitted Successfully",
      `ERP Total: ${totalStudents}`,
      `ERP Present: ${presentCount}`,
      `ERP Absent: ${absentCount}`,
      "ERP response matches the Google Sheet preview.",
    ]);

    selectedSession.id = summary.data?.id ?? selectedSession.id ?? "submitted";

    selectedSession.totalStudents = totalStudents;

    selectedSession.presentCount = presentCount;

    selectedSession.absentCount = absentCount;

    previewState = null;

    hideSubmitButton();
  } catch (error) {
    showSubmitResult("error", [error?.message ?? "Attendance submission failed."]);
  } finally {
    setButtonBusy(el.submitButton, false, "Submitting...", "Submit Attendance");
  }
}

export function initializeAttendance() {
  el.modeSelect.addEventListener("change", () => {
    toggleDateField(el.modeSelect.value === "historical");
  });

  el.loadClassesButton.addEventListener("click", loadClasses);

  el.previewButton.addEventListener("click", previewAttendance);

  el.submitButton.addEventListener("click", submitPreviewedAttendance);
}
