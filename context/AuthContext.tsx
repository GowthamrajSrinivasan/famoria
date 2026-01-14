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
  setupFamily: () => Promise<void>;
  lockFamily: () => Promise<void>;
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
  setupFamily: async () => { },
  lockFamily: async () => { },
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
              editsUsed: 0
            });
          }
          setUser(userData);
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
        return;
      }

      console.log('[AuthContext] Initializing Family Key...');

      // 1. Check Local IDB
      let key = await getFamilyKey();

      // 2. If missing, try to restore from Drive (if token available)
      if (!key && googleAccessToken) {
        console.log('[AuthContext] Local key missing, checking Drive...');
        key = await familyService.restoreKeyFromDrive(googleAccessToken);
        if (key) {
          console.log('[AuthContext] Key restored from Drive!');
        }
      }

      if (key) {
        setFamilyKey(key);
        setIsFamilyAuthenticated(true);
        console.log('[AuthContext] Family Authentication Successful');

        // Verify IDB persistence (Double Check)
        try {
          const inIdb = await getFamilyKey();
          if (!inIdb) {
            console.log('[AuthContext] Key in memory but missing from IDB. Saving...');
            await saveFamilyKey(key);
          }
        } catch (e) {
          console.error('[AuthContext] Failed to verify IDB persistence', e);
        }
      } else {
        console.log('[AuthContext] No Family Key found. User needs to Setup or Recover.');
        setIsFamilyAuthenticated(false);
      }
    };

    initFamilyKey();
  }, [user, googleAccessToken]);

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

    setFamilyKey(key);
    setIsFamilyAuthenticated(true);
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
    setupFamily,
    lockFamily
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};