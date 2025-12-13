import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL, uploadString, deleteObject, UploadMetadata } from 'firebase/storage';

export const storageService = {
  /**
   * Uploads a file or base64 string to Firebase Storage
   * @param file File object, Blob, or Base64 data URL
   * @param path path in storage (e.g., 'photos/filename.jpg')
   */
  uploadImage: async (file: Blob | Uint8Array | ArrayBuffer | string, path: string): Promise<string> => {
    const storageRef = ref(storage, path);

    if (typeof file === 'string') {
      // Handle Base64 Data URL
      console.log(`[Storage] Uploading string (data_url) to ${path}...`);
      await uploadString(storageRef, file, 'data_url');
    } else {
      // Handle File Object
      console.log(`[Storage] Uploading bytes (${file instanceof Blob ? file.size : file.byteLength} bytes) to ${path}...`);
      await uploadBytes(storageRef, file);
    }
    console.log(`[Storage] Upload to ${path} completed.`);

    return getDownloadURL(storageRef);
  },

  /**
   * Upload with CDN-optimized cache headers
   * Sets long cache duration for immutable encrypted content
   * @param file File or Blob to upload
   * @param path Storage path
   * @returns CDN-backed download URL
   */
  uploadWithCaching: async (file: Blob | Uint8Array | ArrayBuffer, path: string): Promise<string> => {
    const storageRef = ref(storage, path);

    // Set cache headers for CDN optimization
    const metadata: UploadMetadata = {
      cacheControl: 'public, max-age=31536000, immutable', // Cache for 1 year (encrypted content is immutable)
      contentType: file instanceof Blob ? file.type : 'application/octet-stream'
    };

    console.log(`[Storage] Uploading with CDN caching to ${path}...`);
    await uploadBytes(storageRef, file, metadata);
    console.log(`[Storage] Upload completed with cache headers set.`);

    return getDownloadURL(storageRef);
  },

  /**
   * Downloads a file from Storage as a Blob
   */
  downloadBlob: async (path: string): Promise<Blob> => {
    const storageRef = ref(storage, path);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch blob: ${response.statusText}`);
    return await response.blob();
  },

  /**
   * Deletes a file from Firebase Storage
   * @param path path in storage (e.g., 'albums/albumId/photos/photo.enc')
   */
  deleteFile: async (path: string): Promise<void> => {
    const storageRef = ref(storage, path);
    console.log(`[Storage] Deleting file at ${path}...`);
    await deleteObject(storageRef);
    console.log(`[Storage] File deleted successfully.`);
  },

  /**
   * Get thumbnail path from full photo path
   * Converts: albums/xyz/photos/abc.enc -> albums/xyz/photos/thumbs/abc.enc
   */
  getThumbnailPath: (fullPath: string): string => {
    const parts = fullPath.split('/');
    const filename = parts.pop();
    parts.push('thumbs', filename!);
    return parts.join('/');
  },

  /**
   * Get full photo path from thumbnail path
   * Converts: albums/xyz/photos/thumbs/abc.enc -> albums/xyz/photos/abc.enc
   */
  getFullPathFromThumbnail: (thumbnailPath: string): string => {
    return thumbnailPath.replace('/thumbs/', '/');
  },

  /**
   * Check if path is a thumbnail path
   */
  isThumbnailPath: (path: string): boolean => {
    return path.includes('/thumbs/');
  },

  /**
   * Preload encrypted blob in background (for Service Worker cache warming)
   * This triggers a fetch without waiting for the result
   */
  preloadEncryptedBlob: (path: string): void => {
    const storageRef = ref(storage, path);
    getDownloadURL(storageRef)
      .then(url => fetch(url))
      .catch(err => console.warn(`[Storage] Preload failed for ${path}:`, err));
  }
};