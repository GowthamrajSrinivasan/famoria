/**
 * Secure Photo Service
 *
 * High-level API for encrypted photo operations.
 * Simplified to focus on photo encryption/decryption only.
 * Albums are just organizational folders without separate encryption.
 *
 * @module SecurePhotoService
 */

import { encryptPhoto } from './crypto/photo/photoEncryption';
import {
  uploadEncryptedPhoto,
  deletePhoto as deleteEncryptedPhoto,
} from './crypto/photo/photoUpload';
import {
  downloadAndDecryptPhoto,
  downloadAndDecryptThumbnail,
  downloadAndDecryptPhotosBatch,
} from './crypto/photo/photoDownload';
import { generateAESKey } from './crypto/core/cryptoCore';
import { auth } from '../lib/firebase';
import { getFirestore } from 'firebase/firestore';
import type { UploadProgress, DownloadProgress } from '../src/types/photo';

const db = getFirestore();

// ============================================================================
// SIMPLIFIED KEY MANAGEMENT
// ============================================================================

/**
 * Get a simple master encryption key for the current user
 * All photos are encrypted with this key for simplicity
 */
async function getUserEncryptionKey(): Promise<CryptoKey> {
  if (!auth.currentUser) {
    throw new Error('User not authenticated');
  }

  // Derive a consistent key from user ID
  // This is a simplified approach - in production you'd want proper key management
  const userKeyMaterial = new TextEncoder().encode(auth.currentUser.uid);
  const keyHash = await crypto.subtle.digest('SHA-256', userKeyMaterial);

  return await crypto.subtle.importKey(
    'raw',
    keyHash,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// UPLOAD
// ============================================================================

export interface SecureUploadOptions {
  /** Folder/Album ID for organization (required) */
  albumId: string;

  /** Album name (for reference only) */
  albumName?: string;

  /** Progress callback */
  onProgress?: (progress: UploadProgress) => void;
}

export interface SecureUploadResult {
  /** Unique photo ID */
  photoId: string;

  /** Album ID where photo was uploaded */
  albumId: string;

  /** Upload timestamp */
  uploadedAt: number;

  /** Encrypted photo size in bytes */
  size: number;
}

/**
 * Upload photo with encryption
 *
 * Simplified to focus on photo encryption only.
 * Albums are just organizational folders.
 *
 * Process:
 * - EXIF stripping
 * - Photo encryption (each photo gets unique key)
 * - Thumbnail generation
 * - Encrypted upload to Firebase Storage
 *
 * @param file - Photo file to upload
 * @param options - Upload options (requires albumId)
 * @returns Upload result with photo ID and metadata
 *
 * @example
 * const result = await securePhotoService.uploadPhoto(file, {
 *   albumId: 'album_123',
 *   onProgress: (progress) => {
 *     console.log(`${progress.percentage}% - ${progress.status}`);
 *   },
 * });
 */
export async function uploadPhoto(
  file: File,
  options: SecureUploadOptions
): Promise<SecureUploadResult> {
  const { albumId, onProgress } = options;

  if (!auth.currentUser) {
    throw new Error('User not authenticated');
  }

  if (!albumId) {
    throw new Error('Album ID is required');
  }

  try {
    // 1. Get user's encryption key
    const encryptionKey = await getUserEncryptionKey();

    // 2. Encrypt photo (includes EXIF stripping, thumbnail generation)
    const encryptedPhoto = await encryptPhoto(file, albumId, encryptionKey);

    // 3. Upload encrypted photo to Firebase Storage
    const photoId = await uploadEncryptedPhoto(encryptedPhoto, onProgress);

    return {
      photoId,
      albumId,
      uploadedAt: Date.now(),
      size: encryptedPhoto.size,
    };
  } catch (error) {
    console.error('Secure upload failed:', error);
    throw error;
  }
}

/**
 * Upload multiple photos in batch
 *
 * @param files - Array of photo files
 * @param options - Upload options
 * @returns Array of upload results
 */
export async function uploadPhotosBatch(
  files: File[],
  options: SecureUploadOptions = {}
): Promise<SecureUploadResult[]> {
  const results: SecureUploadResult[] = [];

  for (const file of files) {
    try {
      const result = await uploadPhoto(file, options);
      results.push(result);
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
      // Continue with other uploads
    }
  }

  return results;
}

// ============================================================================
// DOWNLOAD
// ============================================================================

export interface SecureDownloadOptions {
  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
}

export interface SecureDownloadResult {
  /** Object URL for displaying the photo */
  url: string;

  /** Decrypted metadata */
  metadata: {
    originalName: string;
    mimeType: string;
    size: number;
    width: number;
    height: number;
    capturedAt: number;
    uploadedAt: number;
    uploadedBy: string;
  };
}

/**
 * Download and decrypt photo
 *
 * Downloads encrypted photo from storage, decrypts it, and returns
 * an object URL that can be used in <img> tags.
 *
 * IMPORTANT: Remember to revoke the object URL when done to free memory:
 * URL.revokeObjectURL(url)
 *
 * @param photoId - Photo ID
 * @param options - Download options
 * @returns Object URL and metadata
 *
 * @example
 * const { url, metadata } = await securePhotoService.downloadPhoto('photo_123');
 * imageElement.src = url;
 *
 * // Clean up when done
 * imageElement.onload = () => {
 *   URL.revokeObjectURL(url);
 * };
 */
export async function downloadPhoto(
  photoId: string,
  options: SecureDownloadOptions = {}
): Promise<SecureDownloadResult> {
  const { onProgress } = options;

  try {
    const result = await downloadAndDecryptPhoto(photoId, onProgress);

    return {
      url: result.url,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('Secure download failed:', error);
    throw error;
  }
}

/**
 * Download and decrypt thumbnail
 *
 * Faster than downloading full photo. Use for gallery views.
 *
 * @param photoId - Photo ID
 * @param options - Download options
 * @returns Object URL and metadata
 */
export async function downloadThumbnail(
  photoId: string,
  options: SecureDownloadOptions = {}
): Promise<SecureDownloadResult> {
  try {
    const result = await downloadAndDecryptThumbnail(photoId);

    return {
      url: result.url,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('Secure thumbnail download failed:', error);
    throw error;
  }
}

/**
 * Download multiple photos in batch
 *
 * @param photoIds - Array of photo IDs
 * @param options - Download options
 * @returns Map of photo ID to result
 */
export async function downloadPhotosBatch(
  photoIds: string[],
  options: SecureDownloadOptions = {}
): Promise<Map<string, SecureDownloadResult>> {
  const { masterKey } = options;

  const results = await downloadAndDecryptPhotosBatch(
    photoIds,
    masterKey,
    (photoId, loaded, total) => {
      console.log(`Downloaded ${loaded}/${total} photos`);
    }
  );

  // Convert to SecureDownloadResult format
  const converted = new Map<string, SecureDownloadResult>();
  for (const [photoId, result] of results.entries()) {
    converted.set(photoId, {
      url: result.url,
      metadata: result.metadata,
    });
  }

  return converted;
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Delete photo
 *
 * Removes encrypted photo from storage and metadata from Firestore.
 * Only the uploader or album owner can delete.
 *
 * @param photoId - Photo ID
 */
export async function deletePhoto(photoId: string): Promise<void> {
  try {
    await deleteEncryptedPhoto(photoId);
  } catch (error) {
    console.error('Secure delete failed:', error);
    throw error;
  }
}

// ============================================================================
// ALBUM OPERATIONS
// ============================================================================

/**
 * List user's albums
 *
 * @returns Array of albums
 */
export async function listAlbums() {
  if (!auth.currentUser) {
    throw new Error('User not authenticated');
  }

  const albumsRef = collection(db, 'albums');
  const q = query(albumsRef, where('ownerId', '==', auth.currentUser.uid));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const securePhotoService = {
  // Upload
  uploadPhoto,
  uploadPhotosBatch,

  // Download
  downloadPhoto,
  downloadThumbnail,
  downloadPhotosBatch,

  // Delete
  deletePhoto,

  // Albums
  listAlbums,
};

export default securePhotoService;
