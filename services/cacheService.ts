/**
 * Cache Service for Decrypted Photo Storage
 * Uses IndexedDB for persistent client-side caching with LRU eviction
 */

const DB_NAME = 'famoria-cache';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB default limit

export interface CachedPhoto {
    photoId: string;
    albumId: string;
    blob: Blob;
    type: 'full' | 'thumbnail';
    lastAccessed: number;
    size: number;
}

export interface CacheMetrics {
    totalSize: number;
    totalItems: number;
    hitRate: number;
    thumbnailCount: number;
    fullImageCount: number;
}

class CacheService {
    private db: IDBDatabase | null = null;
    private cacheHits = 0;
    private cacheMisses = 0;

    /**
     * Initialize IndexedDB
     */
    async init(): Promise<void> {
        if (this.db) return; // Already initialized

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(PHOTO_STORE)) {
                    const store = db.createObjectStore(PHOTO_STORE, { keyPath: ['photoId', 'type'] });
                    store.createIndex('albumId', 'albumId', { unique: false });
                    store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                    store.createIndex('size', 'size', { unique: false });
                }
            };
        });
    }

    /**
     * Ensure DB is initialized before operations
     */
    private async ensureDB(): Promise<IDBDatabase> {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) {
            throw new Error('Failed to initialize IndexedDB');
        }
        return this.db;
    }

    /**
     * Get cached decrypted photo
     */
    async getCachedDecryptedPhoto(photoId: string, type: 'full' | 'thumbnail'): Promise<Blob | null> {
        const db = await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readwrite');
            const store = transaction.objectStore(PHOTO_STORE);
            const request = store.get([photoId, type]);

            request.onsuccess = async () => {
                const cached = request.result as CachedPhoto | undefined;

                if (cached) {
                    // Update last accessed time
                    cached.lastAccessed = Date.now();
                    await this.updateCacheEntry(cached);

                    this.cacheHits++;
                    resolve(cached.blob);
                } else {
                    this.cacheMisses++;
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('[CacheService] Error getting cached photo:', request.error);
                this.cacheMisses++;
                resolve(null); // Fail gracefully
            };
        });
    }

    /**
     * Update cache entry (for lastAccessed time)
     */
    private async updateCacheEntry(entry: CachedPhoto): Promise<void> {
        const db = await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readwrite');
            const store = transaction.objectStore(PHOTO_STORE);
            const request = store.put(entry);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Set cached decrypted photo
     */
    async setCachedDecryptedPhoto(
        photoId: string,
        albumId: string,
        blob: Blob,
        type: 'full' | 'thumbnail'
    ): Promise<void> {
        const db = await this.ensureDB();
        const size = blob.size;

        // Check if we need to evict
        const currentSize = await this.getCacheSize();
        if (currentSize + size > MAX_CACHE_SIZE) {
            await this.evictLRU(size);
        }

        const entry: CachedPhoto = {
            photoId,
            albumId,
            blob,
            type,
            lastAccessed: Date.now(),
            size
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readwrite');
            const store = transaction.objectStore(PHOTO_STORE);
            const request = store.put(entry);

            request.onsuccess = () => {
                console.log(`[CacheService] Cached ${type} for photo ${photoId} (${(size / 1024).toFixed(1)}KB)`);
                resolve();
            };

            request.onerror = () => {
                console.error('[CacheService] Error caching photo:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Evict least recently used items to free up space
     */
    async evictLRU(requiredSpace: number): Promise<void> {
        const db = await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readwrite');
            const store = transaction.objectStore(PHOTO_STORE);
            const index = store.index('lastAccessed');
            const request = index.openCursor();

            let freedSpace = 0;
            const itemsToDelete: [string, string][] = [];

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

                if (cursor && freedSpace < requiredSpace) {
                    const cached = cursor.value as CachedPhoto;
                    itemsToDelete.push([cached.photoId, cached.type]);
                    freedSpace += cached.size;
                    cursor.continue();
                } else {
                    // Delete items
                    itemsToDelete.forEach(([photoId, type]) => {
                        store.delete([photoId, type]);
                    });

                    console.log(`[CacheService] Evicted ${itemsToDelete.length} items (${(freedSpace / 1024).toFixed(1)}KB)`);
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get total cache size
     */
    async getCacheSize(): Promise<number> {
        const db = await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readonly');
            const store = transaction.objectStore(PHOTO_STORE);
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result as CachedPhoto[];
                const totalSize = items.reduce((sum, item) => sum + item.size, 0);
                resolve(totalSize);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear cache for specific album (used when album is locked)
     */
    async clearAlbumCache(albumId: string): Promise<void> {
        const db = await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readwrite');
            const store = transaction.objectStore(PHOTO_STORE);
            const index = store.index('albumId');
            const request = index.openCursor(IDBKeyRange.only(albumId));

            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                } else {
                    console.log(`[CacheService] Cleared ${deletedCount} items for album ${albumId}`);
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear entire cache
     */
    async clearAllCache(): Promise<void> {
        const db = await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readwrite');
            const store = transaction.objectStore(PHOTO_STORE);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('[CacheService] Cleared all cache');
                this.cacheHits = 0;
                this.cacheMisses = 0;
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get cache metrics
     */
    async getMetrics(): Promise<CacheMetrics> {
        const db = await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PHOTO_STORE], 'readonly');
            const store = transaction.objectStore(PHOTO_STORE);
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result as CachedPhoto[];
                const totalSize = items.reduce((sum, item) => sum + item.size, 0);
                const thumbnailCount = items.filter(i => i.type === 'thumbnail').length;
                const fullImageCount = items.filter(i => i.type === 'full').length;

                const totalRequests = this.cacheHits + this.cacheMisses;
                const hitRate = totalRequests > 0 ? this.cacheHits / totalRequests : 0;

                resolve({
                    totalSize,
                    totalItems: items.length,
                    hitRate,
                    thumbnailCount,
                    fullImageCount
                });
            };

            request.onerror = () => reject(request.error);
        });
    }
}

// Export singleton instance
export const cacheService = new CacheService();

// Auto-initialize on import
cacheService.init().catch(console.error);
