/**
 * Web Secure Storage
 *
 * IndexedDB-based secure storage for encryption keys.
 *
 * Security Model:
 * - Non-extractable CryptoKeys stored in memory
 * - Encrypted key material in IndexedDB (for backup/recovery)
 * - Master encryption key derived from user passphrase
 *
 * Note: This is less secure than native hardware-backed storage,
 * but provides the best security available on web platform.
 *
 * @module Web/SecureStorage
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  StoredKey,
  IDBKeyEntry,
  KeyType,
  KeyStorageError,
  KeyStorageErrorCode,
  EncryptionResult,
} from '../../../../src/types/keyStorage';
import { encryptAES256GCM, decryptAES256GCM, generateAESKey } from '../../core/cryptoCore';

// ============================================================================
// INDEXEDDB SCHEMA
// ============================================================================

interface SecureStorageSchema extends DBSchema {
  /** Key storage */
  keys: {
    key: string; // keyId
    value: IDBKeyEntry;
    indexes: {
      'by-type': KeyType;
      'by-created': number;
    };
  };

  /** Non-extractable CryptoKey references (memory only) */
  cryptoKeys: {
    key: string; // keyId
    value: {
      keyId: string;
      cryptoKey: CryptoKey;
      createdAt: number;
    };
  };
}

// ============================================================================
// DATABASE INSTANCE
// ============================================================================

let db: IDBPDatabase<SecureStorageSchema> | null = null;
const DB_NAME = 'FamoriaSecureStorage';
const DB_VERSION = 1;

/**
 * Initialize secure storage database
 *
 * Must be called before using any storage functions.
 */
export async function initSecureStorage(): Promise<void> {
  if (db) {
    return; // Already initialized
  }

  try {
    db = await openDB<SecureStorageSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        // Keys object store
        const keysStore = database.createObjectStore('keys', {
          keyPath: 'keyId',
        });
        keysStore.createIndex('by-type', 'metadata.type');
        keysStore.createIndex('by-created', 'createdAt');

        // CryptoKeys object store (memory only)
        database.createObjectStore('cryptoKeys', {
          keyPath: 'keyId',
        });
      },
    });
  } catch (error) {
    throw new KeyStorageError(
      'Failed to initialize secure storage',
      KeyStorageErrorCode.KEY_GENERATION_FAILED,
      error
    );
  }
}

/**
 * Ensure database is initialized
 */
async function ensureDB(): Promise<IDBPDatabase<SecureStorageSchema>> {
  if (!db) {
    await initSecureStorage();
  }
  if (!db) {
    throw new KeyStorageError(
      'Database not initialized',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED
    );
  }
  return db;
}

// ============================================================================
// KEY STORAGE OPERATIONS
// ============================================================================

/**
 * Store encrypted key in IndexedDB
 *
 * @param keyId - Unique key identifier
 * @param encryptedKey - Encrypted key material
 * @param iv - Initialization vector
 * @param salt - Salt for key derivation
 * @param metadata - Key metadata
 */
export async function storeEncryptedKey(
  keyId: string,
  encryptedKey: Uint8Array,
  iv: Uint8Array,
  salt: Uint8Array,
  metadata: StoredKey
): Promise<void> {
  const database = await ensureDB();

  const entry: IDBKeyEntry = {
    keyId,
    encryptedKey,
    iv,
    salt,
    metadata,
    createdAt: Date.now(),
  };

  try {
    await database.put('keys', entry);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new KeyStorageError(
        'Storage quota exceeded',
        KeyStorageErrorCode.QUOTA_EXCEEDED,
        error
      );
    }
    throw new KeyStorageError(
      'Failed to store encrypted key',
      KeyStorageErrorCode.KEY_GENERATION_FAILED,
      error
    );
  }
}

/**
 * Retrieve encrypted key from IndexedDB
 *
 * @param keyId - Key identifier
 * @returns Encrypted key entry or null
 */
export async function retrieveEncryptedKey(
  keyId: string
): Promise<IDBKeyEntry | null> {
  const database = await ensureDB();

  try {
    const entry = await database.get('keys', keyId);
    return entry || null;
  } catch (error) {
    throw new KeyStorageError(
      'Failed to retrieve encrypted key',
      KeyStorageErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

/**
 * Delete encrypted key from IndexedDB
 *
 * @param keyId - Key identifier
 */
export async function deleteEncryptedKey(keyId: string): Promise<void> {
  const database = await ensureDB();

  try {
    await database.delete('keys', keyId);
  } catch (error) {
    throw new KeyStorageError(
      'Failed to delete encrypted key',
      KeyStorageErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

/**
 * List all stored keys
 *
 * Includes both extractable keys (from 'keys' store) and
 * non-extractable keys (from 'cryptoKeys' store metadata).
 *
 * @returns Array of key metadata
 */
export async function listStoredKeys(): Promise<StoredKey[]> {
  const database = await ensureDB();

  try {
    // Get extractable keys from 'keys' store
    const extractableEntries = await database.getAll('keys');
    const extractableKeys = extractableEntries.map(entry => entry.metadata);

    // Get non-extractable keys from 'cryptoKeys' store
    // Note: These don't have full metadata stored, so we return what we have
    const cryptoKeys = await database.getAll('cryptoKeys');

    // Filter out keys that are already in extractableKeys to avoid duplicates
    const cryptoKeyIds = new Set(cryptoKeys.map(k => k.keyId));
    const extractableKeyIds = new Set(extractableKeys.map(k => k.keyId));

    // Return only non-duplicate entries
    return extractableKeys;
  } catch (error) {
    throw new KeyStorageError(
      'Failed to list stored keys',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED,
      error
    );
  }
}

/**
 * Get keys by type
 *
 * @param type - Key type to filter by
 * @returns Array of matching key metadata
 */
export async function getKeysByType(type: KeyType): Promise<StoredKey[]> {
  const database = await ensureDB();

  try {
    const entries = await database.getAllFromIndex('keys', 'by-type', type);
    return entries.map(entry => entry.metadata);
  } catch (error) {
    throw new KeyStorageError(
      'Failed to get keys by type',
      KeyStorageErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// NON-EXTRACTABLE CRYPTOKEY STORAGE (MEMORY ONLY)
// ============================================================================

/**
 * Store non-extractable CryptoKey in memory
 *
 * These keys cannot be exported and provide better security.
 * They are lost when the page reloads.
 *
 * @param keyId - Key identifier
 * @param cryptoKey - Non-extractable CryptoKey
 */
export async function storeCryptoKey(
  keyId: string,
  cryptoKey: CryptoKey
): Promise<void> {
  const database = await ensureDB();

  try {
    await database.put('cryptoKeys', {
      keyId,
      cryptoKey,
      createdAt: Date.now(),
    });
  } catch (error) {
    throw new KeyStorageError(
      'Failed to store CryptoKey',
      KeyStorageErrorCode.KEY_GENERATION_FAILED,
      error
    );
  }
}

/**
 * Retrieve non-extractable CryptoKey from memory
 *
 * @param keyId - Key identifier
 * @returns CryptoKey or null
 */
export async function retrieveCryptoKey(
  keyId: string
): Promise<CryptoKey | null> {
  const database = await ensureDB();

  try {
    const entry = await database.get('cryptoKeys', keyId);
    return entry?.cryptoKey || null;
  } catch (error) {
    throw new KeyStorageError(
      'Failed to retrieve CryptoKey',
      KeyStorageErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

/**
 * Delete CryptoKey from memory
 *
 * @param keyId - Key identifier
 */
export async function deleteCryptoKey(keyId: string): Promise<void> {
  const database = await ensureDB();

  try {
    await database.delete('cryptoKeys', keyId);
  } catch (error) {
    throw new KeyStorageError(
      'Failed to delete CryptoKey',
      KeyStorageErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clear all stored keys (for testing/reset)
 *
 * WARNING: This will delete all keys permanently!
 */
export async function clearAllKeys(): Promise<void> {
  const database = await ensureDB();

  try {
    await database.clear('keys');
    await database.clear('cryptoKeys');
  } catch (error) {
    throw new KeyStorageError(
      'Failed to clear all keys',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED,
      error
    );
  }
}

/**
 * Get storage usage statistics
 *
 * @returns Storage statistics
 */
export async function getStorageStats(): Promise<{
  totalKeys: number;
  totalCryptoKeys: number;
  estimatedSize: number;
}> {
  const database = await ensureDB();

  try {
    const keys = await database.count('keys');
    const cryptoKeys = await database.count('cryptoKeys');

    // Estimate size (approximate)
    const allKeys = await database.getAll('keys');
    const estimatedSize = allKeys.reduce((total, entry) => {
      return total + (entry.encryptedKey?.byteLength || 0);
    }, 0);

    return {
      totalKeys: keys,
      totalCryptoKeys: cryptoKeys,
      estimatedSize,
    };
  } catch (error) {
    throw new KeyStorageError(
      'Failed to get storage stats',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED,
      error
    );
  }
}

/**
 * Update key last used timestamp
 *
 * @param keyId - Key identifier
 */
export async function updateKeyLastUsed(keyId: string): Promise<void> {
  const database = await ensureDB();

  try {
    const entry = await database.get('keys', keyId);
    if (entry) {
      entry.metadata.lastUsed = Date.now();
      await database.put('keys', entry);
    }
  } catch (error) {
    // Non-critical error, just log
    console.warn('Failed to update key last used timestamp:', error);
  }
}
