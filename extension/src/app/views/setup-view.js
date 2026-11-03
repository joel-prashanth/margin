import { clearElement, getElement, hide, show } from "../core/dom.js";

// =====================================================
// SETUP VIEW (faculty name, spreadsheet, class mappings)
// =====================================================

export const setupElements = {
  get facultyNameInput() { return getElement("facultyNameInput"); },
  get spreadsheetInput() { return getElement("spreadsheetInput"); },
  get detectMappingsButton() { return getElement("detectMappingsButton"); },
  get mappingStatus() { return getElement("mappingStatus"); },
  get mappingResults() { return getElement("mappingResults"); },
  get saveSetupButton() { return getElement("saveSetupButton"); },
  get cancelSetupButton() { return getElement("cancelSetupButton"); },
  get settingsButton() { return getElement("settingsButton"); },
  get resetExtensionButton() { return getElement("resetExtensionButton"); },
};

const el = setupElements;

export function showMappingStatus(message) {
  el.mappingStatus.textContent = message;

  show(el.mappingStatus);
}

export function hideMappingResults() {
  hide(el.mappingResults);

  hide(el.saveSetupButton);
}

export function resetSetupForSettings({ facultyName, spreadsheetId, canCancel }) {
  el.facultyNameInput.value = facultyName;

  el.spreadsheetInput.value = spreadsheetId;

  if (canCancel) {
    show(el.cancelSetupButton);
  }

  hide(el.mappingResults);

  hide(el.mappingStatus);

  hide(el.saveSetupButton);
}

function renderMappingDiagnostics(diagnostics, badge, current) {
  diagnostics.replaceChildren();

  if (current?.verified) {
    badge.textContent = "✓ Verified";

    badge.className = "mapping-badge success";

    const verifiedMessage = document.createElement("div");

    verifiedMessage.className = "mapping-verified-summary";

    verifiedMessage.textContent =
      current.total && current.matched
        ? `${current.matched}/${current.total} ERP students matched.`
        : "ERP roster matched successfully.";

    diagnostics.appendChild(verifiedMessage);

    return;
  }

  badge.textContent = "Verification Required";

  badge.className = "mapping-badge warning";

  if (
    Number.isFinite(current?.matched) &&
    Number.isFinite(current?.total) &&
    current.total > 0
  ) {
    const coverage = document.createElement("div");

    coverage.className = "mapping-diagnostic-summary";

    coverage.textContent = `${current.matched}/${current.total} ERP students matched.`;

    diagnostics.appendChild(coverage);
  }

  if (Array.isArray(current?.missingStudents) && current.missingStudents.length > 0) {
    const heading = document.createElement("div");

    heading.className = "mapping-missing-heading";

    heading.textContent = "Missing from Google Sheet:";

    diagnostics.appendChild(heading);

    for (const student of current.missingStudents) {
      const row = document.createElement("div");

      row.className = "mapping-missing-student";

      row.textContent =
        `${student.registrationNo}` + `${student.name ? ` | ${student.name}` : ""}`;

      diagnostics.appendChild(row);
    }

    return;
  }

  if (current?.reason) {
    const reason = document.createElement("div");

    reason.className = "mapping-diagnostic-summary";

    reason.textContent = current.reason;

    diagnostics.appendChild(reason);
  }
}

/**
 * Renders one card per ERP class.
 * `onSheetNameInput(sectionCode, value)` must return the updated mapping.
 */
export function renderMappingResults(facultyClasses, mappings, onSheetNameInput) {
  clearElement(el.mappingResults);

  for (const erpClass of facultyClasses) {
    const mapping = mappings[erpClass.sectionCode];

    const card = document.createElement("div");

    card.className = "mapping-card";

    const classInfo = document.createElement("div");

    classInfo.className = "mapping-class";

    classInfo.appendChild(document.createTextNode(erpClass.sectionCode));

    const details = document.createElement("small");

    details.textContent =
      `${erpClass.subjectCode ?? ""} ` +
      `${erpClass.subjectName ?? ""} | ` +
      `Room(s): ${(erpClass.rooms ?? []).join(", ") || "—"}`;

    classInfo.appendChild(details);

    const sheetWrapper = document.createElement("div");

    sheetWrapper.className = "mapping-sheet";

    const input = document.createElement("input");

    input.type = "text";

    input.value = mapping?.sheetName ?? "";

    input.placeholder = "Google Sheet tab name";

    sheetWrapper.appendChild(input);

    const diagnostics = document.createElement("div");

    diagnostics.className = "mapping-diagnostics";

    sheetWrapper.appendChild(diagnostics);

    const badge = document.createElement("div");

    input.addEventListener("input", () => {
      const updated = onSheetNameInput(erpClass.sectionCode, input.value.trim());

      renderMappingDiagnostics(diagnostics, badge, updated);
    });

    renderMappingDiagnostics(diagnostics, badge, mapping);

    card.appendChild(classInfo);

    card.appendChild(sheetWrapper);

    card.appendChild(badge);

    el.mappingResults.appendChild(card);
  }

  show(el.mappingResults);

  show(el.saveSetupButton);
}
