// =====================================================
// CHROME STORAGE HELPERS
// Failures are logged and swallowed: caches are an
// optimisation and must never break a workflow.
// =====================================================

export async function readStorage(keys) {
  try {
    return await chrome.storage.local.get(keys);
  } catch (error) {
    console.warn("[Storage] Read failed.", error);

    return {};
  }
}

export async function writeStorage(values) {
  try {
    await chrome.storage.local.set(values);
  } catch (error) {
    console.warn("[Storage] Write failed.", error);
  }
}

export function isCacheFresh(cachedAt, ttl) {
  const timestamp = Number(cachedAt ?? 0);

  if (!timestamp) {
    return false;
  }

  return Date.now() - timestamp < ttl;
}

/**
 * A persisted map of id -> { cachedAt, data } where each
 * entry expires independently after `ttl` milliseconds.
 */
export class TimedEntryCache {
  constructor(storageKey, ttl) {
    this.storageKey = storageKey;

    this.ttl = ttl;

    this.entries = {};
  }

  async load() {
    const result = await readStorage([this.storageKey]);

    this.entries = result?.[this.storageKey] ?? {};
  }

  async save() {
    await writeStorage({ [this.storageKey]: this.entries });
  }

  get(id) {
    const entry = this.entries?.[id];

    if (!entry || !isCacheFresh(entry.cachedAt, this.ttl)) {
      return null;
    }

    return entry.data ?? null;
  }

  set(id, data) {
    this.entries[id] = {
      cachedAt: Date.now(),
      data,
    };
  }
}
