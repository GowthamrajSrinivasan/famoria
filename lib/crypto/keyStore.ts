import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
    familyKeys: {
        key: string; // 'FAMILY_MASTER_KEY'
        value: {
            id: string; // 'FAMILY_MASTER_KEY'
            key: Uint8Array;
            createdAt: number;
        };
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
const DB_VERSION = 3; // Increment for schema change

/**
 * Initializes the IndexedDB database for holding Hardware Bound Keys and MasterKeys.
 */
let dbPromise: Promise<IDBPDatabase<FamoriaCryptoDB>>;

/**
 * Initializes the IndexedDB database for holding Hardware Bound Keys and MasterKeys.
 */
function getDB() {
    if (!dbPromise) {
        dbPromise = openDB<FamoriaCryptoDB>(DB_NAME, DB_VERSION, {
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

                // Create familyKeys store for v3
                if (oldVersion < 3 && !db.objectStoreNames.contains('familyKeys')) {
                    db.createObjectStore('familyKeys', { keyPath: 'id' });
                }
            },
        });
    }
    return dbPromise;
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
    await db.clear('familyKeys'); // Clear family key
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

// === FAMILY KEY FUNCTIONS ===

const FAMILY_KEY_ID = 'FAMILY_MASTER_KEY';

/**
 * Saves a Family Master Key to IndexedDB.
 */
export async function saveFamilyKey(key: Uint8Array, familyId: string = FAMILY_KEY_ID) {
    try {
        console.log(`[KeyStore] Saving Family Key to IDB for FID: ${familyId}`);
        const db = await getDB();
        await db.put('familyKeys', {
            id: familyId,
            key,
            createdAt: Date.now()
        });
        console.log(`[KeyStore] Family Master Key SUCCESSFULLY saved for FID: ${familyId}`);
    } catch (e) {
        console.error(`[KeyStore] FAILED to save Family Key for FID: ${familyId}`, e);
        throw e;
    }
}

/**
 * Retrieves a Family Master Key from IndexedDB.
 * If familyId is provided, looks for that specific key.
 * Otherwise, tries the legacy FAMILY_MASTER_KEY.
 */
export async function getFamilyKey(familyId?: string): Promise<Uint8Array | undefined> {
    try {
        const db = await getDB();

        // 1. Try specific familyId if provided
        if (familyId) {
            console.log(`[KeyStore] Retrieving Key for FID: ${familyId}`);
            const record = await db.get('familyKeys', familyId);
            if (record) return record.key;
        }

        // 2. Try legacy fallback if no familyId or not found
        console.log(`[KeyStore] Checking Legacy Family Key fallback...`);
        const legacyRecord = await db.get('familyKeys', FAMILY_KEY_ID);
        if (legacyRecord) {
            console.log('[KeyStore] Legacy Family Key FOUND');
            return legacyRecord.key;
        }

        console.log('[KeyStore] No Family Key found');
        return undefined;
    } catch (e) {
        console.error('[KeyStore] Error retrieving Family Key:', e);
        return undefined;
    }
}

/**
 * Deletes a Family Master Key.
 */
export async function deleteFamilyKey(familyId: string = FAMILY_KEY_ID) {
    const db = await getDB();
    await db.delete('familyKeys', familyId);
}
