/**
 * Shamir's Secret Sharing Implementation
 *
 * Implements (t, n) threshold secret sharing scheme:
 * - Split secret into n shares
 * - Require t shares to reconstruct
 * - Any t-1 shares reveal zero information (information-theoretic security)
 *
 * Use Cases:
 * - Trusted contacts recovery (3-of-5)
 * - Distributed key storage
 * - Multi-party key management
 *
 * @module Recovery/Shamir
 */

import { split, combine } from 'shamirs-secret-sharing';
import {
  ShamirShare,
  RecoveryError,
  RecoveryErrorCode,
} from '../../../src/types/recovery';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default threshold (minimum shares needed) */
export const DEFAULT_THRESHOLD = 3;

/** Default total shares */
export const DEFAULT_TOTAL_SHARES = 5;

/** Minimum threshold */
export const MIN_THRESHOLD = 2;

/** Maximum total shares */
export const MAX_TOTAL_SHARES = 16;

// ============================================================================
// SHARE SPLITTING
// ============================================================================

/**
 * Split secret into Shamir shares
 *
 * Creates n shares where any t shares can reconstruct the secret.
 * Less than t shares reveal zero information about the secret.
 *
 * @param secret - Secret to split (typically a master key)
 * @param threshold - Minimum shares needed to reconstruct (default: 3)
 * @param totalShares - Total number of shares to create (default: 5)
 * @param purpose - Optional label for the shares
 * @returns Array of Shamir shares
 *
 * @throws {RecoveryError} If parameters are invalid
 *
 * @example
 * const masterKey = new Uint8Array(32); // 256-bit key
 * const shares = splitSecret(masterKey, 3, 5);
 * // Now any 3 of the 5 shares can reconstruct the master key
 */
export function splitSecret(
  secret: Uint8Array,
  threshold: number = DEFAULT_THRESHOLD,
  totalShares: number = DEFAULT_TOTAL_SHARES,
  purpose?: string
): ShamirShare[] {
  // Validate parameters
  if (threshold < MIN_THRESHOLD) {
    throw new RecoveryError(
      `Threshold must be at least ${MIN_THRESHOLD}`,
      RecoveryErrorCode.INVALID_THRESHOLD
    );
  }

  if (threshold > totalShares) {
    throw new RecoveryError(
      'Threshold cannot exceed total shares',
      RecoveryErrorCode.INVALID_THRESHOLD
    );
  }

  if (totalShares > MAX_TOTAL_SHARES) {
    throw new RecoveryError(
      `Total shares cannot exceed ${MAX_TOTAL_SHARES}`,
      RecoveryErrorCode.INVALID_THRESHOLD
    );
  }

  if (secret.length === 0) {
    throw new RecoveryError(
      'Secret cannot be empty',
      RecoveryErrorCode.RECONSTRUCTION_FAILED
    );
  }

  try {
    // Split secret using shamirs-secret-sharing library
    const shares = split(secret, { shares: totalShares, threshold });

    // Wrap in ShamirShare interface and always create new Uint8Array
    return shares.map((data, index) => ({
      shareId: index + 1,
      data: new Uint8Array(data),
      threshold,
      totalShares,
      createdAt: Date.now(),
      purpose,
    }));
  } catch (error) {
    throw new RecoveryError(
      'Failed to split secret',
      RecoveryErrorCode.RECONSTRUCTION_FAILED,
      error
    );
  }
}

// ============================================================================
// SHARE RECONSTRUCTION
// ============================================================================

/**
 * Reconstruct secret from Shamir shares
 *
 * Combines t or more shares to reconstruct the original secret.
 *
 * @param shares - Array of shares (must be at least threshold)
 * @returns Reconstructed secret
 *
 * @throws {RecoveryError} If insufficient shares or reconstruction fails
 *
 * @example
 * const shares = [share1, share2, share3]; // 3 out of 5 shares
 * const masterKey = reconstructSecret(shares);
 */
export function reconstructSecret(shares: ShamirShare[]): Uint8Array {
  if (shares.length === 0) {
    throw new RecoveryError(
      'No shares provided',
      RecoveryErrorCode.INSUFFICIENT_SHARES
    );
  }

  // Verify all shares have the same threshold
  const threshold = shares[0].threshold;
  const totalShares = shares[0].totalShares;

  for (const share of shares) {
    if (share.threshold !== threshold || share.totalShares !== totalShares) {
      throw new RecoveryError(
        'All shares must be from the same secret split',
        RecoveryErrorCode.RECONSTRUCTION_FAILED
      );
    }
  }

  // Check if we have enough shares
  if (shares.length < threshold) {
    throw new RecoveryError(
      `Need at least ${threshold} shares, got ${shares.length}`,
      RecoveryErrorCode.INSUFFICIENT_SHARES
    );
  }

  try {
    // Extract share data
    const shareData = shares.map(s => s.data);

    // Reconstruct secret
    const reconstructed = combine(shareData);

    // Always create new Uint8Array (shamirs-secret-sharing returns Buffer in Node.js)
    // Buffer extends Uint8Array but has different internal structure
    return new Uint8Array(reconstructed);
  } catch (error) {
    throw new RecoveryError(
      'Failed to reconstruct secret',
      RecoveryErrorCode.RECONSTRUCTION_FAILED,
      error
    );
  }
}

// ============================================================================
// SHARE VALIDATION
// ============================================================================

/**
 * Verify share is valid
 *
 * Checks if a share has valid structure and parameters.
 *
 * @param share - Share to verify
 * @returns True if valid
 *
 * @example
 * if (verifyShare(share)) {
 *   // Share is valid
 * }
 */
export function verifyShare(share: ShamirShare): boolean {
  try {
    // Check share ID is within valid range
    if (share.shareId < 1 || share.shareId > share.totalShares) {
      return false;
    }

    // Check threshold is valid
    if (share.threshold < MIN_THRESHOLD || share.threshold > share.totalShares) {
      return false;
    }

    // Check total shares is within limits
    if (share.totalShares > MAX_TOTAL_SHARES) {
      return false;
    }

    // Check share data exists
    if (!share.data || share.data.length === 0) {
      return false;
    }

    // Check creation timestamp
    if (share.createdAt <= 0) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Verify shares are compatible
 *
 * Checks if shares can be used together to reconstruct a secret.
 *
 * @param shares - Array of shares to verify
 * @returns True if shares are compatible
 *
 * @example
 * if (verifySharesCompatible([share1, share2, share3])) {
 *   const secret = reconstructSecret([share1, share2, share3]);
 * }
 */
export function verifySharesCompatible(shares: ShamirShare[]): boolean {
  if (shares.length === 0) {
    return false;
  }

  // Verify each share individually
  for (const share of shares) {
    if (!verifyShare(share)) {
      return false;
    }
  }

  // Verify all shares have the same parameters
  const first = shares[0];
  for (let i = 1; i < shares.length; i++) {
    const share = shares[i];
    if (
      share.threshold !== first.threshold ||
      share.totalShares !== first.totalShares
    ) {
      return false;
    }
  }

  // Verify no duplicate share IDs
  const shareIds = new Set(shares.map(s => s.shareId));
  if (shareIds.size !== shares.length) {
    return false; // Duplicate shares
  }

  return true;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get shares info
 *
 * Returns human-readable information about shares.
 *
 * @param shares - Array of shares
 * @returns Share information
 *
 * @example
 * const info = getSharesInfo(shares);
 * console.log(`${info.count}/${info.total} shares (need ${info.threshold})`);
 */
export function getSharesInfo(shares: ShamirShare[]): {
  count: number;
  threshold: number;
  total: number;
  canReconstruct: boolean;
  purpose?: string;
} {
  if (shares.length === 0) {
    return {
      count: 0,
      threshold: 0,
      total: 0,
      canReconstruct: false,
    };
  }

  const first = shares[0];

  return {
    count: shares.length,
    threshold: first.threshold,
    total: first.totalShares,
    canReconstruct: shares.length >= first.threshold,
    purpose: first.purpose,
  };
}

/**
 * Serialize share to string
 *
 * Converts share to base64 string for storage/transmission.
 *
 * @param share - Share to serialize
 * @returns Base64-encoded share
 */
export function serializeShare(share: ShamirShare): string {
  const json = JSON.stringify({
    ...share,
    data: btoa(String.fromCharCode(...share.data)),
  });
  return btoa(json);
}

/**
 * Deserialize share from string
 *
 * Converts base64 string back to share object.
 *
 * @param serialized - Serialized share
 * @returns Deserialized share
 *
 * @throws {RecoveryError} If deserialization fails
 */
export function deserializeShare(serialized: string): ShamirShare {
  try {
    const json = atob(serialized);
    const parsed = JSON.parse(json);

    const data = Uint8Array.from(atob(parsed.data), c => c.charCodeAt(0));

    return {
      ...parsed,
      data,
    };
  } catch (error) {
    throw new RecoveryError(
      'Failed to deserialize share',
      RecoveryErrorCode.RECONSTRUCTION_FAILED,
      error
    );
  }
}
