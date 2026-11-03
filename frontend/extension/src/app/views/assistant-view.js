import { getElement, hide, show } from "../core/dom.js";

// =====================================================
// ATTENDANCE ASSISTANT VIEW
// =====================================================

export const assistantElements = {
  get lockBadge() { return getElement("aaLockBadge"); },
  get sessionDisplay() { return getElement("aaSessionDisplay"); },
  get studentCount() { return getElement("aaStudentCount"); },
  get manualIdContainer() { return getElement("aaManualIdContainer"); },
  get manualSessionId() { return getElement("aaManualSessionId"); },
  get lockWarning() { return getElement("aaLockWarning"); },
  get submitButton() { return getElement("aaSubmitButton"); },
  get copyFallback() { return getElement("aaCopyFallback"); },
  get copyJsonButton() { return getElement("aaCopyJsonButton"); },
  get status() { return getElement("aaStatus"); },
  get refreshButton() { return getElement("assistantRefreshButton"); },
  get rosterContainer() { return getElement("aaRosterContainer"); },
  get rosterList() { return getElement("aaRosterList"); },
  get rosterSearch() { return getElement("aaRosterSearch"); },
  get rosterSummary() { return getElement("aaRosterSummary"); },
  get markAllPresent() { return getElement("aaMarkAllPresent"); },
  get markAllAbsent() { return getElement("aaMarkAllAbsent"); },
};

const el = assistantElements;

export const SUBMIT_LABEL_OPEN = "Mark Attendance";

export const SUBMIT_LABEL_LOCKED = "Force Submit (Faculty Override)";

export const COPY_JSON_LABEL = "Copy Attendance JSON to Clipboard";

export function setBadge(text, cssClass) {
  if (!el.lockBadge) return;
  el.lockBadge.textContent = text;
  el.lockBadge.className = `aa-badge ${cssClass}`;
}

export function setLockBadge(isLocked) {
  if (isLocked) {
    setBadge("LOCKED", "aa-badge-locked");
    show(el.lockWarning);
  } else {
    setBadge("OPEN", "aa-badge-open");
    hide(el.lockWarning);
  }
}

/** `html` may contain markup; callers only pass trusted strings or escaped values. */
export function setStatus(html, cssClass) {
  if (!el.status) return;
  el.status.innerHTML = html;
  el.status.className = cssClass;
  el.status.classList.remove("hidden");
}

export function hideStatus() {
  hide(el.status);
}

export function showManualIdInput() {
  show(el.manualIdContainer);
}

export function hideManualIdInput() {
  hide(el.manualIdContainer);
}

export function getManualSessionId() {
  return el.manualSessionId?.value.trim() || null;
}

export function setSessionDisplay(text, title) {
  if (!el.sessionDisplay) return;
  el.sessionDisplay.textContent = text;
  if (title) el.sessionDisplay.title = title;
}

export function updateRosterSummary({ total, present, absent }, isLocked) {
  if (el.rosterSummary) {
    el.rosterSummary.textContent =
      `${total} students — Present: ${present}  |  Absent: ${absent}`;
  }
  if (el.studentCount) el.studentCount.textContent = String(total);
  if (el.submitButton) {
    el.submitButton.textContent = isLocked
      ? `Force Submit — ${present}P / ${absent}A`
      : `Mark Attendance — ${present}P / ${absent}A`;
  }
}

/**
 * Updates one row in place (no full re-render).
 */
export function updateStudentRow(index, status) {
  const row = el.rosterList?.querySelector(`[data-idx="${index}"]`);
  if (!row) return;
  const isAbsent = status === "ABSENT";
  row.classList.toggle("absent", isAbsent);
  row.querySelector(".aa-toggle-btn.present")?.classList.toggle("active", !isAbsent);
  row.querySelector(".aa-toggle-btn.absent")?.classList.toggle("active", isAbsent);
}

export function getSearchQuery() {
  return el.rosterSearch?.value || "";
}

/**
 * `rows` is [{ student, index }] (already filtered).
 */
export function renderRoster(rows) {
  if (!el.rosterList || !el.rosterContainer) return;

  el.rosterList.innerHTML = "";

  for (const { student: s, index: idx } of rows) {
    const isAbsent = s.status === "ABSENT";
    const row = document.createElement("div");
    row.className = `aa-student-row${isAbsent ? " absent" : ""}`;
    row.setAttribute("data-idx", idx);
    row.innerHTML = `
      <div class="aa-sno">${idx + 1}</div>
      <div class="aa-student-info">
        <div class="aa-student-name">${s.name}</div>
        <div class="aa-student-reg">${s.regNo}</div>
      </div>
      <div class="aa-toggle">
        <button class="aa-toggle-btn present${!isAbsent ? " active" : ""}"
          data-idx="${idx}" data-status="PRESENT">P</button>
        <button class="aa-toggle-btn absent${isAbsent ? " active" : ""}"
          data-idx="${idx}" data-status="ABSENT">A</button>
      </div>
    `;
    el.rosterList.appendChild(row);
  }

  if (rows.length === 0) {
    el.rosterList.innerHTML =
      `<div style="padding:16px;text-align:center;color:#6b7280;font-size:13px;">No students match your search.</div>`;
  }

  show(el.rosterContainer);
}

export function showSubmitButton() {
  show(el.submitButton);
}

export function setSubmitBusy(busy, isLocked) {
  if (!el.submitButton) return;
  el.submitButton.disabled = busy;
  el.submitButton.textContent = busy
    ? "Submitting…"
    : isLocked
      ? SUBMIT_LABEL_LOCKED
      : SUBMIT_LABEL_OPEN;
}

export function showCopyFallback() {
  show(el.copyFallback);
}

export function hideCopyFallback() {
  hide(el.copyFallback);
}

export function flashCopied() {
  el.copyJsonButton.textContent = "✓ Copied!";
  setTimeout(() => {
    el.copyJsonButton.textContent = COPY_JSON_LABEL;
  }, 2500);
}

export function bindAssistantEvents({ onDetect, onSubmit, onCopy, onToggle, onSearch, onMarkAll }) {
  el.refreshButton?.addEventListener("click", onDetect);

  el.submitButton?.addEventListener("click", onSubmit);

  el.copyJsonButton?.addEventListener("click", onCopy);

  el.rosterList?.addEventListener("click", (e) => {
    const btn = e.target.closest(".aa-toggle-btn");
    if (!btn) return;
    onToggle(parseInt(btn.getAttribute("data-idx"), 10), btn.getAttribute("data-status"));
  });

  el.rosterSearch?.addEventListener("input", onSearch);

  el.markAllPresent?.addEventListener("click", () => onMarkAll("PRESENT"));

  el.markAllAbsent?.addEventListener("click", () => onMarkAll("ABSENT"));
}
