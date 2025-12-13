import { openDB, DBSchema } from 'idb';

interface FamoriaCryptoDB extends DBSchema {
    keys: {
        key: string; // albumId
        value: {
            albumId: string;
            deviceKey: CryptoKey;
            iv?: Uint8Array; // Optional: if we ever need to store IVs for device-specific wrapping
            createdAt: number;
        };
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'FamoriaCrypto';
const DB_VERSION = 1;

/**
 * Initializes the IndexedDB database for holding Hardware Bound Keys.
 */
async function getDB() {
    return openDB<FamoriaCryptoDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            const store = db.createObjectStore('keys', { keyPath: 'albumId' });
            store.createIndex('by-date', 'createdAt');
        },
    });
}

/**
 * Saves a non-extractable Device Key to IndexedDB.
 * This key is bound to this browser/device only.
 */
export async function saveDeviceKey(albumId: string, deviceKey: CryptoKey) {
    const db = await getDB();
    await db.put('keys', {
        albumId,
        deviceKey,
        createdAt: Date.now(),
    });
}

/**
 * Retrieves the Device Key for a specific album.
 * Returns undefined if this device has not been authorized for this album.
 */
export async function getDeviceKey(albumId: string): Promise<CryptoKey | undefined> {
    const db = await getDB();
    const record = await db.get('keys', albumId);
    return record?.deviceKey;
}

/**
 * Deletes a Device Key (e.g., on sign out or revoking access).
 */
export async function deleteDeviceKey(albumId: string) {
    const db = await getDB();
    await db.delete('keys', albumId);
}

/**
 * Clears all keys (e.g., Factory Reset / Full Sign Out).
 */
export async function clearAllDeviceKeys() {
    const db = await getDB();
    await db.clear('keys');
}
