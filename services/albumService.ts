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
import { cacheService } from './cacheService';
import * as photoCrypto from '../lib/crypto/photoCrypto';

const ALBUMS_COLLECTION = 'albums';

/**
 * Create a new album
 */
export const createAlbum = async (
    name: string,
    createdBy: string,
    description?: string,
    privacy: 'private' | 'family' | 'public' = 'family',
    members: string[] = [],
    selectedGroups: string[] = [],
    coverPhoto: string | null = null,
    category: string = 'General',
    familyKey?: Uint8Array
): Promise<string> => {
    if (!name || name.length > 50) {
        throw new Error('Album name is required and must be 50 characters or less');
    }

    if (description && description.length > 500) {
        throw new Error('Description must be 500 characters or less');
    }

    let albumData: any = {
        name: name.trim(),
        description: description?.trim() || '',
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        privacy,
        accessType: 'groups', // Default for now
        selectedGroups,
        members: [...new Set([createdBy, ...members])], // Ensure creator is in members
        photoCount: 0,
        videoCount: 0,
        coverPhoto,
        category
    };

    // If familyKey is provided, encrypt the metadata
    if (familyKey) {
        const metadata = {
            name: name.trim(),
            description: description?.trim() || ''
        };
        const encData = await photoCrypto.encryptMetadata(metadata, familyKey);

        albumData = {
            ...albumData,
            name: '[Securely Encrypted]',
            description: '[Securely Encrypted]',
            encryptedName: encData.encrypted, // Contains both name & desc as JSON
            metadataIv: encData.iv,
            metadataAuthTag: encData.authTag
        };
    }

    const docRef = await addDoc(collection(db, ALBUMS_COLLECTION), albumData);
    return docRef.id;
};

/**
 * Update album details
 */
export const updateAlbum = async (
    albumId: string,
    updates: Partial<Pick<Album, 'name' | 'description' | 'members'>>,
    familyKey?: Uint8Array
): Promise<void> => {
    if (updates.name && updates.name.length > 50) {
        throw new Error('Album name must be 50 characters or less');
    }

    if (updates.description && updates.description.length > 500) {
        throw new Error('Description must be 500 characters or less');
    }

    // Filter out undefined values (Firestore doesn't allow them)
    let cleanedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    // If familyKey is provided AND we are updating name/desc, re-encrypt the whole block
    if (familyKey && (updates.name !== undefined || updates.description !== undefined)) {
        // We need the latest name/desc to do a proper update if only one is provided
        // But for simplicity, we can just assume if either is provided, we use the provided values.
        // In the UI, usually both are edited at once in a modal.

        const metadata = {
            name: (updates.name || '').trim(),
            description: (updates.description || '').trim()
        };
        const encData = await photoCrypto.encryptMetadata(metadata, familyKey);

        cleanedUpdates = {
            ...cleanedUpdates,
            name: '[Securely Encrypted]',
            description: '[Securely Encrypted]',
            encryptedName: encData.encrypted,
            metadataIv: encData.iv,
            metadataAuthTag: encData.authTag
        };
    }

    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    await updateDoc(albumRef, {
        ...cleanedUpdates,
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
    onError?: (error: Error) => void,
    category?: string
): (() => void) => {
    let q;

    if (category && category !== 'All') {
        q = query(
            collection(db, ALBUMS_COLLECTION),
            where('members', 'array-contains', userId),
            where('category', '==', category),
            orderBy('updatedAt', 'desc')
        );
    } else {
        q = query(
            collection(db, ALBUMS_COLLECTION),
            where('members', 'array-contains', userId),
            orderBy('updatedAt', 'desc')
        );
    }

    return onSnapshot(
        q,
        async (snapshot) => {
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
                    accessType: data.accessType || 'members',
                    selectedGroups: data.selectedGroups || [],
                    members: data.members || [],
                    photoCount: data.photoCount !== undefined ? data.photoCount : 0,
                    videoCount: data.videoCount !== undefined ? data.videoCount : 0,
                    category: data.category || 'General',
                    encryptedName: data.encryptedName,
                    metadataIv: data.metadataIv,
                    metadataAuthTag: data.metadataAuthTag
                } as Album;
            });

            // Removed auto-migration to prevent permission errors on read-only access.
            // videoCount defaults to 0 in the mapping above.

            // Cache latest albums for landing page performance
            if (albums.length > 0) {
                cacheService.setCachedMetadata('latestAlbums', albums).catch(err => {
                    console.error('[AlbumService] Failed to cache latest albums:', err);
                });
            }

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
                accessType: data.accessType || 'members',
                selectedGroups: data.selectedGroups || [],
                members: data.members || [],
                photoCount: data.photoCount || 0,
                videoCount: data.videoCount || 0,
                encryptedName: data.encryptedName,
                metadataIv: data.metadataIv,
                metadataAuthTag: data.metadataAuthTag
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

/**
 * Increment album video count
 */
export const incrementVideoCount = async (albumId: string): Promise<void> => {
    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    const snapshot = await getDocs(query(collection(db, ALBUMS_COLLECTION), where('__name__', '==', albumId)));

    if (!snapshot.empty) {
        const currentCount = snapshot.docs[0].data().videoCount || 0;
        await updateDoc(albumRef, {
            videoCount: currentCount + 1,
            updatedAt: serverTimestamp()
        });
    }
};

/**
 * Decrement album video count
 */
export const decrementVideoCount = async (albumId: string): Promise<void> => {
    const albumRef = doc(db, ALBUMS_COLLECTION, albumId);
    const snapshot = await getDocs(query(collection(db, ALBUMS_COLLECTION), where('__name__', '==', albumId)));

    if (!snapshot.empty) {
        const currentCount = snapshot.docs[0].data().videoCount || 0;
        await updateDoc(albumRef, {
            videoCount: Math.max(0, currentCount - 1),
            updatedAt: serverTimestamp()
        });
    }
};
