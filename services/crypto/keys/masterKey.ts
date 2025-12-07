/**
 * Master Key Manager
 *
 * Manages the user's master encryption key:
 * - Key generation
 * - Passphrase-based encryption
 * - Secure storage
 * - Key rotation
 *
 * The master key is the root of the encryption hierarchy and
 * is used to derive album-specific keys.
 *
 * @module Keys/MasterKey
 */

import {
  deriveKeyArgon2id,
  importDerivedKey,
  encryptAES256GCM,
  decryptAES256GCM,
  generateAESKey,
  exportKeyRaw,
  wipeMemory,
} from '../core/cryptoCore';
import {
  initKeyManager,
  hardwareEncrypt,
  hardwareDecrypt,
} from './keyManager';
import {
  storeCryptoKey,
  retrieveCryptoKey,
} from './web/secureStorage';
import {
  EncryptedMasterKey,
  MasterKeyMetadata,
} from '../../../src/types/recovery';
import {
  KeyStorageError,
  KeyStorageErrorCode,
} from '../../../src/types/keyStorage';
import { auth } from '../../../lib/firebase';
import { doc, setDoc, getDoc, getFirestore } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Current master key version */
const MASTER_KEY_VERSION = '1.0.0';

/** Argon2 parameters for master key encryption */
const ARGON2_PARAMS = {
  memory: 65536, // 64 MB
  iterations: 3,
  parallelism: 4,
  keyLength: 32, // 256 bits
};

/** Master key size in bytes */
const MASTER_KEY_SIZE = 32; // 256 bits

/** Key ID prefix */
const MASTER_KEY_ID_PREFIX = 'master_key';

// ============================================================================
// MASTER KEY GENERATION
// ============================================================================

/**
 * Generate new master key
 *
 * Creates a 256-bit master key and encrypts it with the user's passphrase.
 *
 * @param passphrase - User's master passphrase
 * @returns Encrypted master key and metadata
 *
 * @example
 * const { encryptedKey, metadata } = await generateMasterKey('my-secure-passphrase');
 * await storeMasterKey(encryptedKey, metadata);
 */
export async function generateMasterKey(
  passphrase: string
): Promise<{
  encryptedKey: EncryptedMasterKey;
  metadata: MasterKeyMetadata;
  masterKey: Uint8Array; // For immediate use, then wipe
}> {
  // Validate passphrase strength
  validatePassphrase(passphrase);

  try {
    // Generate random master key
    const cryptoKey = await generateAESKey(true); // extractable for export
    const masterKey = await exportKeyRaw(cryptoKey);

    // Derive KEK from passphrase using Argon2id
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kekBytes = await deriveKeyArgon2id({
      password: passphrase,
      salt,
      ...ARGON2_PARAMS,
    });

    // Import KEK for encryption
    const kek = await importDerivedKey(kekBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

    // Encrypt master key with KEK
    const encrypted = await encryptAES256GCM(masterKey, kek);

    // Create encrypted key record
    const encryptedKey: EncryptedMasterKey = {
      ciphertext: btoa(String.fromCharCode(...encrypted.ciphertext)),
      iv: btoa(String.fromCharCode(...encrypted.iv)),
      salt: btoa(String.fromCharCode(...salt)),
      authTag: btoa(String.fromCharCode(...encrypted.authTag)),
      createdAt: Date.now(),
      version: MASTER_KEY_VERSION,
    };

    // Create metadata
    const metadata: MasterKeyMetadata = {
      keyId: `${MASTER_KEY_ID_PREFIX}_${Date.now()}`,
      version: MASTER_KEY_VERSION,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      algorithm: 'argon2id',
      memoryKB: ARGON2_PARAMS.memory,
      iterations: ARGON2_PARAMS.iterations,
      parallelism: ARGON2_PARAMS.parallelism,
    };

    // Wipe sensitive data
    wipeMemory(kekBytes);

    return {
      encryptedKey,
      metadata,
      masterKey, // Return for immediate use, caller must wipe
    };
  } catch (error) {
    throw new KeyStorageError(
      'Failed to generate master key',
      KeyStorageErrorCode.KEY_GENERATION_FAILED,
      error
    );
  }
}

// ============================================================================
// MASTER KEY DECRYPTION
// ============================================================================

/**
 * Decrypt master key
 *
 * Decrypts the master key using the user's passphrase.
 *
 * @param encryptedKey - Encrypted master key
 * @param passphrase - User's passphrase
 * @returns Decrypted master key
 *
 * @throws {KeyStorageError} If decryption fails
 *
 * @example
 * const masterKey = await decryptMasterKey(encryptedKey, 'my-passphrase');
 * // Use master key...
 * wipeMemory(masterKey); // Always wipe when done!
 */
export async function decryptMasterKey(
  encryptedKey: EncryptedMasterKey,
  passphrase: string
): Promise<Uint8Array> {
  try {
    // Deserialize
    const ciphertext = Uint8Array.from(atob(encryptedKey.ciphertext), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encryptedKey.iv), c => c.charCodeAt(0));
    const salt = Uint8Array.from(atob(encryptedKey.salt), c => c.charCodeAt(0));
    const authTag = Uint8Array.from(atob(encryptedKey.authTag!), c => c.charCodeAt(0));

    // Derive KEK from passphrase
    const kekBytes = await deriveKeyArgon2id({
      password: passphrase,
      salt,
      ...ARGON2_PARAMS,
    });

    // Import KEK
    const kek = await importDerivedKey(kekBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);

    // Decrypt master key
    const masterKey = await decryptAES256GCM(
      { ciphertext, iv, authTag },
      kek
    );

    // Wipe sensitive data
    wipeMemory(kekBytes);

    return masterKey;
  } catch (error) {
    throw new KeyStorageError(
      'Failed to decrypt master key - incorrect passphrase or corrupted data',
      KeyStorageErrorCode.DECRYPTION_FAILED,
      error
    );
  }
}

// ============================================================================
// MASTER KEY STORAGE
// ============================================================================

/**
 * Store master key in Firestore
 *
 * Stores encrypted master key and metadata for the current user.
 *
 * @param encryptedKey - Encrypted master key
 * @param metadata - Key metadata
 */
export async function storeMasterKey(
  encryptedKey: EncryptedMasterKey,
  metadata: MasterKeyMetadata
): Promise<void> {
  if (!auth.currentUser) {
    throw new KeyStorageError(
      'User not authenticated',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED
    );
  }

  const db = getFirestore();

  try {
    await setDoc(
      doc(db, 'users', auth.currentUser.uid),
      {
        encryption: {
          masterKey: encryptedKey,
          metadata,
        },
      },
      { merge: true }
    );
  } catch (error) {
    throw new KeyStorageError(
      'Failed to store master key',
      KeyStorageErrorCode.KEY_GENERATION_FAILED,
      error
    );
  }
}

/**
 * Retrieve master key from Firestore
 *
 * @returns Encrypted master key and metadata, or null if not found
 */
export async function retrieveMasterKey(): Promise<{
  encryptedKey: EncryptedMasterKey;
  metadata: MasterKeyMetadata;
} | null> {
  if (!auth.currentUser) {
    throw new KeyStorageError(
      'User not authenticated',
      KeyStorageErrorCode.PLATFORM_NOT_SUPPORTED
    );
  }

  const db = getFirestore();

  try {
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));

    if (!userDoc.exists() || !userDoc.data().encryption) {
      return null;
    }

    const { masterKey: encryptedKey, metadata } = userDoc.data().encryption;

    return { encryptedKey, metadata };
  } catch (error) {
    throw new KeyStorageError(
      'Failed to retrieve master key',
      KeyStorageErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// MASTER KEY INITIALIZATION
// ============================================================================

/**
 * Initialize master key for user
 *
 * Sets up encryption for a new user:
 * 1. Generates master key
 * 2. Encrypts with passphrase
 * 3. Stores in Firestore
 * 4. Caches in memory
 *
 * @param passphrase - User's master passphrase
 * @returns Master key metadata
 *
 * @example
 * await initializeMasterKey('my-secure-passphrase');
 * // User is now set up for encryption
 */
export async function initializeMasterKey(
  passphrase: string
): Promise<MasterKeyMetadata> {
  // Initialize key manager
  await initKeyManager();

  // Generate master key
  const { encryptedKey, metadata, masterKey } = await generateMasterKey(passphrase);

  // Store encrypted master key
  await storeMasterKey(encryptedKey, metadata);

  // Store master key in memory for session
  const cryptoKey = await importDerivedKey(
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await storeCryptoKey(metadata.keyId, cryptoKey);

  // Wipe plaintext master key
  wipeMemory(masterKey);

  return metadata;
}

/**
 * Unlock master key
 *
 * Decrypts master key and stores in memory for session.
 *
 * @param passphrase - User's passphrase
 * @returns Master key metadata
 *
 * @throws {KeyStorageError} If unlock fails
 *
 * @example
 * await unlockMasterKey('my-passphrase');
 * // Master key is now available for encryption operations
 */
export async function unlockMasterKey(passphrase: string): Promise<MasterKeyMetadata> {
  // Retrieve encrypted master key
  const stored = await retrieveMasterKey();

  if (!stored) {
    throw new KeyStorageError(
      'No master key found - user needs to initialize encryption',
      KeyStorageErrorCode.KEY_NOT_FOUND
    );
  }

  // Decrypt master key
  const masterKey = await decryptMasterKey(stored.encryptedKey, passphrase);

  // Store in memory for session
  const cryptoKey = await importDerivedKey(
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await storeCryptoKey(stored.metadata.keyId, cryptoKey);

  // Wipe plaintext master key
  wipeMemory(masterKey);

  // Update last used
  stored.metadata.lastUsed = Date.now();
  await storeMasterKey(stored.encryptedKey, stored.metadata);

  return stored.metadata;
}

/**
 * Check if master key is unlocked
 *
 * @returns True if master key is available in memory
 */
export async function isMasterKeyUnlocked(): Promise<boolean> {
  const stored = await retrieveMasterKey();
  if (!stored) {
    return false;
  }

  const cryptoKey = await retrieveCryptoKey(stored.metadata.keyId);
  return cryptoKey !== null;
}

// ============================================================================
// PASSPHRASE VALIDATION
// ============================================================================

/**
 * Validate passphrase strength
 *
 * Ensures passphrase meets minimum security requirements.
 *
 * @param passphrase - Passphrase to validate
 * @throws {KeyStorageError} If passphrase is too weak
 */
function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 12) {
    throw new KeyStorageError(
      'Passphrase must be at least 12 characters',
      KeyStorageErrorCode.INVALID_CONFIG
    );
  }

  // Check for basic complexity
  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasNumber = /[0-9]/.test(passphrase);
  const hasSpecial = /[^a-zA-Z0-9]/.test(passphrase);

  const complexity = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

  if (complexity < 3) {
    throw new KeyStorageError(
      'Passphrase must include at least 3 of: lowercase, uppercase, numbers, special characters',
      KeyStorageErrorCode.INVALID_CONFIG
    );
  }
}

/**
 * Estimate passphrase strength
 *
 * @param passphrase - Passphrase to check
 * @returns Strength score (0-100)
 */
export function estimatePassphraseStrength(passphrase: string): number {
  let score = 0;

  // Length score (0-40)
  score += Math.min(passphrase.length * 2, 40);

  // Character variety score (0-40)
  const hasLower = /[a-z]/.test(passphrase) ? 10 : 0;
  const hasUpper = /[A-Z]/.test(passphrase) ? 10 : 0;
  const hasNumber = /[0-9]/.test(passphrase) ? 10 : 0;
  const hasSpecial = /[^a-zA-Z0-9]/.test(passphrase) ? 10 : 0;
  score += hasLower + hasUpper + hasNumber + hasSpecial;

  // Uniqueness score (0-20)
  const uniqueChars = new Set(passphrase).size;
  score += Math.min(uniqueChars * 2, 20);

  return Math.min(score, 100);
}
