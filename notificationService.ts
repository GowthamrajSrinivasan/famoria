import { db } from '../lib/firebase';
import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    writeBatch,
    getDocs
} from 'firebase/firestore';
import { Notification } from '../types';

const NOTIFICATIONS_COLLECTION = 'notifications';

export const notificationService = {
    createNotification: async (notification: Omit<Notification, 'id'>) => {
        try {
            await addDoc(collection(db, NOTIFICATIONS_COLLECTION), notification);
        } catch (error) {
            console.error("Error creating notification", error);
        }
    },

    subscribeToNotifications: (userId: string, callback: (notifications: Notification[]) => void) => {
        const q = query(
            collection(db, NOTIFICATIONS_COLLECTION),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc')
        );

        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Notification));
            callback(notifications);
        });
    },

    markAsRead: async (notificationId: string) => {
        const ref = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
        await updateDoc(ref, { isRead: true });
    },

    markAllAsRead: async (userId: string) => {
        const q = query(
            collection(db, NOTIFICATIONS_COLLECTION),
            where('userId', '==', userId),
            where('isRead', '==', false)
        );

        const snapshot = await getDocs(q);
        const batch = writeBatch(db);

        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { isRead: true });
        });

        await batch.commit();
    }
};
