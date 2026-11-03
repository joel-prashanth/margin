// =====================================================
// DOM HELPERS
// =====================================================

export function getElement(id) {
  return document.getElementById(id);
}

export function clearElement(element) {
  if (!element) {
    return;
  }

  element.replaceChildren();
}

/**
 * Escapes ERP/student-provided text before it is placed in innerHTML.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function show(element) {
  element?.classList.remove("hidden");
}

export function hide(element) {
  element?.classList.add("hidden");
}

export function createOption(value, text) {
  const option = document.createElement("option");

  option.value = value;

  option.textContent = text;

  return option;
}

export function createMessage(type, lines) {
  const box = document.createElement("div");

  box.className = `${type}-message`;

  lines.forEach((line, index) => {
    if (index > 0) {
      box.appendChild(document.createElement("br"));
    }

    box.appendChild(document.createTextNode(line));
  });

  return box;
}

export function showMessage(target, type, lines) {
  if (!target) {
    return;
  }

  target.replaceChildren(createMessage(type, lines));
}

/**
 * Sets text + class on a status element and reveals it.
 */
export function setStatus(element, className, text) {
  if (!element) {
    return;
  }

  element.textContent = text;

  element.className = className;

  element.classList.remove("hidden");
}

export function hideStatus(element) {
  if (!element) {
    return;
  }

  element.textContent = "";

  element.classList.add("hidden");
}

export function setButtonBusy(button, busy, busyText, idleText) {
  if (!button) {
    return;
  }

  button.disabled = busy;

  button.textContent = busy ? busyText : idleText;
}
