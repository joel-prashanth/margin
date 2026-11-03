import { APP_PAGE_PATH, ERP_API_BASE as ERP_BASE } from "../config.js";

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL(APP_PAGE_PATH),
  });
});

// =====================================================
// MESSAGE ROUTER
// =====================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FETCH_ROSTER") {
    fetchRoster(request.sectionId, request.courseOfferingId)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err }));
    return true;
  }

  if (request.action === "SUBMIT_ATTENDANCE") {
    submitAttendance(request.payload)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err }));
    return true;
  }
});

// =====================================================
// FETCH STUDENT ROSTER
// Endpoint confirmed from Network tab:
//   GET /api/v1/attendance/sections/{sectionId}/roster?courseOfferingId={id}
// Auth: cookie-only (credentials: include)
// =====================================================

async function fetchRoster(sectionId, courseOfferingId) {
  const url = `${ERP_BASE}/attendance/sections/${sectionId}/roster?courseOfferingId=${courseOfferingId}`;

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (networkErr) {
    throw { status: 0, message: "Network error — could not reach the ERP server." };
  }

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok) {
    throw {
      status: response.status,
      message: data?.message || `Roster fetch failed: ${response.status}`,
    };
  }

  return data; // { success: true, data: [{studentId, firstName, lastName, registrationNo, ...}] }
}

// =====================================================
// SUBMIT ATTENDANCE
// Endpoint confirmed from Network tab:
//   POST /api/v1/attendance/sessions/mark  →  201 Created
// Auth: cookie-only (credentials: include) — token is in the "token" cookie
// Payload: { timetableEntryId, date, records: [{studentId, status, remarks}] }
// =====================================================

async function submitAttendance(payload) {
  const url = `${ERP_BASE}/attendance/sessions/mark`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",          // sends token cookie automatically
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw { status: 0, message: "Network error — could not reach the ERP server." };
  }

  let data = null;
  let rawText = "";
  try {
    rawText = await response.text();
    data = JSON.parse(rawText);
  } catch (_) {
    // If not JSON, we still have rawText
  }

  if (!response.ok) {
    throw {
      status: response.status,
      message: data?.message || data?.error || rawText || `Server returned ${response.status}`,
      serverData: data,
    };
  }

  return data;
}
