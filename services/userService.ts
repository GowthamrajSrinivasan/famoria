import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { UserUsage } from '../types';

const USERS_COLLECTION = 'users';
const DEFAULT_LIMIT = 20; // Default to Pro limit for now

export const userService = {
  getUsage: async (userId: string): Promise<UserUsage> => {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const data = userSnap.data();
        return {
          editsUsed: data.editsUsed || 0,
          limit: data.planLimit || DEFAULT_LIMIT,
          plan: data.plan || 'Pro'
        };
      }
      return { editsUsed: 0, limit: DEFAULT_LIMIT, plan: 'Pro' };
    } catch (error) {
      console.error("Error fetching usage", error);
      return { editsUsed: 0, limit: DEFAULT_LIMIT, plan: 'Pro' };
    }
  },

  incrementUsage: async (userId: string): Promise<void> => {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      editsUsed: increment(1)
    });
  },

  checkQuota: async (userId: string): Promise<boolean> => {
    const usage = await userService.getUsage(userId);
    return usage.editsUsed < usage.limit;
  }
};