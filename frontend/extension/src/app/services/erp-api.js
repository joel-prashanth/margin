import { ERP_API_BASE as API_BASE } from "../../config.js";

// =====================================================
// REQUEST CONFIG
// =====================================================

const DEFAULT_REQUEST_TIMEOUT = 30 * 1000;

const JOURNAL_REQUEST_TIMEOUT = 60 * 1000;

// =====================================================
// IN-FLIGHT GET DEDUPLICATION
// =====================================================

const inFlightGetRequests = new Map();

// =====================================================
// LOGIN VERIFICATION CACHE
// =====================================================

const LOGIN_CACHE_KEY = "auroraLoginVerificationV1";

const LOGIN_VERIFICATION_TTL = 5 * 60 * 1000;

// =====================================================
// TODAY ATTENDANCE MEMORY CACHE
// =====================================================

const TODAY_SESSIONS_CACHE_TTL = 30 * 1000;

let todaySessionsMemoryCache = {
  cachedAt: 0,
  data: null,
};

// =====================================================
// ASSESSMENT SUBMISSION CACHE
// =====================================================

// Fast in-memory cache for repeated access while the
// extension page remains open.
const ASSESSMENT_SUBMISSIONS_MEMORY_TTL = 2 * 60 * 1000;

// Persistent cache survives extension reloads.
// Presigned S3 URLs expire in 1 hour; keep persistent cache to 20 minutes to prevent expired URLs.
const ASSESSMENT_SUBMISSIONS_PERSISTENT_TTL = 20 * 60 * 1000;

const ASSESSMENT_SUBMISSIONS_STORAGE_KEY =
  "journalAssessmentSubmissionsCacheV1";

const assessmentSubmissionsMemoryCache = new Map();

export function isS3UrlExpired(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    const dateStr = u.searchParams.get("X-Amz-Date");
    const expiresStr = u.searchParams.get("X-Amz-Expires");
    if (!dateStr || !expiresStr) return false;
    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(4, 6), 10) - 1;
    const day = parseInt(dateStr.slice(6, 8), 10);
    const hour = parseInt(dateStr.slice(9, 11), 10);
    const min = parseInt(dateStr.slice(11, 13), 10);
    const sec = parseInt(dateStr.slice(13, 15), 10);
    const signedAt = Date.UTC(year, month, day, hour, min, sec);
    const ttlMs = parseInt(expiresStr, 10) * 1000;
    return Date.now() >= signedAt + ttlMs - 5 * 60 * 1000;
  } catch (_) {
    return false;
  }
}

export function isAnyS3UrlExpired(submissions) {
  if (!Array.isArray(submissions) || submissions.length === 0) return false;
  for (const s of submissions.slice(0, 5)) {
    const rawAtts = Array.isArray(s.attachments)
      ? s.attachments
      : s.attachmentUrl
        ? [s.attachmentUrl]
        : [];
    for (const att of rawAtts) {
      const url = typeof att === "string" ? att : att?.url || "";
      if (url && (url.includes("X-Amz-Date") || url.includes("amazonaws.com")) && isS3UrlExpired(url)) {
        return true;
      }
    }
  }
  return false;
}

// =====================================================
// STORAGE HELPERS
// =====================================================

async function getSessionStorage(key) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.session) {
      return null;
    }

    const result = await chrome.storage.session.get(key);

    return result?.[key] ?? null;
  } catch (error) {
    console.warn("[ERP] Unable to read session storage.", error);

    return null;
  }
}

async function setSessionStorage(key, value) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.session) {
      return;
    }

    await chrome.storage.session.set({
      [key]: value,
    });
  } catch (error) {
    console.warn("[ERP] Unable to write session storage.", error);
  }
}

async function removeSessionStorage(key) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.session) {
      return;
    }

    await chrome.storage.session.remove(key);
  } catch (error) {
    console.warn("[ERP] Unable to clear session storage.", error);
  }
}

async function getLocalStorage(key) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return null;
    }

    const result = await chrome.storage.local.get(key);

    return result?.[key] ?? null;
  } catch (error) {
    console.warn("[ERP] Unable to read local storage.", error);

    return null;
  }
}

async function setLocalStorage(key, value) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    await chrome.storage.local.set({
      [key]: value,
    });
  } catch (error) {
    console.warn("[ERP] Unable to write local storage.", error);
  }
}

// =====================================================
// TODAY SESSION CACHE
// =====================================================

function getTodaySessionsMemoryCache() {
  if (!Array.isArray(todaySessionsMemoryCache.data)) {
    return null;
  }

  const cachedAt = Number(todaySessionsMemoryCache.cachedAt ?? 0);

  if (!cachedAt) {
    return null;
  }

  if (Date.now() - cachedAt > TODAY_SESSIONS_CACHE_TTL) {
    clearTodaySessionsMemoryCache();

    return null;
  }

  return todaySessionsMemoryCache.data;
}

function setTodaySessionsMemoryCache(sessions) {
  if (!Array.isArray(sessions)) {
    return;
  }

  todaySessionsMemoryCache = {
    cachedAt: Date.now(),
    data: sessions,
  };
}

function clearTodaySessionsMemoryCache() {
  todaySessionsMemoryCache = {
    cachedAt: 0,
    data: null,
  };
}

// =====================================================
// ASSESSMENT SUBMISSION MEMORY CACHE
// =====================================================

function getAssessmentSubmissionMemoryCache(assessmentId) {
  const entry = assessmentSubmissionsMemoryCache.get(assessmentId);

  if (!entry) {
    return null;
  }

  const cachedAt = Number(entry.cachedAt ?? 0);

  if (!cachedAt || Date.now() - cachedAt > ASSESSMENT_SUBMISSIONS_MEMORY_TTL) {
    assessmentSubmissionsMemoryCache.delete(assessmentId);

    return null;
  }

  if (!Array.isArray(entry.data)) {
    assessmentSubmissionsMemoryCache.delete(assessmentId);

    return null;
  }

  return entry.data;
}

function setAssessmentSubmissionMemoryCache(assessmentId, submissions) {
  if (!assessmentId || !Array.isArray(submissions)) {
    return;
  }

  assessmentSubmissionsMemoryCache.set(assessmentId, {
    cachedAt: Date.now(),
    data: submissions,
  });
}

// =====================================================
// ASSESSMENT SUBMISSION PERSISTENT CACHE
// =====================================================

async function readPersistentSubmissionCache() {
  const cache = await getLocalStorage(ASSESSMENT_SUBMISSIONS_STORAGE_KEY);

  if (!cache || typeof cache !== "object") {
    return {};
  }

  return cache;
}

async function getAssessmentSubmissionPersistentCache(assessmentId) {
  if (!assessmentId) {
    return null;
  }

  const cache = await readPersistentSubmissionCache();

  const entry = cache?.[assessmentId];

  if (!entry) {
    return null;
  }

  const cachedAt = Number(entry.cachedAt ?? 0);

  if (
    !cachedAt ||
    Date.now() - cachedAt > ASSESSMENT_SUBMISSIONS_PERSISTENT_TTL
  ) {
    return null;
  }

  if (!Array.isArray(entry.data)) {
    return null;
  }

  if (isAnyS3UrlExpired(entry.data)) {
    console.log(`[ERP] Cached submissions contain expired S3 URLs: ${assessmentId}`);
    return null;
  }

  return {
    cachedAt,
    data: entry.data,
  };
}

async function setAssessmentSubmissionPersistentCache(
  assessmentId,
  submissions,
) {
  if (!assessmentId || !Array.isArray(submissions)) {
    return;
  }

  const cache = await readPersistentSubmissionCache();

  cache[assessmentId] = {
    cachedAt: Date.now(),
    data: submissions,
  };

  await setLocalStorage(ASSESSMENT_SUBMISSIONS_STORAGE_KEY, cache);
}

// =====================================================
// PATCH ONE SUBMISSION INTO CACHE
// =====================================================

function patchSubmissionInArray(submissions, updatedSubmission) {
  if (!Array.isArray(submissions) || !updatedSubmission?.id) {
    return submissions;
  }

  const index = submissions.findIndex(
    (submission) => submission?.id === updatedSubmission.id,
  );

  if (index === -1) {
    return submissions;
  }

  const copy = [...submissions];

  copy[index] = updatedSubmission;

  return copy;
}

async function patchSubmissionCaches(updatedSubmission) {
  if (!updatedSubmission?.id) {
    return;
  }

  const assessmentId = updatedSubmission.assessmentId;

  if (!assessmentId) {
    return;
  }

  // ---------------------------------------------------
  // MEMORY CACHE
  // ---------------------------------------------------

  const memoryEntry = assessmentSubmissionsMemoryCache.get(assessmentId);

  if (memoryEntry && Array.isArray(memoryEntry.data)) {
    const patched = patchSubmissionInArray(memoryEntry.data, updatedSubmission);

    assessmentSubmissionsMemoryCache.set(assessmentId, {
      cachedAt: Date.now(),
      data: patched,
    });
  }

  // ---------------------------------------------------
  // PERSISTENT CACHE
  // ---------------------------------------------------

  const cache = await readPersistentSubmissionCache();

  const persistentEntry = cache?.[assessmentId];

  if (persistentEntry && Array.isArray(persistentEntry.data)) {
    cache[assessmentId] = {
      cachedAt: Date.now(),

      data: patchSubmissionInArray(persistentEntry.data, updatedSubmission),
    };

    await setLocalStorage(ASSESSMENT_SUBMISSIONS_STORAGE_KEY, cache);
  }
}

// =====================================================
// LOGIN CACHE
// =====================================================

async function getCachedLoginVerification() {
  const cached = await getSessionStorage(LOGIN_CACHE_KEY);

  if (!cached) {
    return null;
  }

  const verifiedAt = Number(cached.verifiedAt ?? 0);

  if (!verifiedAt) {
    return null;
  }

  if (Date.now() - verifiedAt > LOGIN_VERIFICATION_TTL) {
    await removeSessionStorage(LOGIN_CACHE_KEY);

    return null;
  }

  return cached;
}

async function cacheSuccessfulLogin() {
  await setSessionStorage(LOGIN_CACHE_KEY, {
    verified: true,
    verifiedAt: Date.now(),
  });
}

async function clearLoginVerification() {
  await removeSessionStorage(LOGIN_CACHE_KEY);

  clearTodaySessionsMemoryCache();

  assessmentSubmissionsMemoryCache.clear();
}

// =====================================================
// RESPONSE PARSER
// =====================================================

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();

    if (!text) {
      return null;
    }

    return {
      message: text,
    };
  } catch {
    return null;
  }
}

// =====================================================
// API ERROR
// =====================================================

function createApiError(response, data) {
  const serverMessage =
    typeof data?.error === "string"
      ? data.error
      : typeof data?.message === "string"
        ? data.message
        : null;

  const error = new Error(
    serverMessage || `Aurora ERP request failed. HTTP ${response.status}.`,
  );

  error.status = response.status;

  error.code = data?.code ?? null;

  error.payload = data ?? null;

  return error;
}

// =====================================================
// RAW REQUEST
// =====================================================

async function performRequest(path, options = {}) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT,

    ...fetchOptions
  } = options;

  const controller = new AbortController();

  const callerSignal = fetchOptions.signal;

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener(
        "abort",
        () => {
          controller.abort();
        },
        {
          once: true,
        },
      );
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",

      ...fetchOptions,

      signal: controller.signal,

      headers: {
        Accept: "application/json",

        ...(fetchOptions.body
          ? {
            "Content-Type": "application/json",
          }
          : {}),

        ...(fetchOptions.headers ?? {}),
      },
    });

    const data = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      await clearLoginVerification();
    }

    if (!response.ok) {
      throw createApiError(response, data);
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        "Aurora ERP request timed out. Please try again.",
      );

      timeoutError.code = "ERP_TIMEOUT";

      timeoutError.path = path;

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =====================================================
// API REQUEST
// =====================================================

async function apiRequest(path, options = {}) {
  const method = String(options.method ?? "GET").toUpperCase();

  if (method !== "GET") {
    return performRequest(path, options);
  }

  const requestKey = `${method}:${path}`;

  const existing = inFlightGetRequests.get(requestKey);

  if (existing) {
    return existing;
  }

  const requestPromise = performRequest(path, options);

  inFlightGetRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    if (inFlightGetRequests.get(requestKey) === requestPromise) {
      inFlightGetRequests.delete(requestKey);
    }
  }
}

// =====================================================
// ARRAY NORMALIZER
// =====================================================

function extractArray(response, possibleKeys = []) {
  if (Array.isArray(response)) {
    return response;
  }

  for (const key of possibleKeys) {
    if (Array.isArray(response?.[key])) {
      return response[key];
    }
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (response?.data && typeof response.data === "object") {
    for (const key of possibleKeys) {
      if (Array.isArray(response.data[key])) {
        return response.data[key];
      }
    }
  }

  return [];
}

// =====================================================
// DATE HELPERS
// =====================================================

function toDateKey(value) {
  if (!value) {
    return null;
  }

  const stringValue = String(value);

  const direct = stringValue.match(/^(\d{4}-\d{2}-\d{2})/);

  if (direct) {
    return direct[1];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentDateKey() {
  return toDateKey(new Date());
}

function getMonday(dateValue) {
  const dateKey = toDateKey(dateValue);

  if (!dateKey) {
    throw new Error("Invalid date.");
  }

  const date = new Date(`${dateKey}T12:00:00`);

  const day = date.getDay();

  const offset = day === 0 ? -6 : 1 - day;

  date.setDate(date.getDate() + offset);

  return toDateKey(date);
}

// =====================================================
// ERP LOGIN
// =====================================================

export async function verifyLogin({ force = false } = {}) {
  if (!force) {
    const cached = await getCachedLoginVerification();

    if (cached?.verified) {
      console.log("[ERP] Login verification cache hit.");

      const cachedSessions = getTodaySessionsMemoryCache();

      return Array.isArray(cachedSessions) ? cachedSessions : [];
    }
  }

  console.log("[ERP] Performing live login verification.");

  const response = await apiRequest("/attendance/sessions/today");

  const sessions = extractArray(response, ["sessions", "attendanceSessions"]);

  setTodaySessionsMemoryCache(sessions);

  await cacheSuccessfulLogin();

  return sessions;
}

// =====================================================
// EXPLICIT LOGIN INVALIDATION
// =====================================================

export async function invalidateLoginVerification() {
  await clearLoginVerification();
}

// =====================================================
// TIMETABLE
// =====================================================

export async function getTimetableForWeek(weekStart) {
  if (!weekStart) {
    throw new Error("Week start date is required.");
  }

  const response = await apiRequest(
    `/timetable/entries/mine?weekStart=${encodeURIComponent(weekStart)}`,
  );

  return extractArray(response, ["entries", "timetableEntries"]);
}

// =====================================================
// TERM IDENTIFIER HELPERS
// =====================================================

export const KNOWN_TERM1_IDS = [
  "457f6c9c-f721-4fe0-bb86-9fb11b14fd83",
  "41c4e12b-62be-4753-aa86-bcdcbcb64c2e",
  "4cad5e3f-0203-4a66-a00a-608dc9334f1b",
];

export const KNOWN_TERM2_IDS = [
  "c2d9f82a-7d8f-4ae9-a394-5e621f246262",
  "b8c722e8-2762-477c-aeaa-3b54a9ef361a",
  "e952dcaa-5353-4165-b07e-7700c232991e",
];

export function isTerm1(item) {
  if (!item) return false;
  const termName = String(
    item.termName ||
    item.term?.name ||
    item.academicTerm?.name ||
    item.term?.code ||
    item.academicTerm?.code ||
    item.termId ||
    item.term?.id ||
    ""
  ).toLowerCase();

  const termId = item.termId || item.term?.id || item.academicTermId || "";
  if (termId && KNOWN_TERM1_IDS.includes(termId)) {
    return true;
  }

  if (/\bterm\s*[-_]?\s*1\b/i.test(termName) || termName.includes("term1") || termName.includes("term-1")) {
    return true;
  }

  const title = String(item.title || "").toLowerCase();
  const desc = String(item.description || "").toLowerCase();
  if ((/\bterm\s*[-_]?\s*1\b/i.test(title) || /\bterm\s*[-_]?\s*1\b/i.test(desc)) &&
      !title.includes("term 2") && !title.includes("term-2") && !title.includes("term2")) {
    return true;
  }

  return false;
}

// =====================================================
// FACULTY CLASSES
// =====================================================

export async function getFacultyClasses(requestedWeekStart = null, { excludeTerm1 = true } = {}) {
  const primaryWeekStart = requestedWeekStart ?? getMonday(getCurrentDateKey());

  let entries = [];
  try {
    entries = await getTimetableForWeek(primaryWeekStart);
  } catch (error) {
    console.warn("[ERP] Timetable lookup failed for primary week.", error);
  }

  // Fallback: If current week has no entries and no specific week was requested, scan adjacent weeks
  if ((!Array.isArray(entries) || entries.length === 0) && !requestedWeekStart) {
    const primaryDate = new Date(`${primaryWeekStart}T12:00:00`);
    const weekOffsets = [-7, -14, -21, -28, -35, -42, 7, 14, 21, 28];

    for (const offsetDays of weekOffsets) {
      const altDate = new Date(primaryDate);
      altDate.setDate(altDate.getDate() + offsetDays);
      const altWeekStart = getMonday(altDate);

      try {
        const altEntries = await getTimetableForWeek(altWeekStart);
        if (Array.isArray(altEntries) && altEntries.length > 0) {
          console.log(`[ERP] Timetable entries found in week starting ${altWeekStart}`);
          entries = altEntries;
          break;
        }
      } catch (err) {
        // ignore and check next offset
      }
    }
  }

  if (!Array.isArray(entries)) {
    return [];
  }

  const classes = new Map();

  for (const entry of entries) {
    if (entry.isCancelled) {
      continue;
    }

    if (excludeTerm1 && isTerm1(entry)) {
      continue;
    }

    if (!entry.sectionCode || !entry.sectionId || !entry.courseOfferingId) {
      continue;
    }

    const key = `${entry.sectionId}|${entry.courseOfferingId}`;

    if (!classes.has(key)) {
      classes.set(key, {
        sectionId: entry.sectionId,

        sectionCode: entry.sectionCode,

        sectionName: entry.sectionName,

        courseOfferingId: entry.courseOfferingId,

        subjectId: entry.subjectId,

        subjectCode: entry.subjectCode,

        subjectName: entry.subjectName,

        facultyName: entry.facultyName,

        rooms: [],
      });
    }

    const value = classes.get(key);

    if (entry.room && !value.rooms.includes(entry.room)) {
      value.rooms.push(entry.room);
    }
  }

  return [...classes.values()];
}

// =====================================================
// FACULTY SUBMISSIONS
// =====================================================

export async function getFacultySubmissions() {
  const response = await apiRequest("/faculty/me/submissions", {
    timeoutMs: JOURNAL_REQUEST_TIMEOUT,
  });

  return extractArray(response, ["submissions"]);
}

// =====================================================
// ASSESSMENT DETAILS
// =====================================================

export async function getAssessmentDetails(assessmentId) {
  if (!assessmentId) {
    throw new Error("Assessment ID is required.");
  }

  const response = await apiRequest(
    `/faculty/me/assessments/${encodeURIComponent(assessmentId)}`,
  );

  return response?.data ?? response;
}

// =====================================================
// ASSESSMENT SUBMISSIONS
// =====================================================

export async function getAssessmentSubmissions(
  assessmentId,
  { force = false } = {},
) {
  if (!assessmentId) {
    throw new Error("Assessment ID is required.");
  }

  // ---------------------------------------------------
  // 1. FAST MEMORY CACHE
  // ---------------------------------------------------

  if (!force) {
    const memoryCached = getAssessmentSubmissionMemoryCache(assessmentId);

    if (memoryCached) {
      console.log(`[ERP] Assessment memory cache hit: ${assessmentId}`);

      return memoryCached;
    }

    // -------------------------------------------------
    // 2. PERSISTENT CACHE
    // -------------------------------------------------

    const persistentCached =
      await getAssessmentSubmissionPersistentCache(assessmentId);

    if (persistentCached) {
      console.log(`[ERP] Assessment persistent cache hit: ${assessmentId}`);

      setAssessmentSubmissionMemoryCache(assessmentId, persistentCached.data);

      return persistentCached.data;
    }
  }

  // ---------------------------------------------------
  // 3. LIVE AURORA REQUEST
  // ---------------------------------------------------

  console.log(
    `[ERP] Loading assessment submissions from Aurora: ${assessmentId}`,
  );

  const response = await apiRequest(
    `/faculty/me/assessments/${encodeURIComponent(assessmentId)}/submissions`,
    {
      timeoutMs: JOURNAL_REQUEST_TIMEOUT,
    },
  );

  const submissions = extractArray(response, ["submissions"]);

  setAssessmentSubmissionMemoryCache(assessmentId, submissions);

  await setAssessmentSubmissionPersistentCache(assessmentId, submissions);

  return submissions;
}

// =====================================================
// EVALUATE SUBMISSION
// =====================================================

export async function evaluateSubmission(submissionId, evaluation) {
  if (!submissionId) {
    throw new Error("Submission ID is required.");
  }

  if (!evaluation) {
    throw new Error("Evaluation payload is required.");
  }

  const marks = Number(evaluation.marks ?? 0);
  const maxMarks = Number(evaluation.maxMarks || 100);
  const feedback = typeof evaluation.feedback === "string" ? evaluation.feedback : "";

  const payload = {
    ...evaluation,
    marks,
    maxMarks,
    feedback,
  };

  const response = await apiRequest(
    `/faculty/me/submissions/${encodeURIComponent(submissionId)}/evaluate`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
      timeoutMs: JOURNAL_REQUEST_TIMEOUT,
    },
  );

  // Aurora already returns the complete authoritative
  // evaluated submission in response.data.
  //
  // Patch that single student into our caches rather
  // than invalidating the whole assessment snapshot.

  const savedSubmission = response?.data;

  if (savedSubmission?.id && savedSubmission?.assessmentId) {
    await patchSubmissionCaches(savedSubmission);
  }

  return response;
}

/**
 * Reads any active student PDF attachment information directly from the open Aurora portal tab
 */
export async function getPortalActivePdfInfo() {
  try {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) {
      return null;
    }
    const tabs = await chrome.tabs.query({ url: "https://admissions.aurora.edu.in/*" });
    if (!tabs || tabs.length === 0) return null;
    const tab = tabs.reduce((best, t) => (t.lastAccessed ?? 0) > (best.lastAccessed ?? 0) ? t : best);

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // 1. Look for the "Open" link in the Submitted Work card or any PDF link
        const anchor =
          document.querySelector('a[href*="assessment-submissions"][href*=".pdf"]') ||
          document.querySelector('a[href*="amazonaws.com"][href*=".pdf"]') ||
          document.querySelector('a.lucide-external-link') ||
          document.querySelector('a[href*=".pdf"]');
        const pdfUrl = anchor ? anchor.href : null;

        // 2. Look for filename
        const filenameSpan = document.querySelector('span[title*=".pdf"]');
        const filename = filenameSpan
          ? filenameSpan.getAttribute("title") || filenameSpan.textContent.trim()
          : null;

        // 3. Extract text from React-PDF textLayer if rendered on portal
        let extractedText = "";
        const textLayers = document.querySelectorAll(".react-pdf__Page__textContent, .textLayer");
        textLayers.forEach((layer) => {
          extractedText += layer.innerText + "\n";
        });

        // 4. Student info from portal page
        const nameEl = document.querySelector('[class*="student-name"], [class*="StudentName"]');
        const portalStudentName = nameEl ? nameEl.textContent.trim() : "";

        return {
          found: Boolean(pdfUrl || extractedText.trim()),
          pdfUrl,
          filename,
          extractedText: extractedText.trim(),
          studentName: portalStudentName,
        };
      },
    });

    return result?.result || null;
  } catch (err) {
    console.warn("[ERP] Portal inspection warning:", err);
    return null;
  }
}

// =====================================================
// TODAY ATTENDANCE
// =====================================================

export async function getTodaySessions({ force = false } = {}) {
  if (!force) {
    const cached = getTodaySessionsMemoryCache();

    if (cached) {
      console.log("[ERP] Today sessions cache hit.");

      return cached;
    }
  }

  const response = await apiRequest("/attendance/sessions/today");

  const sessions = extractArray(response, ["sessions", "attendanceSessions"]);

  setTodaySessionsMemoryCache(sessions);

  return sessions;
}

// =====================================================
// ATTENDANCE BY DATE
// =====================================================

export async function getAttendanceSessionsByDate(date) {
  const dateKey = toDateKey(date);

  if (!dateKey) {
    throw new Error("Invalid attendance date.");
  }

  const response = await apiRequest(
    `/attendance/sessions?fromDate=${encodeURIComponent(
      dateKey,
    )}&toDate=${encodeURIComponent(dateKey)}`,
  );

  return extractArray(response, ["sessions", "attendanceSessions"]);
}

// =====================================================
// HISTORICAL ATTENDANCE
// =====================================================

export async function getHistoricalSessions(date) {
  const selectedDate = toDateKey(date);

  if (!selectedDate) {
    throw new Error("Invalid historical attendance date.");
  }

  const weekStart = getMonday(selectedDate);

  const [timetableEntries, attendanceSessions] = await Promise.all([
    getTimetableForWeek(weekStart),

    getAttendanceSessionsByDate(selectedDate),
  ]);

  const scheduled = timetableEntries.filter(
    (entry) => toDateKey(entry.date) === selectedDate && !entry.isCancelled,
  );

  return scheduled.map((entry) => {
    let existing = attendanceSessions.find(
      (session) =>
        session.timetableEntryId && session.timetableEntryId === entry.id,
    );

    if (!existing) {
      existing = attendanceSessions.find(
        (session) =>
          session.sectionId === entry.sectionId &&
          session.slotId === entry.slotId &&
          toDateKey(session.date) === selectedDate,
      );
    }

    return {
      id: existing?.id ?? null,

      timetableEntryId: entry.id,

      date: selectedDate,

      isLocked: existing?.isLocked ?? entry.isLocked ?? false,

      slotId: entry.slotId,

      periodIndex: existing?.periodIndex,

      periodCount: existing?.periodCount ?? entry.spanSlots,

      startTime: entry.startTime,

      endTime: entry.endTime,

      room: entry.room,

      sectionId: entry.sectionId,

      sectionCode: entry.sectionCode,

      sectionName: entry.sectionName,

      courseOfferingId: entry.courseOfferingId,

      subjectId: entry.subjectId,

      subjectCode: entry.subjectCode,

      subjectName: entry.subjectName,

      facultyId: existing?.facultyId,

      facultyName: entry.facultyName ?? existing?.facultyName,

      totalStudents: existing?.totalStudents ?? 0,

      presentCount: existing?.presentCount ?? 0,

      absentCount: existing?.absentCount ?? 0,

      records: existing?.records ?? [],
    };
  });
}

// =====================================================
// ROSTER
// =====================================================

export async function getRoster(sectionId, courseOfferingId) {
  if (!sectionId) {
    throw new Error("Section ID is required.");
  }

  if (!courseOfferingId) {
    throw new Error("Course offering ID is required.");
  }

  const response = await apiRequest(
    `/attendance/sections/${encodeURIComponent(
      sectionId,
    )}/roster?courseOfferingId=${encodeURIComponent(courseOfferingId)}`,
  );

  return extractArray(response, ["roster", "students"]);
}

// =====================================================
// SUBMIT ATTENDANCE
// =====================================================

export async function submitAttendance(payload) {
  if (!payload) {
    throw new Error("Attendance payload is required.");
  }

  const response = await apiRequest("/attendance/sessions/mark", {
    method: "POST",

    body: JSON.stringify(payload),
  });

  clearTodaySessionsMemoryCache();

  return response;
}

// =====================================================
// ATTENDANCE DATE VALUES
// =====================================================

export function getAttendanceDateValues(date) {
  const attendanceDate = toDateKey(date);

  if (!attendanceDate) {
    throw new Error("Unable to determine attendance date.");
  }

  const [year, month, day] = attendanceDate.split("-");

  const attendanceColumn = `${month}-${day}-${year}`;

  return {
    attendanceDate,
    attendanceColumn,
  };
} 0
