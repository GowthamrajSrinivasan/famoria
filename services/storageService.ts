import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';

export const storageService = {
  /**
   * Uploads a file or base64 string to Firebase Storage
   * @param file File object or Base64 data URL
   * @param path path in storage (e.g., 'photos/filename.jpg')
   */
  uploadImage: async (file: File | string, path: string): Promise<string> => {
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