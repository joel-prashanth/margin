import { isAttendanceConfigured } from "../models/faculty-session.js";
import {
  bindTabButtons,
  shellElements,
  showAttendanceScreen,
  showSetupScreen,
  showTab,
} from "../views/shell-view.js";
import { hide } from "../core/dom.js";

// =====================================================
// TAB NAVIGATION
// Single owner of tab switching. Feature controllers
// register an `onActivate` hook instead of toggling
// sections themselves.
// =====================================================

const TABS = [
  { name: "attendance", buttonId: "attendanceTabButton", sectionId: "attendanceSection" },
  { name: "journal", buttonId: "journalTabButton", sectionId: "journalSection" },
  { name: "lab", buttonId: "labTabButton", sectionId: "labSection" },
  { name: "essay", buttonId: "essayTabButton", sectionId: "essaySection" },
  { name: "project", buttonId: "projectTabButton", sectionId: "projectSection" },
  { name: "assistant", buttonId: "assistantTabButton", sectionId: "assistantSection" },
];

const activationHooks = new Map();

export function onTabActivated(name, hook) {
  activationHooks.set(name, hook);
}

export function activateTab(name) {
  showTab(TABS, name);

  if (name !== "attendance") {
    hide(shellElements.setupSection);
  } else if (isAttendanceConfigured()) {
    showAttendanceScreen();
  } else {
    showSetupScreen();
  }

  activationHooks.get(name)?.();
}

export function initializeNavigation() {
  bindTabButtons(TABS, activateTab);
}
