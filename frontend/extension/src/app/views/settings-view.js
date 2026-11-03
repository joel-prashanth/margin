import { getElement } from "../core/dom.js";

// =====================================================
// AI SETTINGS MODAL VIEW
// =====================================================

const $ = getElement;

const OPEN_BUTTON_IDS = [
  "journalSettingsButton",
  "labSettingsButton",
  "essaySettingsButton",
  "projectSettingsButton",
];

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

export function fillSettingsForm(settings, defaultModel) {
  setValue("cfWorkerUrlInput", settings.cfWorkerUrl || "");
  setValue("labModuleContextInput", settings.labModuleContext || "");
  setValue("rjModuleContextInput", settings.rjModuleContext || "");
  setValue("geminiApiKeyInput", settings.geminiApiKey || "");
  setValue("geminiModelSelect", settings.geminiModel || defaultModel);

  const status = $("settingsStatus");
  if (status) {
    status.textContent = "";
    status.classList.add("hidden");
  }
}

export function readSettingsForm(defaultModel) {
  return {
    cfWorkerUrl: $("cfWorkerUrlInput")?.value || "",
    labModuleContext: $("labModuleContextInput")?.value || "",
    rjModuleContext: $("rjModuleContextInput")?.value || "",
    geminiApiKey: $("geminiApiKeyInput")?.value || "",
    geminiModel: $("geminiModelSelect")?.value || defaultModel,
  };
}

export function getApiKey() {
  return $("geminiApiKeyInput")?.value || "";
}

export function openModal() {
  $("settingsModal")?.showModal();
}

export function closeModal() {
  $("settingsModal")?.close();
}

export function showSaved() {
  const status = $("settingsStatus");
  if (status) {
    status.textContent = "✓ Settings saved successfully!";
    status.className = "success-message";
    status.classList.remove("hidden");
    setTimeout(closeModal, 800);
  }
}

export function setCheckModelsBusy(busy) {
  const btn = $("checkGeminiModelsButton");
  if (!btn) return;
  btn.textContent = busy ? "Checking..." : "Check Available Gemini Models";
  btn.disabled = busy;
}

export function showModelsMessage(text) {
  const listDiv = $("geminiModelsList");
  listDiv.textContent = text;
  listDiv.classList.remove("hidden");
}

/**
 * Clicking a model name selects it (adding the option if needed).
 */
export function renderModelList(modelNames) {
  const listDiv = $("geminiModelsList");
  listDiv.innerHTML = "";

  for (const name of modelNames) {
    const div = document.createElement("div");
    div.textContent = name;
    div.style.padding = "4px";
    div.style.borderBottom = "1px solid #eee";
    div.style.cursor = "pointer";
    div.onclick = () => {
      const select = $("geminiModelSelect");
      if (!Array.from(select.options).find((o) => o.value === name)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
      select.value = name;
      listDiv.classList.add("hidden");
    };
    listDiv.appendChild(div);
  }

  listDiv.classList.remove("hidden");
}

export function bindSettingsEvents({ onOpen, onSave, onCheckModels }) {
  for (const id of OPEN_BUTTON_IDS) {
    $(id)?.addEventListener("click", onOpen);
  }

  $("closeSettingsButton")?.addEventListener("click", closeModal);
  $("saveSettingsButton")?.addEventListener("click", onSave);
  $("checkGeminiModelsButton")?.addEventListener("click", onCheckModels);
}
