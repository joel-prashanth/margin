import { escapeHtml } from "../../core/dom.js";

// =====================================================
// BATCH PROGRESS MARKUP (Lab / Essay)
// =====================================================

function failColors(failCount, strong) {
  if (failCount === 0) {
    return { bg: "#f1f5f9", fg: "#64748b" };
  }

  return { bg: "#fee2e2", fg: strong ? "#991b1b" : "#b91c1c" };
}

/**
 * `noteHtml` is trusted markup built by the caller.
 */
export function batchProgressHtml({ index, total, successCount, failCount, submission, noteHtml }) {
  const fail = failColors(failCount, false);

  return `
    <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 6px;">
      <span style="font-weight: 700; color: #1e293b;">Evaluating ${index + 1} of ${total}</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700;">
        ✓ ${successCount} Evaluated
      </span>
      <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; background: ${fail.bg}; color: ${fail.fg}; font-size: 11px; font-weight: 700;">
        ✗ ${failCount} Failed
      </span>
    </div>
    <div style="font-size: 12px; color: #475569;">
      Student: <strong>${escapeHtml(submission.studentName)}</strong> (Roll: ${escapeHtml(submission.rollNumber)})
      ${noteHtml ? ` &bull; <span style="font-weight: 600;">${noteHtml}</span>` : ""}
    </div>
  `;
}

export function batchSummaryHtml({ title, successCount, failCount }) {
  const fail = failColors(failCount, true);

  return `
    <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px;">${title}</div>
    <div style="display: flex; gap: 10px; margin-top: 6px;">
      <span style="background: #dcfce7; color: #166534; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 12px;">
        ✓ ${successCount} Evaluated &amp; Saved
      </span>
      <span style="background: ${fail.bg}; color: ${fail.fg}; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 12px;">
        ✗ ${failCount} Failed
      </span>
    </div>
  `;
}

export function successNote(text) {
  return `<span style="color: #16a34a;">${escapeHtml(text)}</span>`;
}

export function failureNote(text) {
  return `<span style="color: #dc2626;">${escapeHtml(text)}</span>`;
}

export function waitingHtml(text) {
  return `<span style="color: #d97706;">${escapeHtml(text)}</span>`;
}
