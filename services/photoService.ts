import { db } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  doc,
  updateDoc 
} from 'firebase/firestore';
import { Photo } from '../types';

const PHOTOS_COLLECTION = 'photos';

export const photoService = {
  addPhoto: async (photo: Omit<Photo, 'id'>) => {
    // We store server timestamp for sorting
    const docData = {
      ...photo,
      createdAt: Timestamp.now(),
      likes: [],
      commentsCount: 0
    };
    
    const docRef = await addDoc(collection(db, PHOTOS_COLLECTION), docData);
    return { ...photo, id: docRef.id };
  },

  subscribeToFeed: (callback: (photos: Photo[]) => void) => {
    const q = query(
      collection(db, PHOTOS_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const photos = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Convert Firestore timestamp to string date for display if needed
            // or keep the existing date string format from input
          } as Photo;
        });
        callback(photos);
      },
      (error) => {
        console.error('Feed subscription error:', error);
      }
    );
  }
};