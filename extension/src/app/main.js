import { initializeNavigation, onTabActivated } from "./controllers/navigation-controller.js";
import {
  showAttendanceApp,
  startApp,
  verifyConfiguredProfileInBackground,
} from "./controllers/app-controller.js";
import { initializeSetup } from "./controllers/setup-controller.js";
import { initializeAttendance } from "./controllers/attendance-controller.js";
import { initializeAssistant, onAssistantTabActivated } from "./controllers/assistant-controller.js";
import { initializeSettings } from "./controllers/settings-controller.js";
import {
  initializeJournalGrading,
  onJournalTabActivated,
} from "./controllers/grading/journal-controller.js";
import { initializeLabGrading, onLabTabActivated } from "./controllers/grading/lab-controller.js";
import { initializeEssayGrading } from "./controllers/grading/essay-controller.js";
import {
  initializeProjectGrading,
  onProjectTabActivated,
} from "./controllers/grading/project-controller.js";

// =====================================================
// ENTRY POINT (src/pages/app.html)
// =====================================================

function initializeGradingModules() {
  initializeSettings();
  initializeJournalGrading();
  initializeLabGrading();
  initializeEssayGrading();
  initializeProjectGrading();
}

initializeNavigation();

onTabActivated("journal", onJournalTabActivated);
onTabActivated("lab", onLabTabActivated);
onTabActivated("project", onProjectTabActivated);
onTabActivated("assistant", onAssistantTabActivated);

initializeSetup({
  onSaved: () => {
    showAttendanceApp();

    verifyConfiguredProfileInBackground().catch(() => {});
  },
});

initializeAttendance();

initializeAssistant();

startApp({ initGrading: initializeGradingModules });
