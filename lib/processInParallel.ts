/**
 * Parallel Processing Utility
 * Process items in parallel with concurrency limit
 */

export async function processInParallel<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    concurrency: number = 3,
    onProgress?: (completed: number, total: number) => void
): Promise<(R | null)[]> {
    const startTime = performance.now();
    console.log(`[Parallel] Starting parallel processing: ${items.length} items with concurrency ${concurrency}`);

    const results: (R | null)[] = [];
    let currentIndex = 0;
    let completed = 0;

    const processNext = async (): Promise<void> => {
        const index = currentIndex++;

        if (index >= items.length) {
            return;
        }

        const itemStartTime = performance.now();
        try {
            const result = await processor(items[index], index);
            results[index] = result;
            const itemEndTime = performance.now();
            console.log(`[Parallel] Worker completed item ${index} in ${(itemEndTime - itemStartTime).toFixed(2)}ms`);
        } catch (error) {
            console.error(`[Parallel] Error processing item ${index}:`, error);
            results[index] = null;
        }

        completed++;
        onProgress?.(completed, items.length);

        // Process next item
        return processNext();
    };

    // Start initial batch of workers
    const workers = Array(Math.min(concurrency, items.length))
        .fill(null)
        .map(() => processNext());

    await Promise.all(workers);

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    console.log(`[Parallel] ✅ Completed all ${items.length} items | Total: ${totalTime.toFixed(2)}ms (${(totalTime / 1000).toFixed(2)}s) | Avg per item: ${(totalTime / items.length).toFixed(2)}ms`);

    return results;
}
