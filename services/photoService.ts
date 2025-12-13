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
  serverTimestamp
} from 'firebase/firestore';
import { Photo } from '../types';

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
  }
};