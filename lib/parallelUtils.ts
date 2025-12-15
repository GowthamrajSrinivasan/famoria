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
    const results: (R | null)[] = [];
    let currentIndex = 0;
    let completed = 0;

    const processNext = async (): Promise<void> => {
        const index = currentIndex++;

        if (index >= items.length) {
            return;
        }

        try {
            const result = await processor(items[index], index);
            results[index] = result;
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

    return results;
}
