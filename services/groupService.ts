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
import { Group } from '../types';

const GROUPS_COLLECTION = 'groups';

/**
 * Create a new group
 */
export const createGroup = async (
    name: string,
    createdBy: string,
    members: string[] = [],
    description?: string,
    color?: string,
    icon?: string
): Promise<string> => {
    if (!name || name.length > 50) {
        throw new Error('Group name is required and must be 50 characters or less');
    }

    if (description && description.length > 500) {
        throw new Error('Description must be 500 characters or less');
    }

    const groupData = {
        name: name.trim(),
        description: description?.trim() || '',
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        members: [...new Set([createdBy, ...members])], // Ensure creator is in members
        color: color || '#f97316', // Default orange color
        icon: icon || '👥' // Default group icon
    };

    const docRef = await addDoc(collection(db, GROUPS_COLLECTION), groupData);
    return docRef.id;
};

/**
 * Update group details
 */
export const updateGroup = async (
    groupId: string,
    updates: Partial<Pick<Group, 'name' | 'description' | 'members' | 'color' | 'icon'>>
): Promise<void> => {
    if (updates.name && updates.name.length > 50) {
        throw new Error('Group name must be 50 characters or less');
    }

    if (updates.description && updates.description.length > 500) {
        throw new Error('Description must be 500 characters or less');
    }

    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    await updateDoc(groupRef, {
        ...updates,
        updatedAt: serverTimestamp()
    });
};

/**
 * Delete a group
 */
export const deleteGroup = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    await deleteDoc(groupRef);
};

/**
 * Get groups for a user with real-time updates
 */
export const subscribeToGroups = (
    userId: string,
    onUpdate: (groups: Group[]) => void,
    onError?: (error: Error) => void
): (() => void) => {
    const q = query(
        collection(db, GROUPS_COLLECTION),
        where('members', 'array-contains', userId),
        orderBy('updatedAt', 'desc')
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const groups: Group[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name,
                    description: data.description,
                    createdBy: data.createdBy,
                    createdAt: (data.createdAt as Timestamp)?.toMillis() || Date.now(),
                    updatedAt: (data.updatedAt as Timestamp)?.toMillis() || Date.now(),
                    members: data.members || [],
                    color: data.color || '#f97316',
                    icon: data.icon || '👥'
                } as Group;
            });
            onUpdate(groups);
        },
        (error: any) => {
            // Suppress permission errors (expected when not logged in)
            if (!error.message?.includes('permission')) {
                console.warn('Error fetching groups:', error);
            }
            // Don't clear groups on error - keeps existing groups visible
            onError?.(error);
        }
    );
};

/**
 * Get all groups (admin function)
 */
export const getAllGroups = async (): Promise<Group[]> => {
    const snapshot = await getDocs(collection(db, GROUPS_COLLECTION));
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            description: data.description,
            createdBy: data.createdBy,
            createdAt: (data.createdAt as Timestamp)?.toMillis() || Date.now(),
            updatedAt: (data.updatedAt as Timestamp)?.toMillis() || Date.now(),
            members: data.members || [],
            color: data.color || '#f97316',
            icon: data.icon || '👥'
        } as Group;
    });
};

/**
 * Add member to group
 */
export const addMemberToGroup = async (groupId: string, userId: string): Promise<void> => {
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const snapshot = await getDocs(query(collection(db, GROUPS_COLLECTION), where('__name__', '==', groupId)));

    if (!snapshot.empty) {
        const currentMembers = snapshot.docs[0].data().members || [];
        if (!currentMembers.includes(userId)) {
            await updateDoc(groupRef, {
                members: [...currentMembers, userId],
                updatedAt: serverTimestamp()
            });
        }
    }
};

/**
 * Remove member from group
 */
export const removeMemberFromGroup = async (groupId: string, userId: string): Promise<void> => {
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const snapshot = await getDocs(query(collection(db, GROUPS_COLLECTION), where('__name__', '==', groupId)));

    if (!snapshot.empty) {
        const currentMembers = snapshot.docs[0].data().members || [];
        await updateDoc(groupRef, {
            members: currentMembers.filter((id: string) => id !== userId),
            updatedAt: serverTimestamp()
        });
    }
};
