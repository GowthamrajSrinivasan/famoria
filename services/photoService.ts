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
import { Photo, Post } from '../types';
import { storageService } from './storageService';

const PHOTOS_COLLECTION = 'photos';
const POSTS_COLLECTION = 'posts';

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
    const albumDocRef = await addDoc(collection(db, 'albums', albumId, 'photos'), {
      ...encryptedPhotoData,
      createdAt: serverTimestamp()
    });

    // 2. Write reference record to top-level photos collection for Family Feed
    // Use the same document ID in feed collection to maintain consistency
    const feedDocRef = await addDoc(collection(db, PHOTOS_COLLECTION), {
      albumPhotoId: albumDocRef.id,  // Reference to album photo
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

    return { ...encryptedPhotoData, id: albumDocRef.id };
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
  },

  // POST METHODS (Multi-Image Posts)

  /**
   * Create a new post with metadata
   * @param postData Post data (without ID)
   * @returns Created post with ID
   */
  createPost: async (postData: Omit<Post, 'id'>): Promise<Post> => {
    console.log(`[PhotoService] Creating post shell (initially with 0 photos, ID generation phase)`);

    const docData = {
      ...postData,
      createdAt: serverTimestamp(),
      likes: postData.likes || [],
      commentsCount: postData.commentsCount || 0
    };

    const docRef = await addDoc(collection(db, POSTS_COLLECTION), docData);
    console.log(`[PhotoService] Post created with ID: ${docRef.id}`);

    return {
      ...postData,
      id: docRef.id,
      createdAt: Date.now() // Use current time for immediate display
    };
  },

  /**
   * Add multiple encrypted photos to album subcollection as part of a post
   * @param albumId Album ID
   * @param postId Post ID these photos belong to
   * @param photoDataArray Array of encrypted photo data
   * @returns Array of created photos with IDs
   */
  addPhotosToPost: async (
    albumId: string,
    postId: string,
    photoDataArray: any[]
  ): Promise<any[]> => {
    console.log(`[PhotoService] Adding ${photoDataArray.length} photos to post ${postId}`);

    const createdPhotos = [];

    for (let i = 0; i < photoDataArray.length; i++) {
      const photoData = {
        ...photoDataArray[i],
        postId: postId,
        orderInPost: i,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(
        collection(db, 'albums', albumId, 'photos'),
        photoData
      );

      createdPhotos.push({ ...photoDataArray[i], id: docRef.id });
      console.log(`[PhotoService] Photo ${i + 1}/${photoDataArray.length} added: ${docRef.id}`);
    }

    return createdPhotos;
  },

  /**
   * Subscribe to posts feed (replaces single-photo feed)
   * @param userId User ID to filter posts by
   * @param callback Callback function with posts array
   * @returns Unsubscribe function
   */
  subscribeToPostsFeed: (userId: string, callback: (posts: Post[]) => void) => {
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const posts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now()
        } as Post;
      });

      console.log(`[PhotoService] Posts feed updated: ${posts.length} posts`);
      callback(posts);
    }, (error) => {
      console.error('Posts feed subscription error:', error);
    });
  },

  /**
   * Get all photos for a specific post
   * @param albumId Album ID
   * @param postId Post ID
   * @returns Array of photos in the post, ordered by orderInPost
   */
  getPostPhotos: async (albumId: string, postId: string): Promise<any[]> => {
    const q = query(
      collection(db, 'albums', albumId, 'photos'),
      where('postId', '==', postId),
      orderBy('orderInPost', 'asc')
    );

    const snapshot = await getDocs(q);
    const photos = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`[PhotoService] Retrieved ${photos.length} photos for post ${postId}`);
    return photos;
  },

  /**
   * Delete a post and all its photos
   * @param postId Post ID
   * @param albumId Album ID (if encrypted)
   * @param photoIds Array of photo IDs to delete
   */
  deletePost: async (postId: string, albumId?: string, photoIds?: string[]): Promise<void> => {
    console.log(`[PhotoService] Deleting post ${postId}`);

    try {
      // 1. Delete post from posts collection
      await deleteDoc(doc(db, POSTS_COLLECTION, postId));

      // 2. Delete all associated photos from album subcollection if encrypted
      if (albumId && photoIds && photoIds.length > 0) {
        for (const photoId of photoIds) {
          try {
            await photoService.deleteEncryptedPhoto(albumId, photoId);
          } catch (error) {
            console.warn(`[PhotoService] Could not delete photo ${photoId}:`, error);
          }
        }
      }

      console.log(`[PhotoService] Post ${postId} deleted successfully`);
    } catch (error) {
      console.error(`[PhotoService] Error deleting post:`, error);
      throw error;
    }
  },

  /**
   * Subscribe to posts in a specific album
   * @param albumId Album ID to fetch posts from
   * @param callback Function to call with posts array
   * @returns Unsubscribe function
   */
  subscribeToAlbumPosts: (albumId: string, callback: (posts: Post[]) => void) => {
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('albumId', '==', albumId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const posts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now()
        } as Post;
      });

      console.log(`[PhotoService] Album posts updated: ${posts.length} posts`);
      callback(posts);
    }, (error) => {
      console.error('Album posts subscription error:', error);
    });
  }
};