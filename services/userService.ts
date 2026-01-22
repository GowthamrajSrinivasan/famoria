import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment, collection, getDocs, query, where } from 'firebase/firestore';
import { UserUsage, User } from '../types';

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
  },

  /**
   * @deprecated DO NOT USE. This will trigger "Permission Denied" errors under the new security rules.
   * Use getFamilyMembers(familyId) instead.
   */
  getAllUsers: async (): Promise<User[]> => {
    try {
      console.warn('[UserService] getAllUsers called. This is restricted and will likely fail.');
      const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
      return usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
    } catch (error) {
      console.error("Error fetching all users", error);
      return [];
    }
  },

  getFamilyMembers: async (familyIdValue: string): Promise<User[]> => {
    try {
      if (!familyIdValue) return [];
      const q = query(
        collection(db, USERS_COLLECTION),
        where('families', 'array-contains', familyIdValue)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
    } catch (error: any) {
      if (error?.code !== 'permission-denied') {
        console.error("Error fetching family members", error);
      }
      return [];
    }
  },

  updateUserFamily: async (userId: string, familyIdValue: string, hasKeyAccessValue: boolean, role: 'admin' | 'member' = 'member'): Promise<void> => {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userSnap = await getDoc(userRef);

      let families = [familyIdValue];
      let memberships = {
        [familyIdValue]: {
          role,
          joinedAt: Date.now()
        }
      };

      if (userSnap.exists()) {
        const data = userSnap.data();
        const existingFamilies = data.families || [];
        const existingMemberships = data.memberships || {};

        if (!existingFamilies.includes(familyIdValue)) {
          families = [...existingFamilies, familyIdValue];
        } else {
          families = existingFamilies;
        }

        memberships = {
          ...existingMemberships,
          [familyIdValue]: {
            role,
            joinedAt: existingMemberships[familyIdValue]?.joinedAt || Date.now()
          }
        };
      }

      await updateDoc(userRef, {
        familyId: familyIdValue, // Set as active
        families,
        memberships,
        hasKeyAccess: hasKeyAccessValue,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating user family", error);
      throw error;
    }
  },

  setHasKeyAccess: async (userId: string, value: boolean): Promise<void> => {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        hasKeyAccess: value,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating key access", error);
      throw error;
    }
  },

  getUserById: async (userId: string): Promise<User | null> => {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        return {
          id: userSnap.id,
          ...userSnap.data()
        } as User;
      }
      return null;
    } catch (error) {
      console.error("Error fetching user by ID", error);
      return null;
    }
  },

  setActiveFamily: async (userId: string, familyIdValue: string, hasKeyAccessValue: boolean): Promise<void> => {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        familyId: familyIdValue,
        hasKeyAccess: hasKeyAccessValue,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error setting active family", error);
      throw error;
    }
  },

  getFamilyDisplayName: async (familyIdValue: string): Promise<string> => {
    try {
      if (!familyIdValue) return 'Unknown Family';
      const q = query(
        collection(db, USERS_COLLECTION),
        where('families', 'array-contains', familyIdValue)
      );
      const querySnapshot = await getDocs(q);
      const members = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      const admin = members.find(m => m.memberships?.[familyIdValue]?.role === 'admin');
      if (admin) return `${admin.name}'s Family`;
      if (members.length > 0) return `${members[0].name}'s Family`;
      return familyIdValue;
    } catch (error: any) {
      // Silently handle permission errors - common when switching families or if rules are restrictive
      if (error?.code !== 'permission-denied') {
        console.error("Error fetching family display name", error);
      }
      return familyIdValue;
    }
  }
};