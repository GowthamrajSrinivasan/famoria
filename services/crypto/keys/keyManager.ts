/**
 * Cross-Platform Key Manager
 *
 * Manages cryptographic keys with hardware-backed security where available.
 *
 * Web Platform Security:
 * - Non-extractable CryptoKeys (cannot be exported)
 * - IndexedDB for encrypted backup
 * - WebAuthn for biometric authentication
 *
 * @module KeyManager
 */

import {
  StoredKey,
  KeyType,
  EncryptionResult,
  KeyStorageError,
  KeyStorageErrorCode,
  WebKeyConfig,
} from '../../../src/types/keyStorage';
import {
  initSecureStorage,
  storeEncryptedKey,
  retrieveEncryptedKey,
  deleteEncryptedKey,
  storeCryptoKey,
  retrieveCryptoKey,
  deleteCryptoKey,
  listStoredKeys,
  getKeysByType,
  updateKeyLastUsed,
} from './web/secureStorage';
import {
  encryptAES256GCM,
  decryptAES256GCM,
  generateAESKey,
  generateRSAKeyPair,
  exportKeyRaw,
  exportRSAPrivateKey,
  exportRSAPublicKey,
  importRSAPrivateKey,
  importRSAPublicKey,
} from '../core/cryptoCore';
import { auth } from '../../../lib/firebase';
import { doc, setDoc, getFirestore } from 'firebase/firestore';

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize key manager
 *
 * Must be called before using any key manager functions.
 */
export async function initKeyManager(): Promise<void> {
  if (initialized) {
    return;
  }

  await initSecureStorage();
  initialized = true;
}

/**
 * Ensure key manager is initialized
 */
function ensureInitialized(): void {
  if (!initialized) {
    throw new KeyStorageError(
      'Key manager not initialized. Call initKeyManager() first.',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED
    );
  }
}

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate hardware-backed key (non-extractable on web)
 *
 * @param type - Key type/purpose
 * @param config - Key configuration
 * @returns Stored key metadata
 */
export async function generateHardwareKey(
  type: KeyType,
  config?: Partial<WebKeyConfig>
): Promise<StoredKey> {
  ensureInitialized();

  const keyId = `famoria_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Default configuration
  const keyConfig: WebKeyConfig = {
    type,
    algorithm: config?.algorithm || 'AES-GCM',
    length: config?.length || 256,
    usages: config?.usages || ['encrypt', 'decrypt'],
    extractable: false, // Non-extractable for security
    requireBiometric: config?.requireBiometric ?? false,
  };

  let cryptoKey: CryptoKey;
  let algorithm: string;
  let keySize: number;

  try {
    // Generate non-extractable CryptoKey
    if (keyConfig.algorithm === 'AES-GCM') {
      cryptoKey = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: keyConfig.length,
        },
        keyConfig.extractable,
        keyConfig.usages
      );
      algorithm = 'AES-GCM';
      keySize = keyConfig.length;
    } else if (keyConfig.algorithm === 'RSA-OAEP') {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: keyConfig.length,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        keyConfig.extractable,
        keyConfig.usages
      );
      cryptoKey = keyPair.privateKey;
      algorithm = 'RSA-OAEP';
      keySize = keyConfig.length;
    } else {
      throw new KeyStorageError(
        `Unsupported algorithm: ${keyConfig.algorithm}`,
        KeyStorageErrorCode.INVALID_CONFIG
      );
    }

    // Store non-extractable key in memory
    await storeCryptoKey(keyId, cryptoKey);

    // Create metadata
    const storedKey: StoredKey = {
      keyId,
      type,
      algorithm,
      keySize,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      platform: 'web',
      requiresBiometric: keyConfig.requireBiometric,
      isHardwareBacked: !keyConfig.extractable, // Non-extractable = hardware-backed on web
    };

    // Store metadata in IndexedDB (without key material for non-extractable keys)
    await storeEncryptedKey(
      keyId,
      new Uint8Array(0), // No encrypted key for non-extractable
      new Uint8Array(0), // No IV
      new Uint8Array(0), // No salt
      storedKey
    );

    // Store metadata in Firestore (NOT the key itself!)
    await storeKeyMetadata(storedKey);

    return storedKey;
  } catch (error) {
    throw new KeyStorageError(
      'Failed to generate hardware key',
      KeyStorageErrorCode.KEY_GENERATION_FAILED,
      error
    );
  }
}

/**
 * Generate extractable key for backup/export
 *
 * Less secure than non-extractable keys, but allows backup.
 *
 * @param type - Key type
 * @param encryptionKey - Key to encrypt the generated key with
 * @returns Stored key metadata
 */
export async function generateExtractableKey(
  type: KeyType,
  encryptionKey: CryptoKey
): Promise<StoredKey> {
  ensureInitialized();

  const keyId = `famoria_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    // Generate extractable AES key
    const cryptoKey = await generateAESKey(true); // extractable = true

    // Export and encrypt the key
    const rawKey = await exportKeyRaw(cryptoKey);
    const encrypted = await encryptAES256GCM(rawKey, encryptionKey);

    // Store encrypted key in IndexedDB
    const metadata: StoredKey = {
      keyId,
      type,
      algorithm: 'AES-GCM',
      keySize: 256,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      platform: 'web',
      requiresBiometric: false,
      isHardwareBacked: false,
    };

    await storeEncryptedKey(
      keyId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.salt || new Uint8Array(16),
      metadata
    );

    // Also store in memory for quick access
    await storeCryptoKey(keyId, cryptoKey);

    // Store metadata in Firestore
    await storeKeyMetadata(metadata);

    return metadata;
  } catch (error) {
    throw new KeyStorageError(
      'Failed to generate extractable key',
      KeyStorageErrorCode.KEY_GENERATION_FAILED,
      error
    );
  }
}

// ============================================================================
// KEY OPERATIONS
// ============================================================================

/**
 * Encrypt data with hardware key
 *
 * @param keyId - Key identifier
 * @param plaintext - Data to encrypt
 * @param additionalData - Optional AAD for AEAD
 * @returns Encryption result
 */
export async function hardwareEncrypt(
  keyId: string,
  plaintext: Uint8Array,
  additionalData?: Uint8Array
): Promise<EncryptionResult> {
  ensureInitialized();

  try {
    // Retrieve CryptoKey from memory
    const cryptoKey = await retrieveCryptoKey(keyId);

    if (!cryptoKey) {
      throw new KeyStorageError(
        `Key not found: ${keyId}`,
        KeyStorageErrorCode.KEY_NOT_FOUND
      );
    }

    // Update last used
    await updateKeyLastUsed(keyId);

    // Encrypt using Web Crypto API
    if (cryptoKey.algorithm.name === 'AES-GCM') {
      return await encryptAES256GCM(plaintext, cryptoKey, additionalData);
    } else {
      throw new KeyStorageError(
        'Unsupported key algorithm for encryption',
        KeyStorageErrorCode.ENCRYPTION_FAILED
      );
    }
  } catch (error) {
    if (error instanceof KeyStorageError) {
      throw error;
    }
    throw new KeyStorageError(
      'Hardware encryption failed',
      KeyStorageErrorCode.ENCRYPTION_FAILED,
      error
    );
  }
}

/**
 * Decrypt data with hardware key
 *
 * @param keyId - Key identifier
 * @param encryptionResult - Encrypted data
 * @param additionalData - Optional AAD for AEAD
 * @returns Decrypted data
 */
export async function hardwareDecrypt(
  keyId: string,
  encryptionResult: EncryptionResult,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  ensureInitialized();

  try {
    // Retrieve CryptoKey from memory
    const cryptoKey = await retrieveCryptoKey(keyId);

    if (!cryptoKey) {
      throw new KeyStorageError(
        `Key not found: ${keyId}`,
        KeyStorageErrorCode.KEY_NOT_FOUND
      );
    }

    // Update last used
    await updateKeyLastUsed(keyId);

    // Decrypt using Web Crypto API
    if (cryptoKey.algorithm.name === 'AES-GCM') {
      return await decryptAES256GCM(encryptionResult, cryptoKey, additionalData);
    } else {
      throw new KeyStorageError(
        'Unsupported key algorithm for decryption',
        KeyStorageErrorCode.DECRYPTION_FAILED
      );
    }
  } catch (error) {
    if (error instanceof KeyStorageError) {
      throw error;
    }
    throw new KeyStorageError(
      'Hardware decryption failed',
      KeyStorageErrorCode.DECRYPTION_FAILED,
      error
    );
  }
}

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * Get key metadata by ID
 *
 * @param keyId - Key identifier
 * @returns Key metadata or null
 */
export async function getKeyMetadata(keyId: string): Promise<StoredKey | null> {
  ensureInitialized();

  const entry = await retrieveEncryptedKey(keyId);
  return entry?.metadata || null;
}

/**
 * List all keys
 *
 * @returns Array of key metadata
 */
export async function getAllKeys(): Promise<StoredKey[]> {
  ensureInitialized();
  return await listStoredKeys();
}

/**
 * Get keys by type
 *
 * @param type - Key type
 * @returns Array of matching keys
 */
export async function getKeysByKeyType(type: KeyType): Promise<StoredKey[]> {
  ensureInitialized();
  return await getKeysByType(type);
}

/**
 * Delete key
 *
 * Removes key from both memory and persistent storage.
 *
 * @param keyId - Key identifier
 */
export async function deleteKey(keyId: string): Promise<void> {
  ensureInitialized();

  try {
    // Delete from memory
    await deleteCryptoKey(keyId);

    // Delete from IndexedDB
    await deleteEncryptedKey(keyId);
  } catch (error) {
    throw new KeyStorageError(
      'Failed to delete key',
      KeyStorageErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// METADATA STORAGE
// ============================================================================

/**
 * Store key metadata in Firestore
 *
 * Stores metadata only (NOT the key itself) for recovery/management.
 *
 * @param key - Key metadata
 */
async function storeKeyMetadata(key: StoredKey): Promise<void> {
  if (!auth.currentUser) {
    throw new KeyStorageError(
      'User not authenticated',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED
    );
  }

  const db = getFirestore();
  await setDoc(
    doc(db, 'users', auth.currentUser.uid, 'keyMetadata', key.keyId),
    {
      type: key.type,
      algorithm: key.algorithm,
      keySize: key.keySize,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      platform: key.platform,
      requiresBiometric: key.requiresBiometric,
      isHardwareBacked: key.isHardwareBacked,
    }
  );
}

/**
 * Get current user ID
 */
function getCurrentUserId(): string {
  if (!auth.currentUser) {
    throw new KeyStorageError(
      'User not authenticated',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED
    );
  }
  return auth.currentUser.uid;
}
