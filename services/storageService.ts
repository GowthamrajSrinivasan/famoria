import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';

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
   * Downloads a file from Storage as a Blob
   */
  downloadBlob: async (path: string): Promise<Blob> => {
    const storageRef = ref(storage, path);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch blob: ${response.statusText}`);
    return await response.blob();
  }
};