/**
 * Photo Upload Service
 *
 * Handles uploading encrypted photos to Firebase Storage
 * and storing metadata in Firestore.
 *
 * @module Photo/PhotoUpload
 */

import {
  getStorage,
  ref,
  uploadBytes,
  deleteObject,
  getDownloadURL,
} from 'firebase/storage';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, getFirestore, collection, getDocs } from 'firebase/firestore';
import {
  EncryptedPhoto,
  UploadProgress,
  StoredPhotoRecord,
  PhotoError,
  PhotoErrorCode,
} from '../../../src/types/photo';
import { auth } from '../../../lib/firebase';

// ============================================================================
// UPLOAD
// ============================================================================

/**
 * Upload encrypted photo to Firebase Storage
 *
 * Upload pipeline:
 * 1. Upload original encrypted blob
 * 2. Upload encrypted thumbnail
 * 3. Store metadata in Firestore
 * 4. Return photo ID
 *
 * @param encryptedPhoto - Encrypted photo data
 * @param onProgress - Progress callback
 * @returns Photo ID
 *
 * @example
 * const photoId = await uploadEncryptedPhoto(encryptedPhoto, (progress) => {
 *   console.log(`Upload ${progress.percentage}%`);
 * });
 */
export async function uploadEncryptedPhoto(
  encryptedPhoto: EncryptedPhoto,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  if (!auth.currentUser) {
    throw new PhotoError(
      'User not authenticated',
      PhotoErrorCode.ACCESS_DENIED
    );
  }

  const userId = auth.currentUser.uid;
  const storage = getStorage();
  const db = getFirestore();

  try {
    // Report encrypting complete
    if (onProgress) {
      onProgress({
        photoId: encryptedPhoto.photoId,
        bytesTransferred: 0,
        totalBytes: encryptedPhoto.size,
        percentage: 0,
        status: 'uploading',
      });
    }

    // Storage paths
    const photoPath = `encrypted/${userId}/${encryptedPhoto.albumId}/${encryptedPhoto.photoId}/original`;
    const thumbnailPath = `encrypted/${userId}/${encryptedPhoto.albumId}/${encryptedPhoto.photoId}/thumbnail`;

    // Step 1: Upload original encrypted photo
    const photoRef = ref(storage, photoPath);
    await uploadBytes(photoRef, encryptedPhoto.encryptedBlob, {
      contentType: 'application/octet-stream',
      customMetadata: {
        encrypted: 'true',
        albumId: encryptedPhoto.albumId,
        photoId: encryptedPhoto.photoId,
      },
    });

    if (onProgress) {
      onProgress({
        photoId: encryptedPhoto.photoId,
        bytesTransferred: encryptedPhoto.size,
        totalBytes: encryptedPhoto.size,
        percentage: 40,
        status: 'uploading',
      });
    }

    // Step 2: Upload encrypted thumbnail
    const thumbnailRef = ref(storage, thumbnailPath);
    await uploadBytes(thumbnailRef, encryptedPhoto.encryptedThumbnail, {
      contentType: 'application/octet-stream',
      customMetadata: {
        encrypted: 'true',
        albumId: encryptedPhoto.albumId,
        photoId: encryptedPhoto.photoId,
        thumbnail: 'true',
      },
    });

    if (onProgress) {
      onProgress({
        photoId: encryptedPhoto.photoId,
        bytesTransferred: encryptedPhoto.size,
        totalBytes: encryptedPhoto.size,
        percentage: 70,
        status: 'processing',
      });
    }

    // Step 3: Store metadata in Firestore
    const photoRecord: StoredPhotoRecord = {
      photoId: encryptedPhoto.photoId,
      albumId: encryptedPhoto.albumId,
      uploadedBy: userId,
      uploadedAt: Date.now(),
      storagePaths: {
        original: photoPath,
        thumbnail: thumbnailPath,
      },
      encryptedMetadata: {
        ciphertext: btoa(String.fromCharCode(...encryptedPhoto.encryptedMetadata.ciphertext)),
        iv: btoa(String.fromCharCode(...encryptedPhoto.encryptedMetadata.iv)),
        authTag: btoa(String.fromCharCode(...encryptedPhoto.encryptedMetadata.authTag)),
      },
      ivs: {
        photo: btoa(String.fromCharCode(...encryptedPhoto.iv)),
        thumbnail: btoa(String.fromCharCode(...encryptedPhoto.thumbnailIv)),
        metadata: btoa(String.fromCharCode(...encryptedPhoto.metadataIv)),
      },
      authTags: {
        photo: btoa(String.fromCharCode(...encryptedPhoto.authTag)),
        thumbnail: btoa(String.fromCharCode(...encryptedPhoto.thumbnailAuthTag)),
      },
      size: encryptedPhoto.size,
      keyVersion: 1,
    };

    await setDoc(doc(db, 'photos', encryptedPhoto.photoId), photoRecord);

    // Step 4: Update album photo count
    await updateAlbumPhotoCount(encryptedPhoto.albumId, 1);

    if (onProgress) {
      onProgress({
        photoId: encryptedPhoto.photoId,
        bytesTransferred: encryptedPhoto.size,
        totalBytes: encryptedPhoto.size,
        percentage: 100,
        status: 'complete',
      });
    }

    return encryptedPhoto.photoId;
  } catch (error) {
    if (onProgress) {
      onProgress({
        photoId: encryptedPhoto.photoId,
        bytesTransferred: 0,
        totalBytes: encryptedPhoto.size,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    }

    throw new PhotoError(
      'Failed to upload photo',
      PhotoErrorCode.UPLOAD_FAILED,
      error
    );
  }
}

/**
 * Upload multiple photos in batch
 *
 * @param encryptedPhotos - Array of encrypted photos
 * @param onProgress - Progress callback for each photo
 * @returns Array of photo IDs
 */
export async function uploadEncryptedPhotosBatch(
  encryptedPhotos: EncryptedPhoto[],
  onProgress?: (photoId: string, progress: UploadProgress) => void
): Promise<string[]> {
  const photoIds: string[] = [];

  for (const encryptedPhoto of encryptedPhotos) {
    try {
      const photoId = await uploadEncryptedPhoto(
        encryptedPhoto,
        onProgress ? (progress) => onProgress(encryptedPhoto.photoId, progress) : undefined
      );
      photoIds.push(photoId);
    } catch (error) {
      // Continue with other uploads even if one fails
      console.error(`Failed to upload photo ${encryptedPhoto.photoId}:`, error);
    }
  }

  return photoIds;
}

// ============================================================================
// DOWNLOAD
// ============================================================================

/**
 * Get download URL for encrypted photo
 *
 * @param photoId - Photo ID
 * @param type - 'original' or 'thumbnail'
 * @returns Download URL
 */
export async function getPhotoDownloadURL(
  photoId: string,
  type: 'original' | 'thumbnail' = 'original'
): Promise<string> {
  const db = getFirestore();

  try {
    // Get photo record
    const photoDoc = await getDoc(doc(db, 'photos', photoId));

    if (!photoDoc.exists()) {
      throw new PhotoError(
        'Photo not found',
        PhotoErrorCode.NOT_FOUND
      );
    }

    const photoRecord = photoDoc.data() as StoredPhotoRecord;

    // Get storage path
    const storagePath = type === 'original'
      ? photoRecord.storagePaths.original
      : photoRecord.storagePaths.thumbnail;

    // Get download URL
    const storage = getStorage();
    const storageRef = ref(storage, storagePath);
    const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
  } catch (error) {
    throw new PhotoError(
      'Failed to get download URL',
      PhotoErrorCode.DOWNLOAD_FAILED,
      error
    );
  }
}

/**
 * Download encrypted photo blob
 *
 * @param photoId - Photo ID
 * @param type - 'original' or 'thumbnail'
 * @returns Encrypted blob
 */
export async function downloadEncryptedPhoto(
  photoId: string,
  type: 'original' | 'thumbnail' = 'original'
): Promise<Blob> {
  try {
    const downloadURL = await getPhotoDownloadURL(photoId, type);

    const response = await fetch(downloadURL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    return blob;
  } catch (error) {
    throw new PhotoError(
      'Failed to download photo',
      PhotoErrorCode.DOWNLOAD_FAILED,
      error
    );
  }
}

/**
 * Get photo record from Firestore
 *
 * @param photoId - Photo ID
 * @returns Photo record
 */
export async function getPhotoRecord(photoId: string): Promise<StoredPhotoRecord> {
  const db = getFirestore();

  try {
    const photoDoc = await getDoc(doc(db, 'photos', photoId));

    if (!photoDoc.exists()) {
      throw new PhotoError(
        'Photo not found',
        PhotoErrorCode.NOT_FOUND
      );
    }

    return photoDoc.data() as StoredPhotoRecord;
  } catch (error) {
    if (error instanceof PhotoError) {
      throw error;
    }
    throw new PhotoError(
      'Failed to get photo record',
      PhotoErrorCode.NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Delete photo
 *
 * Removes encrypted photo from Storage and metadata from Firestore.
 *
 * @param photoId - Photo ID
 */
export async function deletePhoto(photoId: string): Promise<void> {
  if (!auth.currentUser) {
    throw new PhotoError(
      'User not authenticated',
      PhotoErrorCode.ACCESS_DENIED
    );
  }

  const storage = getStorage();
  const db = getFirestore();

  try {
    // Get photo record
    const photoRecord = await getPhotoRecord(photoId);

    // Verify ownership or album ownership
    // Allow deletion if uploadedBy is missing (corrupted data cleanup)
    if (photoRecord.uploadedBy && photoRecord.uploadedBy !== auth.currentUser.uid) {
      // Check if user is album owner
      const albumDoc = await getDoc(doc(db, 'albums', photoRecord.albumId));
      if (!albumDoc.exists() || albumDoc.data()?.ownerId !== auth.currentUser.uid) {
        throw new PhotoError(
          'Not authorized to delete this photo',
          PhotoErrorCode.ACCESS_DENIED
        );
      }
    }

    // Delete from Storage (only if storagePaths exist - for encrypted photos)
    if (photoRecord.storagePaths) {
      const originalRef = ref(storage, photoRecord.storagePaths.original);
      const thumbnailRef = ref(storage, photoRecord.storagePaths.thumbnail);

      // Delete storage files, ignore errors if files don't exist
      const deletionPromises = [
        deleteObject(originalRef).catch((error: any) => {
          // Ignore if file doesn't exist
          if (error.code !== 'storage/object-not-found') {
            console.warn('Failed to delete original photo file:', error);
          }
        }),
        deleteObject(thumbnailRef).catch((error: any) => {
          // Ignore if file doesn't exist
          if (error.code !== 'storage/object-not-found') {
            console.warn('Failed to delete thumbnail file:', error);
          }
        }),
      ];

      await Promise.all(deletionPromises);
    }

    // Delete all comments for this photo
    const commentsRef = collection(db, 'photos', photoId, 'comments');
    const commentsSnapshot = await getDocs(commentsRef);
    const commentDeletions = commentsSnapshot.docs.map(commentDoc =>
      deleteDoc(commentDoc.ref)
    );
    await Promise.all(commentDeletions);

    // Delete from Firestore
    await deleteDoc(doc(db, 'photos', photoId));

    // Update album photo count (only if albumId exists)
    if (photoRecord.albumId) {
      await updateAlbumPhotoCount(photoRecord.albumId, -1);
    }
  } catch (error) {
    if (error instanceof PhotoError) {
      throw error;
    }
    throw new PhotoError(
      'Failed to delete photo',
      PhotoErrorCode.UPLOAD_FAILED,
      error
    );
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Update album photo count
 *
 * @param albumId - Album ID
 * @param delta - Change in photo count (+1 or -1)
 */
async function updateAlbumPhotoCount(albumId: string, delta: number): Promise<void> {
  const db = getFirestore();

  try {
    const albumDoc = await getDoc(doc(db, 'albums', albumId));

    if (albumDoc.exists()) {
      const currentCount = albumDoc.data()?.photoCount || 0;
      await updateDoc(doc(db, 'albums', albumId), {
        photoCount: Math.max(0, currentCount + delta),
        lastModified: Date.now(),
      });
    }
  } catch (error) {
    // Don't fail upload if count update fails
    console.error('Failed to update album photo count:', error);
  }
}

/**
 * Serialize bytes to base64
 */
function serializeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Deserialize base64 to bytes
 */
export function deserializeBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
