import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    getDocs,
    Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Album } from '../types';

const ALBUMS_COLLECTION = 'albums';

/**
 * Create a new album
 */
export const createAlbum = async (
    name: string,
    createdBy: string,
    description?: string,
    privacy: 'private' | 'family' | 'public' = 'family',
    members: string[] = []
): Promise<string> => {
    if (!name || name.length > 50) {
        throw new Error('Album name is required and must be 50 characters or less');
    }

    if (description && description.length > 500) {
        throw new Error('Description must be 500 characters or less');
    }

    const albumData = {
        name: name.trim(),
        description: description?.trim() || '',
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        privacy,
        members: [...new Set([createdBy, ...members])], // Ensure creator is in members
        photoCount: 0,
        coverPhoto: null
    };

    const docRef = await addDoc(collection(db, ALBUMS_COLLECTION), albumData);
    return docRef.id;
};

/**
 * Update album details
 */
export const updateAlbum = async (
    albumId: string,
    updates: Partial<Pick<Album, 'name' | 'description' | 'privacy' | 'members'>>
): Promise<void> => {
    if (updates.name && updates.name.length > 50) {
        throw new Error('Album name must be 50 characters or less');
    }

    if (updates.description && updates.description.length > 500) {
        throw new Error('Description must be 500 characters or less');
    }

    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    await updateDoc(albumRef, {
        ...updates,
        updatedAt: serverTimestamp()
    });
};

/**
 * Set album cover photo
 */
export const setAlbumCover = async (albumId: string, photoUrl: string): Promise<void> => {
    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    await updateDoc(albumRef, {
        coverPhoto: photoUrl,
        updatedAt: serverTimestamp()
    });
};

/**
 * Delete an album
 */
export const deleteAlbum = async (albumId: string): Promise<void> => {
    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    await deleteDoc(albumRef);
    // Note: Photos in this album should be handled separately
    // or cascade delete in Firestore rules/functions
};

/**
 * Get albums for a user with real-time updates
 */
export const subscribeToAlbums = (
    userId: string,
    onUpdate: (albums: Album[]) => void,
    onError?: (error: Error) => void
): (() => void) => {
    const q = query(
        collection(db, ALBUMS_COLLECTION),
        where('members', 'array-contains', userId),
        orderBy('updatedAt', 'desc')
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const albums: Album[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name,
                    description: data.description,
                    coverPhoto: data.coverPhoto,
                    createdBy: data.createdBy,
                    createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
                    updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
                    privacy: data.privacy,
                    members: data.members || [],
                    photoCount: data.photoCount || 0
                } as Album;
            });
            onUpdate(albums);
        },
        (error) => {
            console.error('Error fetching albums:', error);
            onError?.(error);
        }
    );
};

/**
 * Search albums by name
 */
export const searchAlbums = async (userId: string, searchTerm: string): Promise<Album[]> => {
    const q = query(
        collection(db, ALBUMS_COLLECTION),
        where('members', 'array-contains', userId)
    );

    const snapshot = await getDocs(q);
    const albums: Album[] = snapshot.docs
        .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                description: data.description,
                coverPhoto: data.coverPhoto,
                createdBy: data.createdBy,
                createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
                updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
                privacy: data.privacy,
                members: data.members || [],
                photoCount: data.photoCount || 0
            } as Album;
        })
        .filter(album =>
            album.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            album.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );

    return albums;
};

/**
 * Increment album photo count
 */
export const incrementPhotoCount = async (albumId: string): Promise<void> => {
    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    const snapshot = await getDocs(query(collection(db, ALBUMS_COLLECTION), where('__name__', '==', albumId)));

    if (!snapshot.empty) {
        const currentCount = snapshot.docs[0].data().photoCount || 0;
        await updateDoc(albumRef, {
            photoCount: currentCount + 1,
            updatedAt: serverTimestamp()
        });
    }
};

/**
 * Decrement album photo count
 */
export const decrementPhotoCount = async (albumId: string): Promise<void> => {
    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    const snapshot = await getDocs(query(collection(db, ALBUMS_COLLECTION), where('__name__', '==', albumId)));

    if (!snapshot.empty) {
        const currentCount = snapshot.docs[0].data().photoCount || 0;
        await updateDoc(albumRef, {
            photoCount: Math.max(0, currentCount - 1),
            updatedAt: serverTimestamp()
        });
    }
};
