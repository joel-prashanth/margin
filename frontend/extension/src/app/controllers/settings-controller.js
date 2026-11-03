import { fetchAvailableGeminiModels } from "../services/ai/lab-ai.js";
import {
  DEFAULT_SETTINGS_GEMINI_MODEL,
  getAiSettings,
  saveAiSettings,
} from "../services/settings-store.js";
import * as view from "../views/settings-view.js";

// =====================================================
// AI SETTINGS CONTROLLER
// One modal shared by every grading tab.
// =====================================================

let initialized = false;

async function openSettings() {
  view.fillSettingsForm(await getAiSettings(), DEFAULT_SETTINGS_GEMINI_MODEL);
  view.openModal();
}

async function saveSettings() {
  await saveAiSettings(view.readSettingsForm(DEFAULT_SETTINGS_GEMINI_MODEL));
  view.showSaved();
}

async function checkGeminiModels() {
  const apiKey = view.getApiKey();

  if (!apiKey) {
    view.showModelsMessage("Please enter an API Key first.");
    return;
  }

  try {
    view.setCheckModelsBusy(true);

    const models = await fetchAvailableGeminiModels(apiKey);

    if (models.length === 0) {
      view.showModelsMessage("No valid models found for this key.");
    } else {
      view.renderModelList(models.map((m) => m.name.replace("models/", "")));
    }
  } catch (err) {
    view.showModelsMessage(err.message);
  } finally {
    view.setCheckModelsBusy(false);
  }
}

export function initializeSettings() {
  if (initialized) return;
  initialized = true;

  view.bindSettingsEvents({
    onOpen: openSettings,
    onSave: saveSettings,
    onCheckModels: checkGeminiModels,
  });
}
