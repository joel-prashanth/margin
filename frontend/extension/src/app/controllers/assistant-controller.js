import {
  findPortalTab,
  readDomAttendanceStatus,
  readFocusedAttendanceEntry,
} from "../services/portal-tab.js";
import {
  fetchRosterViaBackground,
  submitAttendanceViaBackground,
} from "../services/background-client.js";
import {
  applyDomStatuses,
  assistantState,
  buildAssistantPayload,
  filterStudents,
  getRosterCounts,
  rosterFromApi,
  setAllStatuses,
  setStudentStatus,
  shortSessionId,
  updateAssistantState,
} from "../models/attendance/assistant-session.js";
import * as view from "../views/assistant-view.js";

// =====================================================
// ATTENDANCE ASSISTANT CONTROLLER
// Detects the session focused in an open portal tab,
// lets faculty edit statuses, and submits via the
// background worker.
// =====================================================

function renderRoster() {
  view.renderRoster(filterStudents(view.getSearchQuery()));

  view.updateRosterSummary(getRosterCounts(), assistantState.isLocked);
}

function toggleStudent(index, status) {
  if (!setStudentStatus(index, status)) {
    return;
  }

  view.updateStudentRow(index, status);

  view.updateRosterSummary(getRosterCounts(), assistantState.isLocked);
}

function markAll(status) {
  setAllStatuses(status);

  renderRoster();
}

async function detectSession() {
  view.setBadge("Detecting…", "aa-badge-checking");

  view.hideStatus();

  // 1. Find an open Aurora portal tab
  const portalTab = await findPortalTab();

  if (!portalTab) {
    view.setBadge("No portal tab", "aa-badge-error");
    view.setStatus(
      "⚠ No Aurora ERP tab found. Open the attendance page at " +
        "admissions.aurora.edu.in and click Detect Session again.",
      "aa-status-neutral",
    );
    view.showManualIdInput();
    return;
  }

  // 2. Read the focused session entry from the portal's sessionStorage
  let entry = null;
  try {
    entry = await readFocusedAttendanceEntry(portalTab.id);
  } catch (scriptErr) {
    view.setBadge("Error", "aa-badge-error");
    view.setStatus(
      "Could not read the portal tab. Make sure you have the Aurora ERP " +
        "attendance page open and then try again.<br><br>" +
        "<small>" + (scriptErr?.message || String(scriptErr)) + "</small>",
      "aa-status-error",
    );
    view.showManualIdInput();
    return;
  }

  if (!entry?.found || !entry.sectionId) {
    view.setBadge("No session", "aa-badge-error");
    view.setStatus(
      "⚠ No active attendance session found in the portal tab.<br>" +
        "Please open an attendance session on <strong>admissions.aurora.edu.in</strong> " +
        "(click on a class slot to open it), then click Detect Session again.",
      "aa-status-neutral",
    );
    view.showManualIdInput();
    return;
  }

  // 3. Fetch the student roster via the background worker
  view.setStatus("Fetching student roster…", "aa-status-neutral");

  let rosterStudents = [];
  try {
    const rosterResp = await fetchRosterViaBackground(entry.sectionId, entry.courseOfferingId);

    if (rosterResp?.success && Array.isArray(rosterResp.data?.data)) {
      rosterStudents = rosterFromApi(rosterResp);
    } else {
      throw new Error(rosterResp?.error?.message || "Roster API returned no data");
    }
  } catch (rosterErr) {
    view.setBadge("Error", "aa-badge-error");
    view.setStatus(
      `Could not fetch student roster: ${rosterErr.message}.<br>` +
        "Make sure you are logged into Aurora ERP in the same browser.",
      "aa-status-error",
    );
    return;
  }

  // 4. Merge the live portal statuses into the roster
  try {
    rosterStudents = applyDomStatuses(rosterStudents, await readDomAttendanceStatus(portalTab.id));
  } catch (_) {
    // DOM read failed — keep default PRESENT for all students
  }

  // 5. Update state + UI
  updateAssistantState({
    found: true,
    sessionId: entry.timetableEntryId,
    timetableEntryId: entry.timetableEntryId,
    sectionId: entry.sectionId,
    courseOfferingId: entry.courseOfferingId,
    date: entry.date,
    slotId: entry.slotId,
    isLocked: entry.isLocked,
    subjectName: entry.subjectName,
    students: rosterStudents,
    token: null,
  });

  view.setLockBadge(entry.isLocked);

  view.setSessionDisplay(shortSessionId(entry.timetableEntryId), entry.timetableEntryId);

  view.hideManualIdInput();

  renderRoster();

  view.showSubmitButton();

  view.setStatus(
    `✓ Session: <strong>${entry.subjectName || ""}</strong> (${entry.sectionCode || ""}) ` +
      `&nbsp;—&nbsp; Lock: <strong>${entry.isLocked ? "LOCKED" : "OPEN"}</strong><br>` +
      `Edit individual student statuses below, then click <strong>${entry.isLocked ? "Force Submit" : "Mark Attendance"}</strong>.`,
    entry.isLocked ? "aa-status-neutral" : "aa-status-success",
  );
}

function renderSubmitResponse(response) {
  if (response && response.success) {
    const d = response.data;
    const savedRecords = d?.data?.records ?? [];
    const isStillLocked = d?.data?.isLocked;
    const msg = d?.message || "Attendance saved successfully.";

    view.setStatus(
      `✓ ${msg}<br>` +
        `Records saved: <strong>${savedRecords.length}</strong> &nbsp;|&nbsp; ` +
        `Session locked after save: <strong>${isStillLocked ? "Yes" : "No"}</strong>`,
      "aa-status-success",
    );

    if (typeof isStillLocked === "boolean") {
      assistantState.isLocked = isStillLocked;
      view.setBadge(
        isStillLocked ? "LOCKED" : "OPEN",
        isStillLocked ? "aa-badge-locked" : "aa-badge-open",
      );
    }

    return;
  }

  const err = response?.error || {};

  if (err.status === 403) {
    view.setStatus(
      `<strong>403 Forbidden — Server lock enforced</strong><br>` +
        `${err.message || "Session is locked on the server side."}<br><br>` +
        `Use the button below to copy the attendance JSON so you can ` +
        `request an administrator unlock.`,
      "aa-status-error",
    );
    view.showCopyFallback();
  } else {
    view.setStatus(
      `Submission failed (${err.status || "unknown error"}): ${err.message || "Unknown server error."}`,
      "aa-status-error",
    );
  }
}

async function submit() {
  view.hideStatus();
  view.hideCopyFallback();

  // timetableEntryId is the key field — confirmed from the Aurora ERP network tab
  const timetableEntryId = assistantState.timetableEntryId || view.getManualSessionId();

  if (!timetableEntryId) {
    view.setStatus(
      "No session detected. Click <strong>Detect Session</strong> first, " +
        "or paste the timetable entry UUID manually below.",
      "aa-status-error",
    );
    return;
  }

  if (assistantState.students.length === 0) {
    view.setStatus(
      "No students loaded. Click <strong>Detect Session</strong> first.",
      "aa-status-error",
    );
    return;
  }

  const payload = buildAssistantPayload(timetableEntryId);
  const { present, absent } = getRosterCounts();

  const confirmed = confirm(
    [
      "Submit attendance to Aurora ERP?",
      "",
      `Subject: ${assistantState.subjectName || "(unknown)"}`,
      `Students: ${payload.records.length}`,
      `Present: ${present}  |  Absent: ${absent}`,
      assistantState.isLocked
        ? "\n⚠ Session is LOCKED — submitting as faculty override via API."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (!confirmed) return;

  assistantState.lastPayload = payload;

  view.setSubmitBusy(true, assistantState.isLocked);

  let response;
  try {
    response = await submitAttendanceViaBackground(payload, assistantState.token);
  } catch (error) {
    view.setSubmitBusy(false, assistantState.isLocked);
    view.setStatus(`Extension error: ${error.message}`, "aa-status-error");
    return;
  }

  view.setSubmitBusy(false, assistantState.isLocked);

  renderSubmitResponse(response);
}

async function copyPayload() {
  if (!assistantState.lastPayload) return;

  const json = JSON.stringify(assistantState.lastPayload, null, 2);

  try {
    await navigator.clipboard.writeText(json);
    view.flashCopied();
  } catch (_) {
    alert("Clipboard copy failed. Please copy manually:\n\n" + json);
  }
}

/**
 * Called when the Assistant tab opens; detects once per page load.
 */
export function onAssistantTabActivated() {
  if (!assistantState.sessionId) {
    detectSession();
  }
}

export function initializeAssistant() {
  view.bindAssistantEvents({
    onDetect: detectSession,
    onSubmit: submit,
    onCopy: copyPayload,
    onToggle: toggleStudent,
    onSearch: renderRoster,
    onMarkAll: markAll,
  });
}
