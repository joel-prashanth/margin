/**
 * Attendance page state extraction (responds to GET_PAGE_ATTENDANCE_STATE messages).
 *
 * Content scripts are classic scripts that share the extension's isolated-world
 * global scope. Load order is defined in manifest.json: shared.js first, main.js last.
 */

'use strict';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "GET_PAGE_ATTENDANCE_STATE") return;

  try {
    const state = extractAttendancePageState();
    sendResponse(state);
  } catch (err) {
    sendResponse({ found: false, error: String(err) });
  }

  return true;
});

function extractAttendancePageState() {
  // ── 1. Auth token ─────────────────────────────────
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("authToken") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("accessToken") ||
    sessionStorage.getItem("jwt") ||
    null;

  // ── 2. Session data — try Next.js hydration payload ──
  let sessionId = null;
  let isLocked = false;
  let sessionMeta = null;

  try {
    const nextData = window.__NEXT_DATA__;
    if (nextData) {
      // Drill into common page prop shapes the ERP might use
      const pageProps =
        nextData?.props?.pageProps ||
        nextData?.props ||
        {};

      const sessionObj =
        pageProps?.session ||
        pageProps?.attendanceSession ||
        pageProps?.data?.session ||
        null;

      if (sessionObj?.id) {
        sessionId = sessionObj.id;
        isLocked = Boolean(sessionObj.isLocked);
        sessionMeta = sessionObj;
      }
    }
  } catch (_) {}

  // ── 3. Session ID from URL (e.g. /sessions/UUID or ?sessionId=UUID) ──
  if (!sessionId) {
    const uuidRe =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    const urlMatch = window.location.href.match(uuidRe);
    if (urlMatch) {
      sessionId = urlMatch[0];
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("sessionId")) {
      sessionId = params.get("sessionId");
    }
  }

  // ── 4. Lock state from DOM ─────────────────────────
  if (!isLocked) {
    const lockIndicators = document.querySelectorAll(
      '[class*="locked"], [class*="lock-badge"], [data-locked="true"], ' +
      '.session-locked, [aria-label*="locked"], [aria-label*="Locked"]'
    );
    if (lockIndicators.length > 0) {
      isLocked = true;
    }

    // Mark-attendance button disabled is the canonical portal signal
    const markBtn = document.querySelector(
      'button[id*="mark"], button[data-action*="mark"], ' +
      'button:disabled[class*="mark"], button:disabled[class*="attendance"]'
    );
    if (markBtn && markBtn.disabled) {
      isLocked = true;
    }
  }

  // ── 5. Student list from table rows ───────────────
  const students = [];

  // Try data-student-id attributes first
  document
    .querySelectorAll("[data-student-id]")
    .forEach((el) => {
      const studentId = el.getAttribute("data-student-id");
      if (!studentId || students.some((s) => s.studentId === studentId)) return;
      const name =
        el.querySelector(".student-name, [class*='name']")?.textContent.trim() || "";
      const rollNo =
        el.querySelector(".roll-no, [class*='roll']")?.textContent.trim() || "";
      const absentEl = el.querySelector(
        "input[type='checkbox']:not(:checked), [class*='absent']"
      );
      students.push({
        studentId,
        name,
        rollNo,
        status: absentEl ? "ABSENT" : "PRESENT",
      });
    });

  // Fallback: scan generic table rows
  if (students.length === 0) {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    document.querySelectorAll("table tbody tr").forEach((row) => {
      // Look for any cell containing a UUID-like value as the student id
      const cells = Array.from(row.querySelectorAll("td"));
      const idCell = cells.find((td) =>
        uuidRe.test(td.textContent.trim()) ||
        uuidRe.test(td.getAttribute("data-id") || "")
      );
      if (!idCell) return;

      const studentId =
        idCell.getAttribute("data-id") || idCell.textContent.trim();
      if (students.some((s) => s.studentId === studentId)) return;

      const checkbox = row.querySelector("input[type='checkbox']");
      students.push({
        studentId,
        name: cells[1]?.textContent.trim() || "",
        rollNo: cells[0]?.textContent.trim() || "",
        status: checkbox && !checkbox.checked ? "ABSENT" : "PRESENT",
      });
    });
  }

  return {
    found: Boolean(sessionId),
    sessionId,
    isLocked,
    token,
    students,
    url: window.location.href,
    sessionMeta,
  };
}
