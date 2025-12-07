/**
 * Photo Download and Decryption Service
 *
 * Simplified to use user-level encryption only.
 * No album-specific keys needed.
 *
 * @module Photo/PhotoDownload
 */

import {
  downloadEncryptedPhoto,
  getPhotoRecord,
  deserializeBytes,
} from './photoUpload';
import {
  decryptPhoto,
  decryptPhotoMetadata,
  createPhotoURL,
} from './photoEncryption';
import {
  PhotoMetadata,
  DownloadProgress,
  PhotoError,
  PhotoErrorCode,
} from '../../../src/types/photo';
import { wipeMemory } from '../core/cryptoCore';
import { auth } from '../../../lib/firebase';

// ============================================================================
// SIMPLIFIED KEY MANAGEMENT
// ============================================================================

/**
 * Get user's encryption key (same as used for upload)
 */
async function getUserEncryptionKey(): Promise<CryptoKey> {
  if (!auth.currentUser) {
    throw new PhotoError(
      'User not authenticated',
      PhotoErrorCode.ACCESS_DENIED
    );
  }

  // Derive a consistent key from user ID
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
// DOWNLOAD AND DECRYPT
// ============================================================================

/**
 * Download and decrypt photo
 *
 * Simplified process:
 * 1. Get photo record from Firestore
 * 2. Get user's encryption key
 * 3. Download encrypted blob
 * 4. Decrypt photo
 * 5. Create object URL for display
 *
 * @param photoId - Photo ID
 * @param onProgress - Progress callback
 * @returns Object URL and metadata
 *
 * @example
 * const { url, metadata } = await downloadAndDecryptPhoto('photo_123');
 * imageElement.src = url;
 * // Remember to revoke URL when done: URL.revokeObjectURL(url)
 */
export async function downloadAndDecryptPhoto(
  photoId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ url: string; metadata: PhotoMetadata }> {
  try {
    // Step 1: Get photo record
    if (onProgress) {
      onProgress({
        photoId,
        bytesDownloaded: 0,
        totalBytes: 0,
        percentage: 0,
        status: 'downloading',
      });
    }

    const photoRecord = await getPhotoRecord(photoId);

    // Step 2: Get user's encryption key
    const encryptionKey = await getUserEncryptionKey();

    // Step 3: Download encrypted photo
    if (onProgress) {
      onProgress({
        photoId,
        bytesDownloaded: 0,
        totalBytes: photoRecord.size,
        percentage: 20,
        status: 'downloading',
      });
    }

    const encryptedBlob = await downloadEncryptedPhoto(photoId, 'original');

    if (onProgress) {
      onProgress({
        photoId,
        bytesDownloaded: photoRecord.size,
        totalBytes: photoRecord.size,
        percentage: 60,
        status: 'decrypting',
      });
    }

    // Step 4: Decrypt photo
    const iv = deserializeBytes(photoRecord.ivs.photo);
    const authTag = deserializeBytes(photoRecord.authTags.photo);

    const decryptedPhoto = await decryptPhoto(
      encryptedBlob,
      iv,
      authTag,
      encryptionKey
    );

    // Step 5: Decrypt metadata
    const metadataIv = deserializeBytes(photoRecord.ivs.metadata);
    const metadataCiphertext = deserializeBytes(photoRecord.encryptedMetadata.ciphertext);
    const metadataAuthTag = deserializeBytes(photoRecord.encryptedMetadata.authTag);

    const metadata = await decryptPhotoMetadata(
      metadataCiphertext,
      metadataIv,
      metadataAuthTag,
      encryptionKey
    );

    if (onProgress) {
      onProgress({
        photoId,
        bytesDownloaded: photoRecord.size,
        totalBytes: photoRecord.size,
        percentage: 90,
        status: 'decrypting',
      });
    }

    // Step 6: Create object URL
    const url = createPhotoURL(decryptedPhoto, metadata.mimeType);

    // Clean up decrypted data from memory
    wipeMemory(decryptedPhoto);

    if (onProgress) {
      onProgress({
        photoId,
        bytesDownloaded: photoRecord.size,
        totalBytes: photoRecord.size,
        percentage: 100,
        status: 'complete',
      });
    }

    return { url, metadata };
  } catch (error) {
    if (onProgress) {
      onProgress({
        photoId,
        bytesDownloaded: 0,
        totalBytes: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Download failed',
      });
    }

    if (error instanceof PhotoError) {
      throw error;
    }
    throw new PhotoError(
      'Failed to download and decrypt photo',
      PhotoErrorCode.DOWNLOAD_FAILED,
      error
    );
  }
}

/**
 * Download and decrypt thumbnail
 *
 * Same as downloadAndDecryptPhoto but for thumbnail.
 * Thumbnails are smaller and faster to load.
 *
 * @param photoId - Photo ID
 * @returns Thumbnail URL and metadata
 */
export async function downloadAndDecryptThumbnail(
  photoId: string
): Promise<{ url: string; metadata: PhotoMetadata }> {
  try {
    // Get photo record
    const photoRecord = await getPhotoRecord(photoId);

    // Get user's encryption key
    const encryptionKey = await getUserEncryptionKey();

    // Download encrypted thumbnail
    const encryptedBlob = await downloadEncryptedPhoto(photoId, 'thumbnail');

    // Decrypt thumbnail
    const iv = deserializeBytes(photoRecord.ivs.thumbnail);
    const authTag = deserializeBytes(photoRecord.authTags.thumbnail);

    const decryptedThumbnail = await decryptPhoto(
      encryptedBlob,
      iv,
      authTag,
      encryptionKey
    );

    // Decrypt metadata
    const metadataIv = deserializeBytes(photoRecord.ivs.metadata);
    const metadataCiphertext = deserializeBytes(photoRecord.encryptedMetadata.ciphertext);
    const metadataAuthTag = deserializeBytes(photoRecord.encryptedMetadata.authTag);

    const metadata = await decryptPhotoMetadata(
      metadataCiphertext,
      metadataIv,
      metadataAuthTag,
      encryptionKey
    );

    // Create object URL
    const url = createPhotoURL(decryptedThumbnail, metadata.mimeType);

    // Clean up
    wipeMemory(decryptedThumbnail);

    return { url, metadata };
  } catch (error) {
    if (error instanceof PhotoError) {
      throw error;
    }
    throw new PhotoError(
      'Failed to download and decrypt thumbnail',
      PhotoErrorCode.DOWNLOAD_FAILED,
      error
    );
  }
}

/**
 * Download and decrypt multiple photos in batch
 *
 * Downloads thumbnails for quick gallery display.
 *
 * @param photoIds - Array of photo IDs
 * @param onProgress - Progress callback for each photo
 * @returns Map of photo ID to URL and metadata
 */
export async function downloadAndDecryptPhotosBatch(
  photoIds: string[],
  onProgress?: (photoId: string, loaded: number, total: number) => void
): Promise<Map<string, { url: string; metadata: PhotoMetadata }>> {
  const results = new Map<string, { url: string; metadata: PhotoMetadata }>();

  for (let i = 0; i < photoIds.length; i++) {
    const photoId = photoIds[i];

    try {
      const result = await downloadAndDecryptThumbnail(photoId);
      results.set(photoId, result);

      if (onProgress) {
        onProgress(photoId, i + 1, photoIds.length);
      }
    } catch (error) {
      // Continue with other downloads even if one fails
      console.error(`Failed to download photo ${photoId}:`, error);

      if (onProgress) {
        onProgress(photoId, i + 1, photoIds.length);
      }
    }
  }

  return results;
}

/**
 * Preload photo for smoother viewing
 *
 * Downloads and decrypts photo in background.
 *
 * @param photoId - Photo ID
 * @param masterKey - Master key (for private albums)
 * @returns Promise that resolves when preload is complete
 */
export async function preloadPhoto(
  photoId: string
): Promise<void> {
  try {
    // Download and decrypt in background
    await downloadAndDecryptPhoto(photoId);
  } catch (error) {
    // Silently fail preload
    console.debug(`Failed to preload photo ${photoId}:`, error);
  }
}

/**
 * Get photo metadata only (without downloading photo)
 *
 * Useful for displaying photo info without loading the full image.
 *
 * @param photoId - Photo ID
 * @returns Photo metadata
 */
export async function getPhotoMetadataOnly(
  photoId: string
): Promise<PhotoMetadata> {
  try {
    // Get photo record
    const photoRecord = await getPhotoRecord(photoId);

    // Get user's encryption key
    const encryptionKey = await getUserEncryptionKey();

    // Decrypt metadata only
    const metadataIv = deserializeBytes(photoRecord.ivs.metadata);
    const metadataCiphertext = deserializeBytes(photoRecord.encryptedMetadata.ciphertext);
    const metadataAuthTag = deserializeBytes(photoRecord.encryptedMetadata.authTag);

    const metadata = await decryptPhotoMetadata(
      metadataCiphertext,
      metadataIv,
      metadataAuthTag,
      encryptionKey
    );

    return metadata;
  } catch (error) {
    if (error instanceof PhotoError) {
      throw error;
    }
    throw new PhotoError(
      'Failed to get photo metadata',
      PhotoErrorCode.DOWNLOAD_FAILED,
      error
    );
  }
}
