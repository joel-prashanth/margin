import { getElement, hide, show } from "../core/dom.js";

// =====================================================
// APP SHELL VIEW
// Login status, top-level sections and the tab bar.
// =====================================================

const el = {
  get loginStatus() { return getElement("loginStatus"); },
  get consentSection() { return getElement("consentSection"); },
  get consentCheckbox() { return getElement("consentCheckbox"); },
  get acceptConsentButton() { return getElement("acceptConsentButton"); },
  get setupSection() { return getElement("setupSection"); },
  get attendanceSection() { return getElement("attendanceSection"); },
  get profileDisplay() { return getElement("profileDisplay"); },
  get mainNavigation() { return getElement("mainNavigation"); },
};

export const shellElements = el;

export function setLoginStatus(message, type) {
  el.loginStatus.textContent = message;

  el.loginStatus.className = `status status-${type}`;
}

export function showNavigation() {
  show(el.mainNavigation);
}

export function showConsentScreen() {
  show(el.consentSection);

  hide(el.setupSection);

  hide(el.attendanceSection);
}

export function hideConsentScreen() {
  hide(el.consentSection);
}

export function showSetupScreen() {
  show(el.setupSection);

  hide(el.attendanceSection);
}

export function showAttendanceScreen() {
  hide(el.consentSection);

  hide(el.setupSection);

  show(el.attendanceSection);
}

export function setProfileDisplay(facultyName, mappedCount) {
  el.profileDisplay.textContent = `${facultyName} • ${mappedCount} mapped classes`;
}

export function bindConsent({ onToggle, onAccept }) {
  el.consentCheckbox.addEventListener("change", () => {
    el.acceptConsentButton.disabled = !el.consentCheckbox.checked;

    onToggle?.(el.consentCheckbox.checked);
  });

  el.acceptConsentButton.addEventListener("click", () => {
    if (el.consentCheckbox.checked) {
      onAccept();
    }
  });
}

// =====================================================
// TABS
// =====================================================

/**
 * Shows one tab's section and marks its button active.
 */
export function showTab(tabs, activeName) {
  for (const tab of tabs) {
    const button = getElement(tab.buttonId);

    const section = getElement(tab.sectionId);

    if (!button || !section) {
      continue;
    }

    button.classList.toggle("active", tab.name === activeName);

    section.classList.toggle("hidden", tab.name !== activeName);
  }
}

export function bindTabButtons(tabs, onSelect) {
  for (const tab of tabs) {
    getElement(tab.buttonId)?.addEventListener("click", () => onSelect(tab.name));
  }
}
