// =====================================================
// SHARED CONFIGURATION
// Imported by the extension page (src/app) and the
// background service worker. Content scripts cannot
// import ES modules, so they keep their own copy.
// =====================================================

export const ERP_API_BASE = "https://admissionsserver.aurora.edu.in/api/v1";

export const PORTAL_URL_PATTERN = "https://admissions.aurora.edu.in/*";

export const APP_PAGE_PATH = "src/pages/app.html";

export const DEFAULT_CF_WORKER_URL =
  "https://gentle-recipe-f3a6.saisivateja28122003.workers.dev";

export const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
