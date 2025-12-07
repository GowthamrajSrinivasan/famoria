import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';

/**
 * @deprecated This service uploads files WITHOUT encryption.
 *
 * **SECURITY WARNING**: Do NOT use this service for uploading photos.
 * Photos uploaded with this service are stored as PLAINTEXT and can be
 * viewed by anyone with access to Firebase Storage.
 *
 * **Use instead**: `securePhotoService` from './securePhotoService'
 *
 * This service is kept for backwards compatibility only and should be
 * removed once all legacy uploads are migrated to encrypted storage.
 *
 * @see services/securePhotoService.ts for encrypted photo uploads
 */
export const storageService = {
  /**
   * @deprecated Use securePhotoService.uploadPhoto() instead
   *
   * **SECURITY WARNING**: This uploads files WITHOUT encryption!
   *
   * Uploads a file or base64 string to Firebase Storage (UNENCRYPTED)
   * @param file File object or Base64 data URL
   * @param path path in storage (e.g., 'photos/filename.jpg')
   */
  uploadImage: async (file: File | string, path: string): Promise<string> => {
    console.warn(
      '⚠️  SECURITY WARNING: storageService.uploadImage() is deprecated!\n' +
      'This uploads files WITHOUT encryption. Use securePhotoService.uploadPhoto() instead.\n' +
      'See: services/securePhotoService.ts'
    );

    const storageRef = ref(storage, path);

    if (typeof file === 'string') {
      // Handle Base64 Data URL
      await uploadString(storageRef, file, 'data_url');
    } else {
      // Handle File Object
      await uploadBytes(storageRef, file);
    }

    return getDownloadURL(storageRef);
  }
};