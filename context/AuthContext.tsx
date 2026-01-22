import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { cacheService } from '../services/cacheService';
import { familyService } from '../services/familyService';
import { getFamilyKey, deleteFamilyKey, saveFamilyKey } from '../lib/crypto/keyStore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  googleAccessToken: string | null;
  refreshDriveToken: () => Promise<string | null>;

  // Family Key Interface
  familyKey: Uint8Array | null;
  isFamilyAuthenticated: boolean;
  hasLocalKey: boolean; // True if key exists in local storage
  setupFamily: () => Promise<void>;
  lockFamily: () => Promise<void>;
  unlockFamilyLocally: () => Promise<void>; // Try to unlock with local key
  switchFamily: (familyId: string) => Promise<void>; // Switch active family
  syncFromDrive: () => Promise<void>; // Restore key from Drive
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => { },
  signOut: async () => { },
  error: null,
  googleAccessToken: null,
  refreshDriveToken: async () => null,

  familyKey: null,
  isFamilyAuthenticated: false,
  hasLocalKey: false,
  setupFamily: async () => { },
  lockFamily: async () => { },
  unlockFamilyLocally: async () => { },
  switchFamily: async () => { },
  syncFromDrive: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  // Family Key State
  const [familyKey, setFamilyKey] = useState<Uint8Array | null>(null);
  const [isFamilyAuthenticated, setIsFamilyAuthenticated] = useState(false);
  const [hasLocalKey, setHasLocalKey] = useState(false);
  const [isKeyInitialized, setIsKeyInitialized] = useState(false);

  const lockFamily = async () => {
    setFamilyKey(null);
    setIsFamilyAuthenticated(false);

    try {
      // Clear from IDB (Secure Logout)
      // UPDATED: We do NOT delete the key from IDB anymore.
      // This ensures trusted devices remain trusted across sessions.
      // await deleteFamilyKey(); 

      // Clear all decrypted cache for security
      // We catch this specifically to avoid blocking if cache clearing fails
      await cacheService.clearAllCache().catch(e => console.error('Cache clear failed:', e));
      console.log('[AuthContext] Family locked (memory cleared, key persists in IDB)');;
    } catch (e) {
      console.error('Error during family lock:', e);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Sync user data
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          const userData: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'Family Member',
            email: firebaseUser.email,
            avatar: firebaseUser.photoURL || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + firebaseUser.uid,
            lastLogin: new Date().toISOString()
          };

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              ...userData,
              createdAt: new Date().toISOString(),
              plan: 'Pro',
              planLimit: 20,
              editsUsed: 0,
              hasKeyAccess: false,
              families: [],
              memberships: {}
            });
            setUser({ ...userData, hasKeyAccess: false, families: [], memberships: {} });
          } else {
            const data = userSnap.data();
            setUser({
              ...userData,
              familyId: data.familyId,
              families: data.families || [],
              memberships: data.memberships || {},
              hasKeyAccess: data.hasKeyAccess,
              plan: data.plan || 'Pro'
            });
          }
        } catch (err: any) {
          console.error('Firestore error:', err);
          setUser({
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'Family Member',
            email: firebaseUser.email,
            avatar: firebaseUser.photoURL || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + firebaseUser.uid,
            lastLogin: new Date().toISOString()
          });
          setError('Unable to sync user data.');
        }

      } else {
        setUser(null);
        setGoogleAccessToken(null);
        lockFamily(); // Local clear
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Initialize Family Key on User Login
  useEffect(() => {
    const initFamilyKey = async () => {
      if (!user) {
        setFamilyKey(null);
        setIsFamilyAuthenticated(false);
        setIsKeyInitialized(true);
        return;
      }

      try {
        console.log(`[AuthContext] Initializing Family Key for FID: ${user.familyId || 'legacy'}...`);

        // 1. Check Local IDB
        let key = await getFamilyKey(user.familyId);
        setHasLocalKey(!!key);

        // If key is found locally but user doesn't have hasKeyAccess in profile, update it
        if (key && user && !user.hasKeyAccess) {
          import('../services/userService').then(({ userService }) => {
            userService.setHasKeyAccess(user.id, true);
          });
          setUser(prev => prev ? { ...prev, hasKeyAccess: true } : null);
        }

        // 2. If missing, try to restore from Drive (if token available)
        if (!key && googleAccessToken && user.familyId) {
          console.log('[AuthContext] ☁️ Local key missing, checking Drive AppData...');
          key = await familyService.restoreKeyFromDrive(googleAccessToken, user.familyId);
          if (key && user) {
            console.log('[AuthContext] ✅ Key successfully restored from Google Drive!');
            import('../services/userService').then(({ userService }) => {
              userService.setHasKeyAccess(user.id, true);
            });
            setUser(prev => prev ? { ...prev, hasKeyAccess: true } : null);
            await saveFamilyKey(key, user.familyId);
          } else if (!key) {
            console.warn('[AuthContext] ❌ Key NOT found in Google Drive AppData.');
          }
        }

        if (key) {
          setFamilyKey(key);
          setIsFamilyAuthenticated(true);
          console.log(`[AuthContext] 🔐 Family Authentication Successful for FID: ${user.familyId}`);

          // Verify IDB persistence (Double Check)
          try {
            if (user.familyId) {
              const inIdb = await getFamilyKey(user.familyId);
              if (!inIdb) {
                console.log(`[AuthContext] 💾 Key in memory but missing from IDB for FID: ${user.familyId}. Saving now...`);
                await saveFamilyKey(key, user.familyId);
              }
            }
          } catch (e) {
            console.error('[AuthContext] ❌ Failed to verify/save IDB persistence', e);
          }
        } else {
          console.log('[AuthContext] 🔓 No Family Key found. Vault is locked/not setup.');
          setIsFamilyAuthenticated(false);
        }
      } catch (err) {
        console.error('[AuthContext] Critical initialization error:', err);
      } finally {
        setIsKeyInitialized(true);
      }
    };

    initFamilyKey();
  }, [user?.familyId, googleAccessToken]); // Trigger on family switch

  const signIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
      }
    } catch (err: any) {
      console.error("Login failed", err);
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  const refreshDriveToken = async (): Promise<string | null> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setGoogleAccessToken(token);
        return token;
      }
    } catch (err) {
      console.error("Failed to refresh token", err);
    }
    return null;
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // State cleanup is handled by onAuthStateChanged listener
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const setupFamily = async () => {
    if (!user) return;

    let token = googleAccessToken;
    if (!token) token = await refreshDriveToken();
    if (!token) throw new Error("Google Drive access required to setup Family Vault");

    console.log('[AuthContext] Creating new Family Master Key...');
    const key = await familyService.createFamilyKey(token);

    // Generate or get Family ID
    const { nanoid } = await import('nanoid');
    const familyIdValue = user.familyId || nanoid(12);

    // Update User in Firestore as ADMIN
    const { userService } = await import('../services/userService');
    await userService.updateUserFamily(user.id, familyIdValue, true, 'admin');

    // Save key with the new ID
    await saveFamilyKey(key, familyIdValue);

    setFamilyKey(key);
    setIsFamilyAuthenticated(true);
    // User state will be updated by Firestore listener if we had one, 
    // but here we manually update to reflect changes immediately
    setUser(prev => prev ? {
      ...prev,
      familyId: familyIdValue,
      families: prev.families?.includes(familyIdValue) ? prev.families : [...(prev.families || []), familyIdValue],
      hasKeyAccess: true
    } : null);
  };

  const switchFamily = async (fid: string) => {
    if (!user || user.familyId === fid) return;

    console.log(`[AuthContext] Switching to Family: ${fid}`);

    // 1. Clear current key from memory (lock)
    setFamilyKey(null);
    setIsFamilyAuthenticated(false);
    setIsKeyInitialized(false);

    // 2. Clear cache to prevent leakage across families
    await cacheService.clearAllCache().catch(e => console.error('Cache clear failed:', e));

    // 3. Update active family in Firestore
    const { userService } = await import('../services/userService');
    const hasKey = !!(await getFamilyKey(fid));
    await userService.setActiveFamily(user.id, fid, hasKey);

    // 4. Update local user state
    setUser(prev => prev ? { ...prev, familyId: fid, hasKeyAccess: hasKey } : null);

    // initFamilyKey effect will trigger due to user.familyId change
  };

  const syncFromDrive = async () => {
    if (!user?.familyId) throw new Error("No active family found.");

    // 1. Force refresh token to ensure we have Drive scope
    const token = await refreshDriveToken();
    if (!token) {
      throw new Error("Google Drive access required.");
    }

    // 2. Attempt restore
    const key = await familyService.restoreKeyFromDrive(token, user.familyId);

    if (key) {
      console.log('[AuthContext] ✅ Key successfully restored from Google Drive!');
      const { userService } = await import('../services/userService');
      await userService.setHasKeyAccess(user.id, true);
      setUser(prev => prev ? { ...prev, hasKeyAccess: true } : null);
      await saveFamilyKey(key, user.familyId);

      setFamilyKey(key);
      setIsFamilyAuthenticated(true);
    } else {
      throw new Error("No Family Key found in your Google Drive.");
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signOut,
    error,
    googleAccessToken,
    isDriveAuthenticated: !!googleAccessToken,
    refreshDriveToken,

    // Family Key Exports
    familyKey,
    isFamilyAuthenticated,
    hasLocalKey,
    setupFamily,
    lockFamily,
    unlockFamilyLocally: async () => {
      const key = await getFamilyKey(user?.familyId);
      if (key) {
        setFamilyKey(key);
        setIsFamilyAuthenticated(true);
        console.log(`[AuthContext] 🔓 Family Unlocked using local key for FID: ${user?.familyId}`);
      }
    },
    switchFamily,
    syncFromDrive,
  };

  return (
    <AuthContext.Provider value={value}>
      {(!loading && (isKeyInitialized || !user)) ? children : (
        <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <p className="text-stone-500 font-medium animate-pulse">Initializing Secure Vault...</p>
        </div>
      )}
    </AuthContext.Provider>
  );
};