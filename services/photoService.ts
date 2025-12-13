import { db } from '../lib/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { Photo } from '../types';
import { storageService } from './storageService';

const PHOTOS_COLLECTION = 'photos';

export const photoService = {
  // LEGACY / PUBLIC FEED SUPPORT
  addPhoto: async (photo: Omit<Photo, 'id'>) => {
    const docData = {
      ...photo,
      createdAt: Timestamp.now(),
      likes: [],
      commentsCount: 0
    };
    const docRef = await addDoc(collection(db, PHOTOS_COLLECTION), docData);
    return { ...photo, id: docRef.id };
  },

  subscribeToFeed: (userId: string, callback: (photos: Photo[]) => void) => {
    const q = query(
      collection(db, PHOTOS_COLLECTION),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const photos = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
        } as Photo;
      });
      callback(photos);
    }, (error) => {
      console.error('Feed subscription error:', error);
    });
  },

  // ENCRYPTED ALBUM SUPPORT
  addEncryptedPhoto: async (albumId: string, photoData: any) => {
    const docRef = await addDoc(collection(db, 'albums', albumId, 'photos'), {
      ...photoData,
      createdAt: serverTimestamp()
    });
    return { ...photoData, id: docRef.id };
  },

  // DUAL-WRITE: For encrypted photos that should also appear in Family Feed
  addPhotoWithDualWrite: async (albumId: string, encryptedPhotoData: any, feedMetadata: { caption: string; tags: string[]; author: string; authorId: string }) => {
    // 1. Write encrypted data to album subcollection
    const docRef = await addDoc(collection(db, 'albums', albumId, 'photos'), {
      ...encryptedPhotoData,
      createdAt: serverTimestamp()
    });

    // 2. Write reference record to top-level photos collection for Family Feed
    await addDoc(collection(db, PHOTOS_COLLECTION), {
      id: docRef.id,
      albumId: albumId,
      caption: feedMetadata.caption,
      tags: feedMetadata.tags,
      author: feedMetadata.author,
      authorId: feedMetadata.authorId,
      isEncrypted: true,
      createdAt: serverTimestamp(),
      likes: [],
      commentsCount: 0
    });

    return { ...encryptedPhotoData, id: docRef.id };
  },

  subscribeToAlbum: (albumId: string, callback: (photos: any[]) => void) => {
    const q = query(
      collection(db, 'albums', albumId, 'photos'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const photos = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(photos);
    });
  },

  // DELETION METHODS

  /**
   * Delete photo from top-level photos collection (Feed reference)
   */
  deletePhoto: async (photoId: string): Promise<void> => {
    const q = query(
      collection(db, PHOTOS_COLLECTION),
      where('id', '==', photoId)
    );
    const snapshot = await getDocs(q);

    snapshot.forEach(async (docSnapshot) => {
      await deleteDoc(doc(db, PHOTOS_COLLECTION, docSnapshot.id));
    });
    console.log(`[PhotoService] Deleted photo ${photoId} from feed`);
  },

  /**
   * Delete encrypted photo from album subcollection
   */
  deleteEncryptedPhoto: async (albumId: string, photoId: string): Promise<void> => {
    const photoRef = doc(db, 'albums', albumId, 'photos', photoId);
    await deleteDoc(photoRef);
    console.log(`[PhotoService] Deleted encrypted photo ${photoId} from album ${albumId}`);
  },

  /**
   * Complete photo deletion - removes from all locations
   * @param albumId Album containing the photo
   * @param photoId Photo document ID
   * @param encryptedPath Path to encrypted file in Storage
   */
  deletePhotoCompletely: async (albumId: string, photoId: string, encryptedPath?: string): Promise<void> => {
    console.log(`[PhotoService] Starting complete deletion for photo ${photoId}`);

    try {
      // 1. Delete from album subcollection
      await photoService.deleteEncryptedPhoto(albumId, photoId);

      // 2. Delete from top-level photos collection (feed)
      await photoService.deletePhoto(photoId);

      // 3. Delete encrypted file from Storage if path provided
      if (encryptedPath) {
        try {
          await storageService.deleteFile(encryptedPath);
        } catch (error) {
          console.warn(`[PhotoService] Could not delete file at ${encryptedPath}:`, error);
          // Don't throw - Firestore cleanup is more critical
        }
      }

      console.log(`[PhotoService] Complete deletion successful for photo ${photoId}`);
    } catch (error) {
      console.error(`[PhotoService] Error during complete deletion:`, error);
      throw error;
    }
  }
};