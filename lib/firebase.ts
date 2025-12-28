import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Using environment variables for configuration.
// In Vite, client-side variables must start with VITE_
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Validate required environment variables
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(
  varName => !import.meta.env[varName]
);

if (missingVars.length > 0) {
  const errorMsg = `
🔥 Firebase Configuration Error!

Missing environment variables:
${missingVars.map(v => `  - ${v}`).join('\n')}

To fix this:
1. Copy .env.example to .env
2. Add your Firebase configuration values
3. Restart the dev server

See DEPLOYMENT_SETUP.md for details.
  `;
  console.error(errorMsg);
  throw new Error('Missing Firebase environment variables. Check the console for details.');
}

// Debug: Log config to verify env vars are loading
console.log('Firebase Config:', {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? '✓ Loaded' : '✗ Missing'
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with modern cache settings (replaces deprecated enableIndexedDbPersistence)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata');

// Debug: Verify services initialized
console.log('Firebase Services:', {
  auth: auth ? '✓ Initialized' : '✗ Failed',
  db: db ? '✓ Initialized with persistent cache' : '✗ Failed',
  storage: storage ? '✓ Initialized' : '✗ Failed'
});