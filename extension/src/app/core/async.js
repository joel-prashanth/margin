// =====================================================
// ASYNC HELPERS
// =====================================================

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `worker` over `items` with at most `limit` in flight.
 * Results keep the input order.
 */
export async function mapWithConcurrency(items, limit, worker) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const results = new Array(items.length);

  let nextIndex = 0;

  const runnerCount = Math.min(Math.max(1, limit), items.length);

  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex;

      nextIndex += 1;

      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: runnerCount }, () => runner()));

  return results;
}
