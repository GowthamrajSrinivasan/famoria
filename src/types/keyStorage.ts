/**
 * Key Storage Type Definitions
 *
 * Types for hardware-backed (web: non-extractable) key storage.
 *
 * Web Security Model:
 * - Non-extractable CryptoKeys (closest to hardware-backed on web)
 * - IndexedDB for encrypted key material
 * - WebAuthn for biometric authentication
 *
 * @module Types/KeyStorage
 */

// ============================================================================
// KEY TYPES
// ============================================================================

/**
 * Key Type Enum
 *
 * Identifies the purpose of stored keys.
 */
export enum KeyType {
  /** Master Key Encryption Key - encrypts the user's master key */
  MASTER_KEY_ENCRYPTION_KEY = 'master_kek',

  /** User's RSA Private Key - decrypts Family Album keys */
  USER_PRIVATE_KEY = 'user_private_key',

  /** Biometric Unlock Key - for quick unlock with biometrics */
  BIOMETRIC_UNLOCK_KEY = 'biometric_unlock',

  /** Device Encryption Key - device-specific encryption */
  DEVICE_ENCRYPTION_KEY = 'device_encryption',
}

/**
 * Stored Key Metadata
 *
 * Metadata about keys stored in hardware/secure storage.
 * Does NOT contain the actual key material.
 */
export interface StoredKey {
  /** Unique key identifier */
  keyId: string;

  /** Key type/purpose */
  type: KeyType;

  /** Key algorithm (e.g., 'AES-GCM', 'RSA-OAEP') */
  algorithm: string;

  /** Key size in bits */
  keySize: number;

  /** Creation timestamp */
  createdAt: number;

  /** Last usage timestamp */
  lastUsed: number;

  /** Platform where key was created */
  platform: 'web' | 'ios' | 'android';

  /** Whether key requires biometric authentication */
  requiresBiometric: boolean;

  /** Whether key is hardware-backed (non-extractable) */
  isHardwareBacked: boolean;
}

/**
 * Encryption Result
 *
 * Result of hardware/secure encryption operation.
 */
export interface EncryptionResult {
  /** Encrypted data */
  ciphertext: Uint8Array;

  /** Initialization vector (if applicable) */
  iv: Uint8Array;

  /** Authentication tag (for AEAD modes) */
  authTag: Uint8Array;

  /** Salt (for key derivation) */
  salt?: Uint8Array;
}

// ============================================================================
// WEB-SPECIFIC TYPES
// ============================================================================

/**
 * Web Crypto Key Configuration
 *
 * Configuration for generating non-extractable keys on web.
 */
export interface WebKeyConfig {
  /** Key type */
  type: KeyType;

  /** Algorithm */
  algorithm: 'AES-GCM' | 'RSA-OAEP';

  /** Key length in bits */
  length: 128 | 256 | 2048 | 4096;

  /** Key usages */
  usages: KeyUsage[];

  /** Whether key can be extracted (false for security) */
  extractable: boolean;

  /** Require biometric authentication */
  requireBiometric: boolean;
}

/**
 * IndexedDB Stored Key Entry
 *
 * Structure for keys stored in IndexedDB.
 */
export interface IDBKeyEntry {
  /** Key identifier */
  keyId: string;

  /** Encrypted key material (for extractable keys only) */
  encryptedKey?: Uint8Array;

  /** IV for encrypted key */
  iv?: Uint8Array;

  /** Salt for key derivation */
  salt?: Uint8Array;

  /** Key metadata */
  metadata: StoredKey;

  /** Creation timestamp */
  createdAt: number;
}

/**
 * Key Derivation Parameters
 *
 * Parameters for deriving encryption keys.
 */
export interface KeyDerivationConfig {
  /** Password/passphrase */
  password: string;

  /** Salt */
  salt: Uint8Array;

  /** Memory cost (KB) */
  memory: number;

  /** Time cost (iterations) */
  iterations: number;

  /** Parallelism */
  parallelism: number;

  /** Output key length */
  keyLength: number;
}

// ============================================================================
// BIOMETRIC AUTHENTICATION
// ============================================================================

/**
 * Biometric Availability
 *
 * Information about biometric authentication support.
 */
export interface BiometricAvailability {
  /** Whether biometrics are available */
  available: boolean;

  /** Type of biometric (if available) */
  biometryType: 'fingerprint' | 'face' | 'iris' | 'webauthn' | null;

  /** Platform support */
  platform: 'web' | 'ios' | 'android';
}

/**
 * Biometric Authentication Result
 *
 * Result of biometric authentication attempt.
 */
export interface BiometricAuthResult {
  /** Whether authentication succeeded */
  success: boolean;

  /** Error message (if failed) */
  error?: string;

  /** Signature (for WebAuthn) */
  signature?: ArrayBuffer;

  /** Credential ID (for WebAuthn) */
  credentialId?: string;
}

/**
 * WebAuthn Credential
 *
 * WebAuthn credential for biometric authentication.
 */
export interface WebAuthnCredential {
  /** Credential ID */
  id: string;

  /** Raw credential ID */
  rawId: ArrayBuffer;

  /** Public key */
  publicKey: ArrayBuffer;

  /** Credential type */
  type: 'public-key';

  /** Creation timestamp */
  createdAt: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Key Storage Error
 *
 * Custom error for key storage operations.
 */
export class KeyStorageError extends Error {
  constructor(
    message: string,
    public code: KeyStorageErrorCode,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'KeyStorageError';
  }
}

/**
 * Key Storage Error Codes
 */
export enum KeyStorageErrorCode {
  /** Key not found */
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',

  /** Biometric authentication failed */
  BIOMETRIC_AUTH_FAILED = 'BIOMETRIC_AUTH_FAILED',

  /** Biometric not available */
  BIOMETRIC_NOT_AVAILABLE = 'BIOMETRIC_NOT_AVAILABLE',

  /** Platform not supported */
  PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED',

  /** Key generation failed */
  KEY_GENERATION_FAILED = 'KEY_GENERATION_FAILED',

  /** Encryption failed */
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',

  /** Decryption failed */
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',

  /** Invalid key configuration */
  INVALID_CONFIG = 'INVALID_CONFIG',

  /** Storage quota exceeded */
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
}
