/**
 * Album Encryption Type Definitions
 *
 * Types for album-level encryption with two models:
 * - Family Albums: Hybrid encryption, shareable, AI-enabled
 * - Private Albums: E2EE, not shareable, maximum privacy
 *
 * @module Types/Album
 */

// ============================================================================
// ALBUM TYPES
// ============================================================================

/**
 * Album Type
 */
export enum AlbumType {
  /** Family album with hybrid encryption (shareable, AI-enabled) */
  FAMILY = 'family',

  /** Private album with E2EE (not shareable, no AI) */
  PRIVATE = 'private',
}

/**
 * Album Visibility
 */
export enum AlbumVisibility {
  /** Only owner can access */
  PRIVATE = 'private',

  /** Specific members can access */
  SHARED = 'shared',

  /** Anyone with link can view (read-only) */
  LINK_SHARED = 'link_shared',
}

// ============================================================================
// ALBUM KEY STORAGE
// ============================================================================

/**
 * Album Key (in-memory only)
 *
 * Contains the decrypted/derived album key for encryption operations.
 * Never serialized or stored.
 */
export interface AlbumKey {
  /** Album ID */
  albumId: string;

  /** Album type */
  type: AlbumType;

  /** CryptoKey for encryption (in memory only) */
  key: CryptoKey;

  /** Salt used for key derivation */
  salt: Uint8Array;

  /** When this key was created/loaded */
  createdAt: number;

  /** Last time this key was used */
  lastUsed?: number;
}

/**
 * Family Album Key Storage
 *
 * Encrypted album key stored in Firestore for family albums.
 * Each member has their own encrypted copy.
 */
export interface FamilyAlbumKeyStorage {
  /** Album ID */
  albumId: string;

  /** User ID this key belongs to */
  userId: string;

  /** Album key encrypted with user's public key (base64) */
  encryptedKey: string;

  /** IV for encryption (base64) */
  iv: string;

  /** Authentication tag for GCM mode (base64) */
  authTag?: string;

  /** Salt for key derivation (base64) */
  salt: string;

  /** When this key was created */
  createdAt: number;

  /** Last time this key was rotated */
  lastRotated?: number;

  /** Key version (for rotation tracking) */
  version: number;
}

/**
 * Private Album Key Metadata
 *
 * Metadata for private album (key is derived, not stored).
 */
export interface PrivateAlbumKeyMetadata {
  /** Album ID */
  albumId: string;

  /** Salt for HKDF derivation (base64) */
  salt: string;

  /** When this album was created */
  createdAt: number;

  /** Key derivation info string */
  derivationInfo: string;
}

// ============================================================================
// ALBUM METADATA
// ============================================================================

/**
 * Album Metadata
 *
 * Non-sensitive album information stored in Firestore.
 */
export interface AlbumMetadata {
  /** Album ID */
  albumId: string;

  /** Album name (encrypted for private albums) */
  name: string;

  /** Album description (encrypted for private albums) */
  description?: string;

  /** Album type */
  type: AlbumType;

  /** Album visibility */
  visibility: AlbumVisibility;

  /** Album owner user ID */
  ownerId: string;

  /** Album members (user IDs) */
  members: string[];

  /** When album was created */
  createdAt: number;

  /** Last modified timestamp */
  lastModified: number;

  /** Number of photos in album */
  photoCount: number;

  /** Total size of photos (bytes) */
  totalSize: number;

  /** Cover photo ID */
  coverPhotoId?: string;

  /** Whether AI processing is enabled */
  aiEnabled: boolean;

  /** AI consent timestamp (if AI enabled) */
  aiConsentedAt?: number;

  /** Whether album is shareable */
  shareable: boolean;

  /** Salt for private album key derivation (base64, private albums only) */
  salt?: string;

  /** Album tags (encrypted for private albums) */
  tags?: string[];

  /** Album color theme */
  color?: string;

  /** Whether album is archived */
  archived: boolean;

  /** Whether album is deleted (soft delete) */
  deleted: boolean;

  /** Deletion timestamp */
  deletedAt?: number;
}

/**
 * Album Member Role
 */
export enum AlbumMemberRole {
  /** Album owner (full control) */
  OWNER = 'owner',

  /** Can add/remove photos and members */
  ADMIN = 'admin',

  /** Can add photos */
  CONTRIBUTOR = 'contributor',

  /** Can only view photos */
  VIEWER = 'viewer',
}

/**
 * Album Member
 */
export interface AlbumMember {
  /** User ID */
  userId: string;

  /** User email */
  email: string;

  /** User display name */
  displayName: string;

  /** Member role */
  role: AlbumMemberRole;

  /** When user was added to album */
  addedAt: number;

  /** Who added this user */
  addedBy: string;

  /** Last time user accessed album */
  lastAccessed?: number;
}

// ============================================================================
// ALBUM SHARING
// ============================================================================

/**
 * Share Link
 */
export interface ShareLink {
  /** Link ID */
  linkId: string;

  /** Album ID */
  albumId: string;

  /** Share token (random, secure) */
  token: string;

  /** Who created this link */
  createdBy: string;

  /** When link was created */
  createdAt: number;

  /** Link expiration timestamp */
  expiresAt?: number;

  /** Whether link is active */
  active: boolean;

  /** Maximum number of views (optional) */
  maxViews?: number;

  /** Current view count */
  viewCount: number;

  /** Whether viewers can download */
  allowDownload: boolean;

  /** Password protection (hashed) */
  passwordHash?: string;
}

// ============================================================================
// ALBUM OPERATIONS
// ============================================================================

/**
 * Create Album Options
 */
export interface CreateAlbumOptions {
  /** Album name */
  name: string;

  /** Album description */
  description?: string;

  /** Album type */
  type: AlbumType;

  /** Album visibility */
  visibility?: AlbumVisibility;

  /** Enable AI processing (family albums only) */
  aiEnabled?: boolean;

  /** Album tags */
  tags?: string[];

  /** Album color */
  color?: string;
}

/**
 * Album Key Rotation Result
 */
export interface AlbumKeyRotationResult {
  /** Album ID */
  albumId: string;

  /** New key version */
  newVersion: number;

  /** Number of photos re-encrypted */
  photosReencrypted: number;

  /** Number of member keys updated */
  membersUpdated: number;

  /** Rotation timestamp */
  rotatedAt: number;

  /** Rotation duration (ms) */
  durationMs: number;
}

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Album Error Codes
 */
export enum AlbumErrorCode {
  /** Album not found */
  ALBUM_NOT_FOUND = 'ALBUM_NOT_FOUND',

  /** No access to album */
  ACCESS_DENIED = 'ACCESS_DENIED',

  /** Album key not found */
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',

  /** Master key required */
  MASTER_KEY_REQUIRED = 'MASTER_KEY_REQUIRED',

  /** Invalid album type */
  INVALID_ALBUM_TYPE = 'INVALID_ALBUM_TYPE',

  /** Album is full */
  ALBUM_FULL = 'ALBUM_FULL',

  /** Operation not allowed */
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',

  /** Key rotation failed */
  ROTATION_FAILED = 'ROTATION_FAILED',

  /** Invalid share link */
  INVALID_SHARE_LINK = 'INVALID_SHARE_LINK',

  /** Share link expired */
  SHARE_LINK_EXPIRED = 'SHARE_LINK_EXPIRED',
}

/**
 * Album Error
 */
export class AlbumError extends Error {
  constructor(
    message: string,
    public code: AlbumErrorCode,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AlbumError';
  }
}
