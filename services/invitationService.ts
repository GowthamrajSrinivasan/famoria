import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { Invitation } from '../types';
import { nanoid } from 'nanoid';
import { emailService } from './emailService';

// removed albumService import as we use direct firestore updates for atomicity/simplicity in this context or we can import specific functions if needed
// Actually, let's use direct firestore for adding member to avoid circular deps or missing methods
const INVITATIONS_COLLECTION = 'invitations';
const ALBUMS_COLLECTION = 'albums';

export const invitationService = {
    /**
     * Creates a new invitation and sends an email.
     * key (Master Key) is NOT stored in DB, only sent in the link.
     */
    createInvitation: async (
        invitedByUserId: string,
        keyBase64: string, // The Master Key in Base64
        familyId: string,
        albumId?: string,
        email?: string // Optional now
    ): Promise<string> => {
        console.log('[invitationService] creating invite:', { invitedByUserId, familyId, albumId, keyPresent: !!keyBase64 });

        if (!familyId) {
            throw new Error('Family ID is required to create an invitation. Please ensure your family is set up.');
        }

        try {
            const token = nanoid(32); // Secure random token
            const invitation: Invitation = {
                id: token,
                email: email || 'whatsapp-share', // Placeholder if not provided
                invitedBy: invitedByUserId,
                familyId,
                albumId: albumId || null,
                status: 'pending',
                createdAt: Date.now(),
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
            };

            console.log('[invitationService] saving invitation object:', invitation);

            // Store invitation in Firestore
            await setDoc(doc(db, INVITATIONS_COLLECTION, token), invitation);

            return token;
        } catch (error) {
            console.error('Error creating invitation:', error);
            throw error;
        }
    },

    /**
     * Validates an invitation token.
     */
    validateInvitation: async (token: string): Promise<Invitation | null> => {
        try {
            const docRef = doc(db, INVITATIONS_COLLECTION, token);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const invite = docSnap.data() as Invitation;
                if (invite.status === 'pending' && invite.expiresAt > Date.now()) {
                    return invite;
                }
            }
            return null;
        } catch (error) {
            console.error('Error validating invitation:', error);
            return null;
        }
    },

    /**
     * Accepts an invitation.
     * Updates status and adds user to album/group if applicable.
     */
    acceptInvitation: async (token: string, userId: string): Promise<Invitation> => {
        try {
            const invite = await invitationService.validateInvitation(token);
            if (!invite) throw new Error('Invalid or expired invitation');

            // Update Invitation Status
            const docRef = doc(db, INVITATIONS_COLLECTION, token);
            await updateDoc(docRef, {
                status: 'accepted'
            });

            // Add user to Album Members if albumId is present
            if (invite.albumId) {
                // Direct update using arrayUnion
                const albumRef = doc(db, ALBUMS_COLLECTION, invite.albumId);
                await updateDoc(albumRef, {
                    members: arrayUnion(userId)
                });
            }

            // Sync Family ID and Key Access to User Profile
            const { userService } = await import('./userService');
            await userService.updateUserFamily(userId, invite.familyId, true);

            return invite;
        } catch (error) {
            console.error('Error accepting invitation:', error);
            throw error;
        }
    }
};

// Helper to get album name
async function getAlbumName(albumId: string): Promise<string> {
    try {
        const d = await getDoc(doc(db, 'albums', albumId));
        return d.exists() ? d.data().name : 'Shared Album';
    } catch {
        return 'Shared Album';
    }
}
