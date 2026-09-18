/**
 * Runs `worker` over `items` with at most `limit` in flight at once, preserving
 * input order in the result. Large batches (e.g. dozens of multi-megabyte
 * files) firing fully unbounded can overwhelm a modestly-sized backend
 * instance -- see the Rail Corrugation batch-upload 500s this was added for.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runNext(): Promise<void> {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}
