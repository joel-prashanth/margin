import { mapWithConcurrency } from "../core/async.js";
import { hide, show } from "../core/dom.js";
import { extractSpreadsheetId } from "../services/sheets-api.js";
import { getFacultyClasses } from "../services/erp-api.js";
import { clearAllExtensionData, saveProfile } from "../services/profile-store.js";
import { assertErpIdentityAllowed, facultySession } from "../models/faculty-session.js";
import {
  autoDetectSheetForClass,
  toMappingState,
  unverifiedMappingState,
  verifyMapping,
} from "../models/attendance/sheet-mapping.js";
import {
  hideMappingResults,
  renderMappingResults,
  resetSetupForSettings,
  setupElements as el,
  showMappingStatus,
} from "../views/setup-view.js";
import { shellElements } from "../views/shell-view.js";

// =====================================================
// SETUP CONTROLLER
// Detects ERP classes, maps them to Google Sheet tabs,
// verifies rosters and saves the faculty profile.
// =====================================================

const MAPPING_CONCURRENCY = 3;

let setupMappings = {};

let onSetupSaved = () => {};

async function ensureFacultyClasses() {
  if (Array.isArray(facultySession.facultyClasses) && facultySession.facultyClasses.length > 0) {
    return facultySession.facultyClasses;
  }

  facultySession.facultyClasses = await getFacultyClasses();

  return facultySession.facultyClasses;
}

function requireFacultyName() {
  if (!facultySession.detectedFacultyName) {
    facultySession.detectedFacultyName = el.facultyNameInput.value.trim();
  }

  if (!facultySession.detectedFacultyName) {
    throw new Error("Enter your ERP Faculty Name to proceed.");
  }
}

function handleSheetNameInput(sectionCode, sheetName) {
  setupMappings[sectionCode] = {
    ...setupMappings[sectionCode],
    ...unverifiedMappingState(sheetName),
  };

  return setupMappings[sectionCode];
}

function rerenderMappings() {
  renderMappingResults(facultySession.facultyClasses, setupMappings, handleSheetNameInput);
}

async function detectMappings() {
  try {
    assertErpIdentityAllowed();

    requireFacultyName();

    const spreadsheetId = extractSpreadsheetId(el.spreadsheetInput.value);

    if (!spreadsheetId) {
      throw new Error("Enter a valid Google Spreadsheet URL or ID.");
    }

    el.detectMappingsButton.disabled = true;

    el.detectMappingsButton.textContent = "Detecting...";

    hideMappingResults();

    showMappingStatus("Reading your ERP timetable...");

    const classes = await ensureFacultyClasses();

    if (!classes.length) {
      throw new Error("No faculty classes were found in the current ERP timetable.");
    }

    setupMappings = {};

    let completed = 0;

    let verifiedCount = 0;

    const results = await mapWithConcurrency(classes, MAPPING_CONCURRENCY, async (erpClass) => {
      const result = await autoDetectSheetForClass({ erpClass, spreadsheetId });

      completed += 1;

      if (result.verified) {
        verifiedCount += 1;
      }

      showMappingStatus(`Checking ${completed}/${classes.length} classes...`);

      return { erpClass, result };
    });

    for (const { erpClass, result } of results) {
      setupMappings[erpClass.sectionCode] = toMappingState(result.sheetName, result);
    }

    rerenderMappings();

    showMappingStatus(`${verifiedCount}/${classes.length} classes roster-verified automatically.`);
  } catch (error) {
    showMappingStatus(`Setup error: ${error?.message ?? "Unknown error."}`);
  } finally {
    el.detectMappingsButton.disabled = false;

    el.detectMappingsButton.textContent = "Detect & Map Classes";
  }
}

async function verifyAndSaveSetup() {
  try {
    assertErpIdentityAllowed();

    requireFacultyName();

    const spreadsheetId = extractSpreadsheetId(el.spreadsheetInput.value);

    if (!spreadsheetId) {
      throw new Error("Spreadsheet ID is missing.");
    }

    const classes = facultySession.facultyClasses;

    if (!classes.length) {
      throw new Error("Detect ERP classes before saving.");
    }

    el.saveSetupButton.disabled = true;

    el.saveSetupButton.textContent = "Verifying...";

    for (let index = 0; index < classes.length; index += 1) {
      const erpClass = classes[index];

      const mapping = setupMappings[erpClass.sectionCode];

      if (!mapping?.sheetName) {
        throw new Error(`Sheet mapping missing for ${erpClass.sectionCode}.`);
      }

      showMappingStatus(`Verifying ${index + 1}/${classes.length}: ${erpClass.sectionCode}`);

      const verification = await verifyMapping({
        erpClass,
        spreadsheetId,
        sheetName: mapping.sheetName,
      });

      setupMappings[erpClass.sectionCode] = toMappingState(mapping.sheetName, verification);

      rerenderMappings();

      if (!verification.verified) {
        throw new Error(
          `${erpClass.sectionCode} failed roster verification. ` +
            `${verification.matched ?? 0}/${verification.total ?? 0} ERP students matched.`,
        );
      }
    }

    const classMappings = {};

    for (const erpClass of classes) {
      const mapping = setupMappings[erpClass.sectionCode];

      if (!mapping?.verified) {
        throw new Error(`${erpClass.sectionCode} has not been roster-verified.`);
      }

      classMappings[erpClass.sectionCode] = { sheetName: mapping.sheetName };
    }

    facultySession.profile = {
      name: facultySession.detectedFacultyName,
      erpFacultyName: facultySession.detectedFacultyName,
      spreadsheetId,
      classMappings,
      updatedAt: new Date().toISOString(),
    };

    await saveProfile(facultySession.profile);

    facultySession.erpIdentityBlocked = false;

    facultySession.isSettingsMode = false;

    hide(el.cancelSetupButton);

    showMappingStatus("All class mappings verified successfully.");

    onSetupSaved();
  } catch (error) {
    showMappingStatus(`Cannot save setup: ${error?.message ?? "Unknown error."}`);
  } finally {
    el.saveSetupButton.disabled = false;

    el.saveSetupButton.textContent = "Verify & Save Setup";
  }
}

function openSettings() {
  facultySession.isSettingsMode = true;

  hide(shellElements.attendanceSection);

  show(shellElements.setupSection);

  resetSetupForSettings({
    facultyName: facultySession.detectedFacultyName ?? "",
    spreadsheetId: facultySession.profile?.spreadsheetId ?? "",
    canCancel: Boolean(el.cancelSetupButton && facultySession.profile?.erpFacultyName),
  });
}

function cancelSettings() {
  const { profile } = facultySession;

  facultySession.isSettingsMode = false;

  hide(shellElements.setupSection);

  hide(el.cancelSetupButton);

  if (profile?.erpFacultyName && profile?.spreadsheetId) {
    show(shellElements.attendanceSection);
  }
}

async function resetExtension() {
  const confirmed = confirm(
    [
      "Reset Margin?",
      "",
      "This removes:",
      "• Saved faculty configuration",
      "• Spreadsheet ID",
      "• Class mappings",
      "• Privacy consent",
      "",
      "Attendance already submitted to Aurora ERP will NOT be changed.",
    ].join("\n"),
  );

  if (!confirmed) {
    return;
  }

  await clearAllExtensionData();

  location.reload();
}

/**
 * `onSaved` runs after a verified profile is stored.
 */
export function initializeSetup({ onSaved }) {
  onSetupSaved = onSaved;

  el.detectMappingsButton.addEventListener("click", detectMappings);

  el.saveSetupButton.addEventListener("click", verifyAndSaveSetup);

  el.settingsButton.addEventListener("click", openSettings);

  el.cancelSetupButton?.addEventListener("click", cancelSettings);

  el.resetExtensionButton.addEventListener("click", resetExtension);
}
