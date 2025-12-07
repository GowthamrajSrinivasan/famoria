/**
 * Core Cryptography Service
 *
 * Implements all cryptographic primitives for Famoria's encryption system.
 *
 * SECURITY CRITICAL:
 * - Never reuse IVs with the same key
 * - Always wipe sensitive data from memory
 * - Use constant-time comparison for security-sensitive operations
 * - Only use crypto.getRandomValues() for random number generation
 *
 * @module CryptoCore
 */

import { argon2id } from '@noble/hashes/argon2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface EncryptionResult {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  salt?: Uint8Array;
}

export interface KeyDerivationParams {
  password: string;
  salt: Uint8Array;
  memory: number;        // in KB (e.g., 65536 = 64 MB)
  iterations: number;    // e.g., 3
  parallelism: number;   // e.g., 4
  keyLength: number;     // in bytes (e.g., 32 = 256 bits)
}

export class CryptoError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'CryptoError';
  }
}

// ============================================================================
// SYMMETRIC ENCRYPTION (AES-256-GCM)
// ============================================================================

/**
 * Encrypt data using AES-256-GCM
 *
 * @param plaintext - Data to encrypt
 * @param key - 256-bit AES key
 * @param additionalData - Optional authenticated associated data (AAD)
 * @returns Encryption result with ciphertext, IV, and auth tag
 *
 * @throws {CryptoError} If encryption fails
 *
 * @example
 * const key = await generateAESKey();
 * const plaintext = new TextEncoder().encode('secret message');
 * const encrypted = await encryptAES256GCM(plaintext, key);
 */
export async function encryptAES256GCM(
  plaintext: Uint8Array,
  key: CryptoKey,
  additionalData?: Uint8Array
): Promise<EncryptionResult> {
  // Validate inputs
  if (key.algorithm.name !== 'AES-GCM') {
    throw new CryptoError('Invalid key algorithm. Expected AES-GCM');
  }

  if ((key.algorithm as AesKeyGenParams).length !== 256) {
    throw new CryptoError('Invalid key size. Expected 256 bits');
  }

  // Generate unique IV (96 bits = 12 bytes)
  // CRITICAL: IV MUST be unique for each encryption with the same key
  const iv = randomBytes(12);

  const algorithm: AesGcmParams = {
    name: 'AES-GCM',
    iv,
    tagLength: 128, // 128-bit auth tag (16 bytes)
    ...(additionalData && { additionalData }),
  };

  try {
    const ciphertext = await crypto.subtle.encrypt(
      algorithm,
      key,
      plaintext
    );

    // Extract auth tag (last 16 bytes)
    const encrypted = new Uint8Array(ciphertext);
    const authTag = encrypted.slice(-16);
    const encryptedData = encrypted.slice(0, -16);

    return {
      ciphertext: encryptedData,
      iv,
      authTag,
    };
  } catch (error) {
    // Wipe sensitive data on error
    wipeMemory(plaintext);
    throw new CryptoError('AES-GCM encryption failed', error);
  }
}

/**
 * Decrypt data using AES-256-GCM
 *
 * @param encryptionResult - Result from encryptAES256GCM
 * @param key - 256-bit AES key (same as encryption)
 * @param additionalData - Optional AAD (must match encryption)
 * @returns Decrypted plaintext
 *
 * @throws {CryptoError} If decryption fails or data is tampered
 *
 * @example
 * const decrypted = await decryptAES256GCM(encrypted, key);
 * const message = new TextDecoder().decode(decrypted);
 */
export async function decryptAES256GCM(
  encryptionResult: EncryptionResult,
  key: CryptoKey,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  const { ciphertext, iv, authTag } = encryptionResult;

  // Reconstruct full ciphertext with tag
  const fullCiphertext = new Uint8Array(
    ciphertext.length + authTag.length
  );
  fullCiphertext.set(ciphertext);
  fullCiphertext.set(authTag, ciphertext.length);

  const algorithm: AesGcmParams = {
    name: 'AES-GCM',
    iv,
    tagLength: 128,
    ...(additionalData && { additionalData }),
  };

  try {
    const decrypted = await crypto.subtle.decrypt(
      algorithm,
      key,
      fullCiphertext
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    throw new CryptoError(
      'Decryption failed - data may be tampered or corrupted',
      error
    );
  }
}

/**
 * Generate a new AES-256 key
 *
 * @param extractable - Whether key can be exported (default: false)
 * @returns CryptoKey for AES-GCM operations
 *
 * @example
 * const key = await generateAESKey();
 */
export async function generateAESKey(extractable: boolean = false): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    extractable,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// KEY DERIVATION (ARGON2ID)
// ============================================================================

/**
 * Derive a cryptographic key from a password using Argon2id
 *
 * Argon2id is a memory-hard key derivation function that is resistant to:
 * - GPU attacks
 * - ASIC attacks
 * - Side-channel attacks
 *
 * @param params - Key derivation parameters
 * @returns Derived key (raw bytes)
 *
 * @throws {CryptoError} If derivation fails
 *
 * @example
 * const salt = randomBytes(16);
 * const derivedKey = await deriveKeyArgon2id({
 *   password: 'user-password',
 *   salt,
 *   memory: 65536,     // 64 MB
 *   iterations: 3,
 *   parallelism: 4,
 *   keyLength: 32      // 256 bits
 * });
 */
export async function deriveKeyArgon2id(
  params: KeyDerivationParams
): Promise<Uint8Array> {
  const { password, salt, memory, iterations, parallelism, keyLength } = params;

  // Validate parameters
  if (memory < 8192) {
    throw new CryptoError('Memory parameter too low (min 8192 KB = 8 MB)');
  }

  if (iterations < 1) {
    throw new CryptoError('Iterations must be at least 1');
  }

  if (parallelism < 1) {
    throw new CryptoError('Parallelism must be at least 1');
  }

  if (keyLength < 16) {
    throw new CryptoError('Key length too short (min 16 bytes)');
  }

  try {
    const passwordBytes = new TextEncoder().encode(password);

    const derived = argon2id(
      passwordBytes,
      salt,
      {
        m: memory,      // Memory in KB
        t: iterations,  // Iterations
        p: parallelism, // Parallelism (threads)
      }
    );

    // Wipe password from memory
    wipeMemory(passwordBytes);

    return derived.slice(0, keyLength);
  } catch (error) {
    throw new CryptoError('Argon2id key derivation failed', error);
  }
}

/**
 * Import a derived key for use with Web Crypto API
 *
 * @param keyBytes - Raw key bytes from deriveKeyArgon2id
 * @param algorithm - Algorithm to use key with
 * @param extractable - Whether key can be exported
 * @param keyUsages - Allowed operations
 * @returns CryptoKey
 */
export async function importDerivedKey(
  keyBytes: Uint8Array,
  algorithm: AlgorithmIdentifier = { name: 'AES-GCM', length: 256 },
  extractable: boolean = false,
  keyUsages: KeyUsage[] = ['encrypt', 'decrypt']
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      'raw',
      keyBytes,
      algorithm,
      extractable,
      keyUsages
    );
  } catch (error) {
    throw new CryptoError('Failed to import derived key', error);
  }
}

// ============================================================================
// ASYMMETRIC ENCRYPTION (RSA-OAEP)
// ============================================================================

/**
 * Generate RSA-OAEP key pair (4096-bit)
 *
 * @param extractable - Whether keys can be exported (default: true)
 * @returns RSA key pair
 *
 * @example
 * const keyPair = await generateRSAKeyPair();
 */
export async function generateRSAKeyPair(extractable: boolean = true): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: 'SHA-256',
    },
    extractable,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using RSA-OAEP
 *
 * NOTE: RSA can only encrypt small amounts of data (< 470 bytes for 4096-bit key)
 * For larger data, use hybrid encryption (RSA for key wrapping, AES for data)
 *
 * @param plaintext - Data to encrypt (max ~470 bytes)
 * @param publicKey - RSA public key
 * @returns Encrypted data
 */
export async function encryptRSA(
  plaintext: Uint8Array,
  publicKey: CryptoKey
): Promise<Uint8Array> {
  if (plaintext.length > 470) {
    throw new CryptoError(
      'Plaintext too large for RSA. Use hybrid encryption for large data.'
    );
  }

  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      plaintext
    );
    return new Uint8Array(encrypted);
  } catch (error) {
    throw new CryptoError('RSA encryption failed', error);
  }
}

/**
 * Decrypt data using RSA-OAEP
 *
 * @param ciphertext - Encrypted data
 * @param privateKey - RSA private key
 * @returns Decrypted data
 */
export async function decryptRSA(
  ciphertext: Uint8Array,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      ciphertext
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    throw new CryptoError('RSA decryption failed', error);
  }
}

// ============================================================================
// HASHING & HMAC
// ============================================================================

/**
 * Compute SHA-256 hash
 *
 * @param data - Data to hash
 * @returns Hash digest
 */
export function hashSHA256(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/**
 * Compute HMAC-SHA256
 *
 * @param key - HMAC key
 * @param data - Data to authenticate
 * @returns HMAC digest
 *
 * @example
 * const key = randomBytes(32);
 * const mac = hmacSHA256(key, data);
 */
export function hmacSHA256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Secure Memory Wiping
 *
 * Overwrites sensitive data in memory to prevent leakage
 *
 * @param data - Sensitive data to wipe
 *
 * @example
 * const password = new TextEncoder().encode('secret');
 * // ... use password ...
 * wipeMemory(password); // Wipe when done
 */
export function wipeMemory(data: Uint8Array): void {
  for (let i = 0; i < data.length; i++) {
    data[i] = 0;
  }
}

/**
 * Constant-Time Comparison
 *
 * Prevents timing attacks by ensuring comparison takes the same time
 * regardless of where the difference is found
 *
 * @param a - First array
 * @param b - Second array
 * @returns True if arrays are equal
 *
 * @example
 * if (constantTimeEqual(expected, actual)) {
 *   // Arrays are equal
 * }
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

/**
 * Generate Cryptographically Secure Random Bytes
 *
 * Uses platform CSPRNG (crypto.getRandomValues())
 *
 * @param length - Number of bytes to generate
 * @returns Random bytes
 *
 * @example
 * const iv = secureRandomBytes(12);    // For AES-GCM IV
 * const salt = secureRandomBytes(16);  // For Argon2id salt
 */
export function secureRandomBytes(length: number): Uint8Array {
  const bytes = randomBytes(length);
  // Ensure we return a proper Uint8Array, not a Buffer (in Node.js)
  return new Uint8Array(bytes);
}

// ============================================================================
// KEY IMPORT/EXPORT
// ============================================================================

/**
 * Export a CryptoKey to raw bytes
 *
 * @param key - Key to export
 * @returns Raw key bytes
 */
export async function exportKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exported);
}

/**
 * Export RSA public key to SPKI format
 *
 * @param publicKey - RSA public key
 * @returns SPKI-encoded key
 */
export async function exportRSAPublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(exported);
}

/**
 * Export RSA private key to PKCS8 format
 *
 * @param privateKey - RSA private key
 * @returns PKCS8-encoded key
 */
export async function exportRSAPrivateKey(privateKey: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  return new Uint8Array(exported);
}

/**
 * Import RSA public key from SPKI format
 *
 * @param keyData - SPKI-encoded key
 * @returns RSA public key
 */
export async function importRSAPublicKey(keyData: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'spki',
    keyData,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );
}

/**
 * Import RSA private key from PKCS8 format
 *
 * @param keyData - PKCS8-encoded key
 * @returns RSA private key
 */
export async function importRSAPrivateKey(keyData: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );
}

/**
 * Serialize key bytes to Base64 string
 *
 * @param key - Key bytes to serialize
 * @returns Base64-encoded string
 */
export function serializeKey(key: Uint8Array): string {
  return btoa(String.fromCharCode(...key));
}

/**
 * Deserialize key from Base64 string
 *
 * @param serialized - Base64-encoded string
 * @returns Key bytes
 */
export function deserializeKey(serialized: string): Uint8Array {
  const binary = atob(serialized);
  return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate IV length for AES-GCM
 *
 * @param iv - Initialization vector
 * @throws {CryptoError} If IV is invalid
 */
export function validateIV(iv: Uint8Array): void {
  if (iv.length !== 12) {
    throw new CryptoError('Invalid IV length. Expected 12 bytes for AES-GCM');
  }
}

/**
 * Validate auth tag length for AES-GCM
 *
 * @param authTag - Authentication tag
 * @throws {CryptoError} If auth tag is invalid
 */
export function validateAuthTag(authTag: Uint8Array): void {
  if (authTag.length !== 16) {
    throw new CryptoError('Invalid auth tag length. Expected 16 bytes');
  }
}

/**
 * Validate salt length for key derivation
 *
 * @param salt - Salt for KDF
 * @throws {CryptoError} If salt is invalid
 */
export function validateSalt(salt: Uint8Array): void {
  if (salt.length < 16) {
    throw new CryptoError('Invalid salt length. Expected at least 16 bytes');
  }
}
