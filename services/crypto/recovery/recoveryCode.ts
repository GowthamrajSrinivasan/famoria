/**
 * BIP39 Recovery Code Implementation
 *
 * Generates and validates 24-word mnemonic recovery codes.
 *
 * Features:
 * - BIP39 standard compliance
 * - 24-word phrases (256-bit entropy)
 * - Built-in checksums
 * - Human-readable and writable
 *
 * @module Recovery/RecoveryCode
 */

import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
  mnemonicToEntropy,
  entropyToMnemonic,
} from 'bip39';
import { hashSHA256 } from '../core/cryptoCore';
import {
  RecoveryCode,
  RecoveryError,
  RecoveryErrorCode,
} from '../../../src/types/recovery';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Entropy size for 24-word mnemonic (256 bits) */
const ENTROPY_SIZE = 256;

/** Key derivation iterations */
const PBKDF2_ITERATIONS = 2048;

// ============================================================================
// RECOVERY CODE GENERATION
// ============================================================================

/**
 * Generate 24-word recovery mnemonic
 *
 * Creates a BIP39-compliant 24-word phrase that can be used
 * to recover the master key.
 *
 * @returns Recovery code with mnemonic and checksum
 *
 * @example
 * const recovery = generateRecoveryCode();
 * console.log(recovery.mnemonic);
 * // "abandon ability able about above absent absorb abstract absurd abuse..."
 */
export function generateRecoveryCode(): RecoveryCode {
  try {
    // Generate 24-word mnemonic (256 bits entropy)
    const mnemonic = generateMnemonic(ENTROPY_SIZE);

    // Derive seed for checksum
    const seed = mnemonicToSeedSync(mnemonic);

    // Create checksum
    const checksum = createChecksum(seed);

    return {
      mnemonic,
      checksum,
      createdAt: Date.now(),
      used: false,
    };
  } catch (error) {
    throw new RecoveryError(
      'Failed to generate recovery code',
      RecoveryErrorCode.INVALID_RECOVERY_CODE,
      error
    );
  }
}

/**
 * Generate recovery code from existing entropy
 *
 * Useful for deterministic recovery code generation.
 *
 * @param entropy - 256-bit entropy
 * @returns Recovery code
 */
export function generateRecoveryCodeFromEntropy(
  entropy: Uint8Array
): RecoveryCode {
  if (entropy.length !== 32) {
    throw new RecoveryError(
      'Entropy must be 256 bits (32 bytes)',
      RecoveryErrorCode.INVALID_RECOVERY_CODE
    );
  }

  try {
    // Convert entropy to hex string
    const entropyHex = Array.from(entropy)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Convert to mnemonic
    const mnemonic = entropyToMnemonic(entropyHex);

    // Derive seed for checksum
    const seed = mnemonicToSeedSync(mnemonic);
    const checksum = createChecksum(seed);

    return {
      mnemonic,
      checksum,
      createdAt: Date.now(),
      used: false,
    };
  } catch (error) {
    throw new RecoveryError(
      'Failed to generate recovery code from entropy',
      RecoveryErrorCode.INVALID_RECOVERY_CODE,
      error
    );
  }
}

// ============================================================================
// RECOVERY CODE VALIDATION
// ============================================================================

/**
 * Validate recovery code
 *
 * Verifies that a mnemonic is valid BIP39.
 *
 * @param mnemonic - Mnemonic to validate
 * @returns True if valid
 *
 * @example
 * if (validateRecoveryCode(userInput)) {
 *   // Proceed with recovery
 * }
 */
export function validateRecoveryCode(mnemonic: string): boolean {
  try {
    return validateMnemonic(mnemonic);
  } catch {
    return false;
  }
}

/**
 * Validate recovery code with checksum
 *
 * Verifies mnemonic and matches checksum.
 *
 * @param mnemonic - Mnemonic to validate
 * @param expectedChecksum - Expected checksum
 * @returns True if valid and checksum matches
 */
export function validateRecoveryCodeWithChecksum(
  mnemonic: string,
  expectedChecksum: string
): boolean {
  if (!validateMnemonic(mnemonic)) {
    return false;
  }

  try {
    const seed = mnemonicToSeedSync(mnemonic);
    const checksum = createChecksum(seed);
    return checksum === expectedChecksum;
  } catch {
    return false;
  }
}

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derive key from recovery code
 *
 * Converts mnemonic to a 256-bit encryption key.
 *
 * @param mnemonic - Recovery code mnemonic
 * @param passphrase - Optional passphrase (BIP39 extension)
 * @returns Derived 256-bit key
 *
 * @throws {RecoveryError} If mnemonic is invalid
 *
 * @example
 * const key = deriveKeyFromRecoveryCode(mnemonic);
 * // Use key to decrypt master key
 */
export function deriveKeyFromRecoveryCode(
  mnemonic: string,
  passphrase?: string
): Uint8Array {
  if (!validateMnemonic(mnemonic)) {
    throw new RecoveryError(
      'Invalid recovery code',
      RecoveryErrorCode.INVALID_RECOVERY_CODE
    );
  }

  try {
    // BIP39 seed derivation (PBKDF2 with 2048 iterations)
    const seed = mnemonicToSeedSync(mnemonic, passphrase);

    // Return first 32 bytes (256 bits) as key
    return new Uint8Array(seed).slice(0, 32);
  } catch (error) {
    throw new RecoveryError(
      'Failed to derive key from recovery code',
      RecoveryErrorCode.INVALID_RECOVERY_CODE,
      error
    );
  }
}

/**
 * Derive multiple keys from recovery code
 *
 * Uses HKDF-like derivation to create multiple keys.
 *
 * @param mnemonic - Recovery code mnemonic
 * @param count - Number of keys to derive
 * @param passphrase - Optional passphrase
 * @returns Array of derived keys
 */
export function deriveMultipleKeys(
  mnemonic: string,
  count: number,
  passphrase?: string
): Uint8Array[] {
  if (count < 1 || count > 10) {
    throw new RecoveryError(
      'Can derive 1-10 keys',
      RecoveryErrorCode.INVALID_RECOVERY_CODE
    );
  }

  const baseSeed = mnemonicToSeedSync(mnemonic, passphrase);
  const keys: Uint8Array[] = [];

  for (let i = 0; i < count; i++) {
    // Hash (baseSeed || index) to derive unique keys
    const input = new Uint8Array(baseSeed.length + 4);
    input.set(baseSeed);
    input.set(new Uint8Array([i, 0, 0, 0]), baseSeed.length);

    const hash = hashSHA256(input);
    keys.push(hash);
  }

  return keys;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create checksum for verification
 *
 * Generates an 8-character hex checksum.
 *
 * @param seed - BIP39 seed
 * @returns 8-character hex checksum
 */
function createChecksum(seed: Buffer): string {
  const hash = hashSHA256(new Uint8Array(seed));
  return Array.from(hash.slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Format mnemonic for display
 *
 * Splits mnemonic into groups for easier reading/writing.
 *
 * @param mnemonic - Mnemonic to format
 * @param groupSize - Words per group (default: 4)
 * @returns Formatted mnemonic
 *
 * @example
 * const formatted = formatMnemonic(mnemonic);
 * // "word1 word2 word3 word4\nword5 word6 word7 word8\n..."
 */
export function formatMnemonic(
  mnemonic: string,
  groupSize: number = 4
): string {
  const words = mnemonic.split(' ');
  const groups: string[] = [];

  for (let i = 0; i < words.length; i += groupSize) {
    groups.push(words.slice(i, i + groupSize).join(' '));
  }

  return groups.join('\n');
}

/**
 * Normalize mnemonic input
 *
 * Cleans up user input (lowercase, trim, single spaces).
 *
 * @param input - User input
 * @returns Normalized mnemonic
 *
 * @example
 * const normalized = normalizeMnemonic("  Word1   WORD2  word3 ");
 * // "word1 word2 word3"
 */
export function normalizeMnemonic(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

/**
 * Get word count from mnemonic
 *
 * @param mnemonic - Mnemonic to check
 * @returns Number of words
 */
export function getWordCount(mnemonic: string): number {
  return normalizeMnemonic(mnemonic).split(' ').length;
}

/**
 * Check if mnemonic is 24 words
 *
 * @param mnemonic - Mnemonic to check
 * @returns True if 24 words
 */
export function is24Words(mnemonic: string): boolean {
  return getWordCount(mnemonic) === 24;
}

/**
 * Get entropy from mnemonic
 *
 * Extracts the original entropy from a valid mnemonic.
 *
 * @param mnemonic - Valid mnemonic
 * @returns Entropy bytes
 *
 * @throws {RecoveryError} If mnemonic is invalid
 */
export function getEntropyFromMnemonic(mnemonic: string): Uint8Array {
  if (!validateMnemonic(mnemonic)) {
    throw new RecoveryError(
      'Invalid mnemonic',
      RecoveryErrorCode.INVALID_RECOVERY_CODE
    );
  }

  try {
    const entropyHex = mnemonicToEntropy(mnemonic);
    const entropy = new Uint8Array(entropyHex.length / 2);

    for (let i = 0; i < entropy.length; i++) {
      entropy[i] = parseInt(entropyHex.substr(i * 2, 2), 16);
    }

    return entropy;
  } catch (error) {
    throw new RecoveryError(
      'Failed to extract entropy',
      RecoveryErrorCode.INVALID_RECOVERY_CODE,
      error
    );
  }
}

/**
 * Generate QR code data from mnemonic
 *
 * Prepares mnemonic for QR code encoding.
 *
 * @param mnemonic - Mnemonic to encode
 * @returns QR-safe encoded string
 */
export function toQRCode(mnemonic: string): string {
  // For QR codes, we can encode the entropy directly for compactness
  const entropy = getEntropyFromMnemonic(mnemonic);
  return btoa(String.fromCharCode(...entropy));
}

/**
 * Decode mnemonic from QR code data
 *
 * @param qrData - QR code data
 * @returns Mnemonic
 */
export function fromQRCode(qrData: string): string {
  try {
    const entropy = Uint8Array.from(atob(qrData), c => c.charCodeAt(0));
    return generateRecoveryCodeFromEntropy(entropy).mnemonic;
  } catch (error) {
    throw new RecoveryError(
      'Failed to decode QR code',
      RecoveryErrorCode.INVALID_RECOVERY_CODE,
      error
    );
  }
}
