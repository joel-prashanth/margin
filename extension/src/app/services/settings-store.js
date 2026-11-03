import { readStorage, writeStorage } from "../core/storage.js";

// =====================================================
// AI GRADING SETTINGS
// Read directly by the AI services under services/ai.
// =====================================================

export const DEFAULT_SETTINGS_GEMINI_MODEL = "gemini-3.1-flash-lite";

const SETTINGS_KEYS = [
  "cfWorkerUrl",
  "labModuleContext",
  "rjModuleContext",
  "geminiApiKey",
  "geminiModel",
];

export async function getAiSettings() {
  return readStorage(SETTINGS_KEYS);
}

export async function saveAiSettings(settings) {
  await writeStorage({
    cfWorkerUrl: settings.cfWorkerUrl,
    labModuleContext: settings.labModuleContext,
    rjModuleContext: settings.rjModuleContext,
    geminiApiKey: settings.geminiApiKey,
    geminiModel: settings.geminiModel,
  });
}
