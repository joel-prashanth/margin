import { DEFAULT_SPREADSHEET_URL } from "../../config.js";
import { getProfile, getPrivacyConsent, savePrivacyConsent } from "../services/profile-store.js";
import { getFacultyClasses, verifyLogin } from "../services/erp-api.js";
import {
  facultySession,
  getFacultyNameFromClasses,
  getFacultyNameFromSessions,
  mappedClassCount,
} from "../models/faculty-session.js";
import {
  bindConsent,
  hideConsentScreen,
  setLoginStatus,
  setProfileDisplay,
  shellElements,
  showAttendanceScreen,
  showConsentScreen,
  showNavigation,
  showSetupScreen,
} from "../views/shell-view.js";
import { setupElements, showMappingStatus } from "../views/setup-view.js";
import { hide } from "../core/dom.js";

// =====================================================
// APP CONTROLLER
// Startup, privacy consent and ERP identity checks.
// =====================================================

let initializeGradingModules = () => {};

function refreshProfileDisplay() {
  setProfileDisplay(facultySession.detectedFacultyName, mappedClassCount());
}

export function showAttendanceApp() {
  showAttendanceScreen();

  showNavigation();

  refreshProfileDisplay();

  initializeGradingModules();
}

function lockForFacultyMismatch(actualFacultyName) {
  facultySession.erpIdentityBlocked = true;

  facultySession.detectedFacultyName = actualFacultyName;

  setLoginStatus(`ERP account mismatch • Logged in as ${actualFacultyName}`, "error");

  hide(shellElements.attendanceSection);

  // Keep navigation tabs accessible so grading remains usable
  showNavigation();

  showSetupScreen();

  setupElements.facultyNameInput.value = actualFacultyName;

  showMappingStatus(
    "The active Aurora ERP faculty account does not match the saved Margin profile. Verify the account before continuing.",
  );
}

export async function verifyConfiguredProfileInBackground() {
  const { profile } = facultySession;

  if (facultySession.backgroundVerificationRunning || !profile?.erpFacultyName) {
    return;
  }

  facultySession.backgroundVerificationRunning = true;

  try {
    // Force a real Aurora check.
    const todaySessions = await verifyLogin({ force: true });

    let liveFacultyName = getFacultyNameFromSessions(todaySessions);

    // No attendance sessions today: fall back to timetable identity.
    if (!liveFacultyName) {
      try {
        const classes = await getFacultyClasses();

        if (Array.isArray(classes) && classes.length > 0) {
          facultySession.facultyClasses = classes;

          liveFacultyName = getFacultyNameFromClasses(classes);
        }
      } catch (error) {
        console.warn("[Startup] Background faculty identity lookup failed.", error);
      }
    }

    if (liveFacultyName && profile.erpFacultyName !== liveFacultyName) {
      lockForFacultyMismatch(liveFacultyName);

      return;
    }

    facultySession.erpIdentityBlocked = false;

    if (liveFacultyName) {
      facultySession.detectedFacultyName = liveFacultyName;

      refreshProfileDisplay();
    }

    setLoginStatus(`ERP Login ✓ ${liveFacultyName || profile.erpFacultyName}`, "success");
  } catch (error) {
    // A slow ERP must not destroy an otherwise configured startup.
    if (error?.code === "ERP_TIMEOUT") {
      setLoginStatus(
        "ERP verification delayed • Aurora ERP is responding slowly",
        "neutral",
      );
    } else if (error?.status === 401 || error?.status === 403) {
      setLoginStatus("Aurora ERP login required", "error");
    } else {
      setLoginStatus(
        `ERP verification unavailable • ${
          error?.message ?? "Aurora ERP could not be reached."
        }`,
        "neutral",
      );
    }
  } finally {
    facultySession.backgroundVerificationRunning = false;
  }
}

async function initializeFirstTimeSetup() {
  const { facultyNameInput, spreadsheetInput } = setupElements;

  showNavigation();

  try {
    setLoginStatus("Checking ERP login...", "neutral");

    const todaySessions = await verifyLogin({ force: true });

    facultySession.detectedFacultyName = getFacultyNameFromSessions(todaySessions);

    if (!facultySession.detectedFacultyName) {
      setLoginStatus("ERP login verified. Detecting faculty profile...", "neutral");

      facultySession.facultyClasses = await getFacultyClasses();

      facultySession.detectedFacultyName = getFacultyNameFromClasses(
        facultySession.facultyClasses,
      );
    }

    if (!facultySession.detectedFacultyName) {
      const manualName = facultyNameInput.value.trim();

      if (manualName) {
        facultySession.detectedFacultyName = manualName;
      }
    }

    if (!facultySession.detectedFacultyName) {
      setLoginStatus(
        "ERP Login Verified ✓ Please enter your ERP Faculty Name below",
        "neutral",
      );
    } else {
      setLoginStatus(`ERP Login ✓ ${facultySession.detectedFacultyName}`, "success");

      facultyNameInput.value = facultySession.detectedFacultyName;
    }

    if (!spreadsheetInput.value.trim()) {
      spreadsheetInput.value = DEFAULT_SPREADSHEET_URL;
    }

    showSetupScreen();
  } catch (error) {
    showNavigation();

    setLoginStatus(error?.message ?? "Unable to connect to Aurora ERP.", "error");
  }
}

/**
 * Shared by startup and consent acceptance: open the app for a
 * configured profile, otherwise start first-time setup.
 */
async function startWithConsent() {
  showNavigation();

  initializeGradingModules();

  facultySession.profile = await getProfile();

  const { profile } = facultySession;

  if (profile?.erpFacultyName) {
    facultySession.detectedFacultyName = profile.erpFacultyName;

    setupElements.facultyNameInput.value = profile.erpFacultyName;

    setLoginStatus(`ERP session • verifying ${profile.erpFacultyName}`, "neutral");

    // Show application immediately; verify without blocking.
    showAttendanceApp();

    verifyConfiguredProfileInBackground().catch((error) => {
      console.warn("[Startup] Background ERP verification failed.", error);
    });

    return;
  }

  await initializeFirstTimeSetup();
}

async function onConsentAccepted() {
  await savePrivacyConsent();

  hideConsentScreen();

  await startWithConsent();
}

/**
 * `initGrading` initializes the grading modules (idempotent).
 */
export async function startApp({ initGrading }) {
  initializeGradingModules = initGrading;

  bindConsent({ onAccept: onConsentAccepted });

  try {
    const consent = await getPrivacyConsent();

    if (!consent) {
      setLoginStatus("Privacy consent required", "neutral");

      showConsentScreen();

      return;
    }

    await startWithConsent();
  } catch (error) {
    showNavigation();

    setLoginStatus(error?.message ?? "Unable to initialize Margin.", "error");
  }
}
