// Only the idempotent legacy-storage migration is retried. Other 503 responses
// remain visible, and changing view immediately aborts the outstanding work.
export async function fetchUsage(
  url,
  options = {},
  { fetchImpl = fetch, maxRetries = 60, delayMs = 500, onMigration = () => {} } = {},
) {
  let migrating = false;
  try {
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    const response = await fetchImpl(url, options);
    if (response.status !== 503 || attempt >= maxRetries) return response;
    let details;
    try {
      details = await response.clone().json();
    } catch {
      return response;
    }
    if (details.code !== "storage_migrating") return response;
    if (!migrating) { migrating = true; onMigration(true); }
    await new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(options.signal.reason);
      };
      const timer = setTimeout(() => {
        options.signal?.removeEventListener("abort", abort);
        resolve();
      }, delayMs);
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    });
  }
  } finally {
    if (migrating) onMigration(false);
  }
}
