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
    masterKeys: {
        key: string; // albumId
        value: {
            albumId: string;
            masterKey: Uint8Array; // Plain MasterKey for instant unlock
            createdAt: number;
        };
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'FamoriaCrypto';
const DB_VERSION = 2; // Increment for schema change

/**
 * Initializes the IndexedDB database for holding Hardware Bound Keys and MasterKeys.
 */
async function getDB() {
    return openDB<FamoriaCryptoDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // Create keys store if it doesn't exist
            if (!db.objectStoreNames.contains('keys')) {
                const store = db.createObjectStore('keys', { keyPath: 'albumId' });
                store.createIndex('by-date', 'createdAt');
            }

            // Create masterKeys store for v2
            if (oldVersion < 2 && !db.objectStoreNames.contains('masterKeys')) {
                const masterStore = db.createObjectStore('masterKeys', { keyPath: 'albumId' });
                masterStore.createIndex('by-date', 'createdAt');
            }
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
    await db.clear('masterKeys'); // Also clear master keys
}

/**
 * Saves a plain MasterKey to IndexedDB for instant unlock.
 * This enables auto-unlock without requiring Google Drive access.
 */
export async function saveMasterKey(albumId: string, masterKey: Uint8Array) {
    const db = await getDB();
    await db.put('masterKeys', {
        albumId,
        masterKey,
        createdAt: Date.now(),
    });
    console.log(`[KeyStore] MasterKey saved to IDB for album ${albumId}`);
}

/**
 * Retrieves the plain MasterKey for instant unlock.
 * Returns undefined if MasterKey hasn't been saved yet.
 */
export async function getMasterKey(albumId: string): Promise<Uint8Array | undefined> {
    const db = await getDB();
    const record = await db.get('masterKeys', albumId);
    return record?.masterKey;
}

/**
 * Deletes a MasterKey from IndexedDB.
 */
export async function deleteMasterKey(albumId: string) {
    const db = await getDB();
    await db.delete('masterKeys', albumId);
}
