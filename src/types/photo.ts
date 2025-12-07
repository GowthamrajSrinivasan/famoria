/**
 * Photo Encryption Type Definitions
 *
 * Types for encrypted photo storage and processing.
 *
 * @module Types/Photo
 */

import { EncryptionResult } from './keyStorage';

// ============================================================================
// PHOTO METADATA
// ============================================================================

/**
 * Photo Metadata
 *
 * Metadata about a photo (stored encrypted).
 * EXIF data is stripped for privacy.
 */
export interface PhotoMetadata {
  /** Original filename */
  originalName: string;

  /** MIME type (image/jpeg, image/png, etc.) */
  mimeType: string;

  /** File size in bytes */
  size: number;

  /** Image width in pixels */
  width: number;

  /** Image height in pixels */
  height: number;

  /** When photo was captured (from file lastModified) */
  capturedAt: number;

  /** When photo was uploaded */
  uploadedAt: number;

  /** User ID who uploaded */
  uploadedBy: string;

  /** Photo description (optional) */
  description?: string;

  /** Photo tags (optional) */
  tags?: string[];
}

/**
 * Encrypted Photo
 *
 * Photo data after encryption, ready for upload.
 */
export interface EncryptedPhoto {
  /** Unique photo ID */
  photoId: string;

  /** Album this photo belongs to */
  albumId: string;

  /** Encrypted photo blob */
  encryptedBlob: Blob;

  /** Encrypted thumbnail blob */
  encryptedThumbnail: Blob;

  /** Encrypted metadata */
  encryptedMetadata: EncryptionResult;

  /** IV for photo encryption */
  iv: Uint8Array;

  /** IV for thumbnail encryption */
  thumbnailIv: Uint8Array;

  /** IV for metadata encryption */
  metadataIv: Uint8Array;

  /** Auth tag for photo encryption */
  authTag: Uint8Array;

  /** Auth tag for thumbnail encryption */
  thumbnailAuthTag: Uint8Array;

  /** Total encrypted size */
  size: number;
}

/**
 * Stored Photo Record
 *
 * Photo metadata stored in Firestore.
 */
export interface StoredPhotoRecord {
  /** Photo ID */
  photoId: string;

  /** Album ID */
  albumId: string;

  /** User who uploaded */
  uploadedBy: string;

  /** Upload timestamp */
  uploadedAt: number;

  /** Storage paths */
  storagePaths: {
    /** Path to encrypted original */
    original: string;

    /** Path to encrypted thumbnail */
    thumbnail: string;
  };

  /** Encrypted metadata */
  encryptedMetadata: {
    /** Encrypted ciphertext (base64) */
    ciphertext: string;

    /** IV (base64) */
    iv: string;

    /** Auth tag (base64) */
    authTag: string;
  };

  /** Encryption IVs */
  ivs: {
    /** IV for photo (base64) */
    photo: string;

    /** IV for thumbnail (base64) */
    thumbnail: string;

    /** IV for metadata (base64) */
    metadata: string;
  };

  /** Encryption Auth Tags */
  authTags: {
    /** Auth tag for photo (base64) */
    photo: string;

    /** Auth tag for thumbnail (base64) */
    thumbnail: string;
  };

  /** Encrypted file size */
  size: number;

  /** Key version (for rotation) */
  keyVersion?: number;

  /** Last rotated timestamp */
  lastRotated?: number;

  /** Whether photo is deleted (soft delete) */
  deleted?: boolean;

  /** Deletion timestamp */
  deletedAt?: number;
}

// ============================================================================
// UPLOAD/DOWNLOAD
// ============================================================================

/**
 * Upload Progress
 */
export interface UploadProgress {
  /** Photo ID */
  photoId: string;

  /** Bytes transferred */
  bytesTransferred: number;

  /** Total bytes to transfer */
  totalBytes: number;

  /** Upload percentage (0-100) */
  percentage: number;

  /** Current status */
  status: 'encrypting' | 'uploading' | 'processing' | 'complete' | 'error';

  /** Error message (if status is error) */
  error?: string;
}

/**
 * Download Progress
 */
export interface DownloadProgress {
  /** Photo ID */
  photoId: string;

  /** Bytes downloaded */
  bytesDownloaded: number;

  /** Total bytes */
  totalBytes: number;

  /** Download percentage (0-100) */
  percentage: number;

  /** Current status */
  status: 'downloading' | 'decrypting' | 'complete' | 'error';

  /** Error message (if status is error) */
  error?: string;
}

// ============================================================================
// IMAGE PROCESSING
// ============================================================================

/**
 * Image Dimensions
 */
export interface ImageDimensions {
  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;
}

/**
 * Thumbnail Options
 */
export interface ThumbnailOptions {
  /** Maximum dimension (width or height) */
  maxSize: number;

  /** JPEG quality (0-1) */
  quality: number;

  /** Output format */
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * EXIF Data
 *
 * EXIF data that is stripped from photos for privacy.
 */
export interface EXIFData {
  /** GPS coordinates */
  gps?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };

  /** Camera make/model */
  camera?: {
    make?: string;
    model?: string;
  };

  /** Photo settings */
  settings?: {
    iso?: number;
    exposureTime?: string;
    fNumber?: number;
    focalLength?: number;
  };

  /** Software used */
  software?: string;

  /** Original date/time */
  dateTime?: string;
}

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Photo Error Codes
 */
export enum PhotoErrorCode {
  /** Failed to read photo file */
  READ_FAILED = 'READ_FAILED',

  /** Failed to encrypt photo */
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',

  /** Failed to decrypt photo */
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',

  /** Failed to upload photo */
  UPLOAD_FAILED = 'UPLOAD_FAILED',

  /** Failed to download photo */
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',

  /** Failed to generate thumbnail */
  THUMBNAIL_FAILED = 'THUMBNAIL_FAILED',

  /** Failed to strip EXIF */
  EXIF_STRIP_FAILED = 'EXIF_STRIP_FAILED',

  /** Invalid image format */
  INVALID_FORMAT = 'INVALID_FORMAT',

  /** File too large */
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',

  /** Photo not found */
  NOT_FOUND = 'NOT_FOUND',

  /** Access denied */
  ACCESS_DENIED = 'ACCESS_DENIED',
}

/**
 * Photo Error
 */
export class PhotoError extends Error {
  constructor(
    message: string,
    public code: PhotoErrorCode,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum photo size (50MB) */
export const MAX_PHOTO_SIZE = 50 * 1024 * 1024;

/** Supported image formats */
export const SUPPORTED_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

/** Default thumbnail size */
export const DEFAULT_THUMBNAIL_SIZE = 300;

/** Default thumbnail quality */
export const DEFAULT_THUMBNAIL_QUALITY = 0.8;
