import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  error: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch or create user document in Firestore
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
          // Initialize new user with Pro plan defaults
          await setDoc(userRef, {
            ...userData,
            createdAt: new Date().toISOString(),
            plan: 'Pro',
            planLimit: 20,
            editsUsed: 0
          });
        } else {
          // Update last login
          // We can merge data but let's keep it simple
        }

        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login failed", err);
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, error }}>
      {children}
    </AuthContext.Provider>
  );
};