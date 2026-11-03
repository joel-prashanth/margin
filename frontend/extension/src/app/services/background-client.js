// =====================================================
// BACKGROUND SERVICE WORKER CLIENT
// Wraps chrome.runtime messages handled by
// src/background/service-worker.js.
// =====================================================

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));

        return;
      }

      resolve(response);
    });
  });
}

/**
 * Resolves to { success, data } or { success: false, error }.
 * Rejects only on extension messaging failures.
 */
export function fetchRosterViaBackground(sectionId, courseOfferingId) {
  return sendMessage({ action: "FETCH_ROSTER", sectionId, courseOfferingId });
}

export function submitAttendanceViaBackground(payload, token) {
  return sendMessage({ action: "SUBMIT_ATTENDANCE", payload, token });
}
