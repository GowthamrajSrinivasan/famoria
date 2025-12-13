import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ... imports

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  googleAccessToken: string | null;
  refreshDriveToken: () => Promise<string | null>;

  // Keyring Interface
  albumKeys: Record<string, Uint8Array>;
  unlockAlbum: (albumId: string, key: Uint8Array) => void;
  lockAlbum: (albumId: string) => void;
  getAlbumKey: (albumId: string) => Uint8Array | null;
  lockAll: () => void;
  autoUnlockAlbum: (albumId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => { },
  signOut: async () => { },
  error: null,
  googleAccessToken: null,
  refreshDriveToken: async () => null,

  albumKeys: {},
  unlockAlbum: () => { },
  lockAlbum: () => { },
  getAlbumKey: () => null,
  lockAll: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  // Keyring State
  const [albumKeys, setAlbumKeys] = useState<Record<string, Uint8Array>>({});
  const albumKeysRef = React.useRef(albumKeys);

  useEffect(() => {
    albumKeysRef.current = albumKeys;
  }, [albumKeys]);

  const unlockAlbum = async (albumId: string, key: Uint8Array) => {
    setAlbumKeys(prev => ({ ...prev, [albumId]: key }));

    // Broadcast to other tabs
    try {
      const { broadcastUnlock } = await import('@/lib/crypto/unlock');
      broadcastUnlock(albumId, key);
    } catch (e) {
      console.error("Failed to broadcast unlock", e);
    }
  };

  const lockAlbum = (albumId: string) => {
    setAlbumKeys(prev => {
      const newKeys = { ...prev };
      delete newKeys[albumId];
      return newKeys;
    });

    // Clear decrypted cache for security
    import('../services/cacheService').then(({ cacheService }) => {
      cacheService.clearAlbumCache(albumId).catch(console.error);
    });
  };

  const getAlbumKey = (albumId: string) => albumKeys[albumId] || null;

  const lockAll = () => {
    setAlbumKeys({});

    // Clear all decrypted cache for security
    import('../services/cacheService').then(({ cacheService }) => {
      cacheService.clearAllCache().catch(console.error);
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // ... existing user fetching logic ...
      if (firebaseUser) {
        try {
          // ... fetch user ...
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
        lockAll(); // Local clear
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auto-unlock all albums when Google token becomes available after sign-in
  useEffect(() => {
    if (user && googleAccessToken) {
      console.log('[AuthContext] Google token available, triggering auto-unlock for all albums');
      autoUnlockAllAlbums(user.id);
    }
  }, [user, googleAccessToken]);


  // Sync Master Key across tabs
  useEffect(() => {
    if (!user) return;

    import('@/lib/crypto/unlock').then(({ setupKeySync }) => {
      const cleanup = setupKeySync({
        onUnlock: (albumId, key) => {
          setAlbumKeys(prev => ({ ...prev, [albumId]: key }));
        },
        onLockAll: () => {
          setAlbumKeys({});
        },
        getKeys: () => albumKeysRef.current
      });
      return cleanup;
    });
  }, [user]); // Run only when user session starts/changes

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
      // Broadcast lock before signing out
      const { broadcastLock } = await import('@/lib/crypto/unlock');
      broadcastLock();

      await firebaseSignOut(auth);
      setGoogleAccessToken(null);
      lockAll();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  // V4: Auto-Unlock from IDB or Drive
  const autoUnlockAlbum = async (albumId: string): Promise<boolean> => {
    // 1. Check if already unlocked
    if (albumKeysRef.current[albumId]) {
      console.log(`[AuthContext] Album ${albumId} already unlocked`);
      return true;
    }

    // 2. Try DeviceKey path (fast path - hardware-bound security)
    try {
      console.log(`[AuthContext] Checking IndexedDB for DeviceKey: ${albumId}`);
      const { getDeviceKey } = await import('@/lib/crypto/keyStore');
      const { unwrapMasterKeyWithDevice } = await import('@/lib/crypto/deviceKey');

      const deviceKey = await getDeviceKey(albumId);
      if (deviceKey) {
        console.log(`[AuthContext] DeviceKey found in IndexedDB for ${albumId}`);

        // 3. We have a Device Key (Authorized Device). Fetch Encryption Blob from Drive.
        let token = googleAccessToken;
        if (!token) {
          console.log(`[AuthContext] No Google token, attempting refresh...`);
          token = await refreshDriveToken();
        }
        if (!token) {
          console.log(`[AuthContext] Failed to get Google Drive token`);
          return false;
        }

        // 4. Fetch Blob
        console.log(`[AuthContext] Fetching Drive blob for album ${albumId}`);
        const { fetchDriveBlob } = await import('@/services/driveService');
        const filename = `famoria_album_${albumId}.key`;
        const blobDef = await fetchDriveBlob(filename, token);

        if (!blobDef) {
          console.log(`[AuthContext] No Drive blob found for ${filename}`);
          // Fall through to Drive fallback
        } else {
          console.log(`[AuthContext] Drive blob fetched successfully`);

          // 5. Unwrap
          console.log(`[AuthContext] Unwrapping Master Key using DeviceKey...`);
          const masterKey = await unwrapMasterKeyWithDevice(
            albumId,
            blobDef.encryptedMasterKey,
            blobDef.iv,
            blobDef.authTag
          );

          if (masterKey) {
            console.log(`[AuthContext] Master Key unwrapped successfully, unlocking album`);
            unlockAlbum(albumId, masterKey);
            return true;
          } else {
            console.log(`[AuthContext] Failed to unwrap Master Key`);
          }
        }
      } else {
        console.log(`[AuthContext] No DeviceKey found in IndexedDB for ${albumId}`);
      }
    } catch (e) {
      console.error("[AuthContext] DeviceKey path failed:", e);
    }

    // 3. Drive Fallback Path - Fetch plain MasterKey directly
    console.log(`[AuthContext] Attempting Drive fallback to fetch plain MasterKey...`);
    try {
      let token = googleAccessToken;
      if (!token) {
        console.log(`[AuthContext] No Google token for Drive fallback, attempting refresh...`);
        token = await refreshDriveToken();
      }
      if (!token) {
        console.log(`[AuthContext] Failed to get Google Drive token for fallback`);
        return false;
      }

      const { fetchDriveBlob } = await import('@/services/driveService');
      const { fromBase64 } = await import('@/lib/crypto/masterKey');

      // Try to fetch plain MasterKey (new filename pattern)
      const plainKeyFilename = `famoria_album_${albumId}_master.key`;
      console.log(`[AuthContext] Fetching plain MasterKey from Drive: ${plainKeyFilename}`);

      const plainKeyData = await fetchDriveBlob(plainKeyFilename, token);

      if (plainKeyData && plainKeyData.masterKeyBase64) {
        console.log(`[AuthContext] Plain MasterKey found in Drive, decoding...`);
        const masterKey = fromBase64(plainKeyData.masterKeyBase64);
        console.log(`[AuthContext] MasterKey decoded successfully, unlocking album`);
        unlockAlbum(albumId, masterKey);
        return true;
      } else {
        console.log(`[AuthContext] No plain MasterKey found in Drive for ${plainKeyFilename}`);
      }
    } catch (e) {
      console.error("[AuthContext] Drive fallback failed:", e);
    }

    return false;
  };

  // Auto-unlock all user albums after sign-in
  const autoUnlockAllAlbums = async (userId: string) => {
    try {
      console.log('[AuthContext] Auto-unlocking all albums for user:', userId);
      const { subscribeToAlbums } = await import('../services/albumService');

      // Subscribe to user albums and attempt unlock
      const unsubscribe = subscribeToAlbums(userId, async (albums) => {
        console.log(`[AuthContext] Found ${albums.length} albums, attempting auto-unlock...`);

        // Attempt to unlock each album
        const unlockPromises = albums.map(album =>
          autoUnlockAlbum(album.id).catch(err => {
            console.warn(`[AuthContext] Failed to auto-unlock album ${album.id}:`, err);
            return false;
          })
        );

        const results = await Promise.all(unlockPromises);
        const successCount = results.filter(Boolean).length;
        console.log(`[AuthContext] Auto-unlocked ${successCount}/${albums.length} albums`);

        // Unsubscribe after first attempt
        unsubscribe();
      });
    } catch (error) {
      console.error('[AuthContext] Error during auto-unlock all:', error);
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
    albumKeys,
    unlockAlbum,
    lockAlbum,
    getAlbumKey,
    lockAll,
    autoUnlockAlbum // Export this
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};