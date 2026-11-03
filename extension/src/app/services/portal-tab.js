import { PORTAL_URL_PATTERN } from "../../config.js";

// =====================================================
// AURORA PORTAL TAB ACCESS
// Reads state from an open admissions.aurora.edu.in tab
// via chrome.scripting (MAIN world).
// =====================================================

/**
 * Returns the most recently accessed Aurora portal tab, or null.
 */
export async function findPortalTab() {
  try {
    const tabs = await chrome.tabs.query({ url: PORTAL_URL_PATTERN });

    if (tabs.length === 0) {
      return null;
    }

    return tabs.reduce((best, tab) =>
      (tab.lastAccessed ?? 0) > (best.lastAccessed ?? 0) ? tab : best,
    );
  } catch (_) {
    return null;
  }
}

/**
 * Reads the timetable entry Aurora stores when a session is focused.
 * Key confirmed: "au-erp:focused-attendance-entry".
 * Throws if the script cannot be injected.
 */
export async function readFocusedAttendanceEntry(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    world: "MAIN",
    func: function readSessionStorage() {
      try {
        const raw = sessionStorage.getItem("au-erp:focused-attendance-entry");
        if (raw) {
          const entry = JSON.parse(raw);
          return {
            found: true,
            timetableEntryId: entry.id || null,
            sectionId:        entry.sectionId || null,
            courseOfferingId: entry.courseOfferingId || null,
            date:             entry.date || null,
            isLocked:         Boolean(entry.isLocked),
            subjectName:      entry.subjectName || "",
            sectionCode:      entry.sectionCode || "",
            slotId:           entry.slotId || null,
          };
        }
      } catch (_) {}
      return { found: false };
    },
  });

  return results?.[0]?.result ?? null;
}

/**
 * Reads the live attendance status shown in the portal table.
 * For OPEN sessions: aria-pressed buttons show current status.
 * For LOCKED sessions: static span text shows status.
 * Returns { [regNo]: "PRESENT" | "ABSENT" }.
 */
export async function readDomAttendanceStatus(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    world: "MAIN",
    func: function readAttendanceStatus() {
      const statusMap = {};
      document.querySelectorAll("table tbody tr").forEach((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.length < 4) return;
        const regNo = cells[2]?.textContent?.trim() || "";
        if (!regNo) return;
        const statusCell = cells[3];
        const grp = statusCell?.querySelector('[role="group"]');
        if (grp) {
          const pressed = grp.querySelector('button[aria-pressed="true"]');
          const txt = pressed?.textContent?.trim().toLowerCase() || "present";
          statusMap[regNo] = txt.includes("absent") ? "ABSENT" : "PRESENT";
        } else {
          const badge = statusCell?.querySelector("span");
          const txt = badge?.textContent?.trim().toLowerCase() || "present";
          statusMap[regNo] = txt.includes("absent") ? "ABSENT" : "PRESENT";
        }
      });
      return statusMap;
    },
  });

  return results?.[0]?.result || {};
}
