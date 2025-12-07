/**
 * Recovery System Type Definitions
 *
 * Types for multi-factor key recovery system using:
 * - Shamir's Secret Sharing
 * - BIP39 Recovery Codes
 * - Trusted Contacts
 * - Biometric/Security Keys
 *
 * @module Types/Recovery
 */

// ============================================================================
// SHAMIR'S SECRET SHARING
// ============================================================================

/**
 * Shamir Share
 *
 * A single share from Shamir's Secret Sharing scheme.
 * Requires t-of-n shares to reconstruct the secret.
 */
export interface ShamirShare {
  /** Share identifier (1 to totalShares) */
  shareId: number;

  /** Share data */
  data: Uint8Array;

  /** Minimum shares required to reconstruct */
  threshold: number;

  /** Total number of shares created */
  totalShares: number;

  /** Creation timestamp */
  createdAt: number;

  /** Share purpose/label */
  purpose?: string;
}

// ============================================================================
// RECOVERY CODES (BIP39)
// ============================================================================

/**
 * Recovery Code
 *
 * BIP39 mnemonic-based recovery code (24 words).
 */
export interface RecoveryCode {
  /** 24-word mnemonic phrase */
  mnemonic: string;

  /** Checksum for verification */
  checksum: string;

  /** Creation timestamp */
  createdAt: number;

  /** Whether code has been used */
  used?: boolean;

  /** Last verified timestamp */
  lastVerified?: number;
}

// ============================================================================
// TRUSTED CONTACTS
// ============================================================================

/**
 * Trusted Contact Status
 */
export type TrustedContactStatus = 'pending' | 'accepted' | 'revoked';

/**
 * Trusted Contact
 *
 * A contact who holds a Shamir share for recovery.
 */
export interface TrustedContact {
  /** Contact's user ID */
  userId: string;

  /** Contact's email */
  email: string;

  /** Contact's display name */
  name: string;

  /** Shamir share ID this contact holds */
  shareId: number;

  /** Encrypted share (encrypted with contact's public key) */
  encryptedShare: string;

  /** Contact's public key */
  publicKey: string;

  /** When contact was added */
  addedAt: number;

  /** Contact status */
  status: TrustedContactStatus;

  /** When contact accepted (if accepted) */
  acceptedAt?: number;

  /** When contact was revoked (if revoked) */
  revokedAt?: number;
}

// ============================================================================
// RECOVERY REQUESTS
// ============================================================================

/**
 * Recovery Request Status
 */
export type RecoveryRequestStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'completed';

/**
 * Recovery Approval
 *
 * A single approval from a trusted contact.
 */
export interface RecoveryApproval {
  /** Contact's user ID */
  contactId: string;

  /** Contact's email */
  contactEmail: string;

  /** When approved */
  approvedAt: number;

  /** Decrypted share data (serialized) */
  share: string;
}

/**
 * Recovery Request
 *
 * A request to recover access using trusted contacts.
 */
export interface RecoveryRequest {
  /** Request ID */
  requestId: string;

  /** User requesting recovery */
  requesterId: string;

  /** Requester's email */
  requesterEmail: string;

  /** Creation timestamp */
  createdAt: number;

  /** Expiration timestamp (7 days) */
  expiresAt: number;

  /** Approvals from trusted contacts */
  approvals: RecoveryApproval[];

  /** Request status */
  status: RecoveryRequestStatus;

  /** When request was completed */
  completedAt?: number;

  /** IP address of requester (for audit) */
  requestIpAddress?: string;

  /** User agent of requester */
  requestUserAgent?: string;
}

// ============================================================================
// MASTER KEY
// ============================================================================

/**
 * Master Key Storage
 *
 * Encrypted master key stored in Firestore.
 */
export interface EncryptedMasterKey {
  /** Encrypted master key ciphertext */
  ciphertext: string;

  /** IV for encryption */
  iv: string;

  /** Salt for key derivation */
  salt: string;

  /** Auth tag (for AEAD) */
  authTag?: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last rotated timestamp */
  lastRotated?: number;

  /** Algorithm version */
  version: string;
}

/**
 * Master Key Metadata
 *
 * Non-sensitive metadata about the master key.
 */
export interface MasterKeyMetadata {
  /** Key ID */
  keyId: string;

  /** Key version */
  version: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last used timestamp */
  lastUsed: number;

  /** Derivation algorithm */
  algorithm: 'argon2id';

  /** Argon2 memory parameter (KB) */
  memoryKB: number;

  /** Argon2 iterations */
  iterations: number;

  /** Argon2 parallelism */
  parallelism: number;
}

// ============================================================================
// RECOVERY METHODS
// ============================================================================

/**
 * Recovery Method Type
 */
export type RecoveryMethodType =
  | 'biometric'
  | 'recovery_code'
  | 'trusted_contacts'
  | 'email_verification'
  | 'security_key';

/**
 * Recovery Method
 *
 * A configured recovery method for the user.
 */
export interface RecoveryMethod {
  /** Method ID */
  methodId: string;

  /** Method type */
  type: RecoveryMethodType;

  /** When method was set up */
  setupAt: number;

  /** Whether method is enabled */
  enabled: boolean;

  /** Last used timestamp */
  lastUsed?: number;

  /** Method-specific metadata */
  metadata?: {
    // For biometric
    credentialId?: string;
    biometryType?: string;

    // For recovery code
    checksumHash?: string;

    // For trusted contacts
    contactCount?: number;
    requiredApprovals?: number;

    // For email verification
    verifiedEmail?: string;
    timeDelay?: number; // in milliseconds

    // For security key
    keyId?: string;
    keyType?: string;
  };
}

/**
 * Recovery Configuration
 *
 * User's overall recovery configuration.
 */
export interface RecoveryConfiguration {
  /** User ID */
  userId: string;

  /** Configured recovery methods */
  methods: RecoveryMethod[];

  /** Minimum methods required (default: 3) */
  minimumMethods: number;

  /** Whether recovery is fully configured */
  isConfigured: boolean;

  /** Last updated timestamp */
  lastUpdated: number;

  /** Recovery lockout (if multiple failed attempts) */
  lockout?: {
    lockedUntil: number;
    failedAttempts: number;
    lastFailedAttempt: number;
  };
}

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Recovery Error Codes
 */
export enum RecoveryErrorCode {
  /** Invalid recovery code */
  INVALID_RECOVERY_CODE = 'INVALID_RECOVERY_CODE',

  /** Insufficient shares for reconstruction */
  INSUFFICIENT_SHARES = 'INSUFFICIENT_SHARES',

  /** Recovery request expired */
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',

  /** Recovery request not approved */
  NOT_APPROVED = 'NOT_APPROVED',

  /** Contact not trusted */
  NOT_TRUSTED_CONTACT = 'NOT_TRUSTED_CONTACT',

  /** Recovery lockout active */
  RECOVERY_LOCKED = 'RECOVERY_LOCKED',

  /** Shamir reconstruction failed */
  RECONSTRUCTION_FAILED = 'RECONSTRUCTION_FAILED',

  /** Invalid threshold */
  INVALID_THRESHOLD = 'INVALID_THRESHOLD',

  /** Method not configured */
  METHOD_NOT_CONFIGURED = 'METHOD_NOT_CONFIGURED',
}

/**
 * Recovery Error
 */
export class RecoveryError extends Error {
  constructor(
    message: string,
    public code: RecoveryErrorCode,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'RecoveryError';
  }
}
