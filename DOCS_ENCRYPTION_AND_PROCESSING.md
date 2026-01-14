# Famoria: Encryption & Processing Architecture Guide

This document outlines the technical implementation of the End-to-End Encryption (E2EE) and parallel processing logic in Famoria. Use this as a reference for implementing the mobile version of the app.

## 1. Key Hierarchy & Security Model

Famoria uses a hierarchical key model to ensure that even if Firestore is compromised, the actual media remains unreadable.

### A. Family Master Key (FMK)
- **What**: A random 256-bit (32-byte) key generated once per family.
- **Generation**: `crypto.getRandomValues(new Uint8Array(32))`.
- **Storage**: 
    - **Local**: Stored in IndexedDB (Persistence across sessions on trusted devices).
    - **Sync/Backup**: Encrypted and stored in the user's **Google Drive AppData folder** (invisible to the user, accessible only by the Famoria app).
- **Security**: This key *never* leaves the device in an unencrypted state (except to Drive AppData). It is the source of all security.

### B. Photo-Specific Key
- **What**: Every single photo/video has its own unique 256-bit key.
- **Derivation**: Derived from the **FMK** and the **Photo ID** (UUID) using **HKDF-SHA256**.
- **Context/Salt**: We use a fixed salt like `famoria-photo-v1`.
- **Why**: This prevents "pattern leakage" across different images and limits the impact of a single key compromise.

---

## 2. Key Lifecycle (Retrieval & Sync)

The goal is to provide a "locked/unlocked" state for the Vault.

### On Secure Device Login:
1.  **Check Local Storage**: Try to retrieve FMK from local storage (IndexedDB).
2.  **Restore from Drive**: If not in local storage, prompt/auto-fetch from Google Drive AppData.
3.  **Authentication**: Once retrieved, the `AuthContext` holds the FMK in memory as a `Uint8Array`.

> [!IMPORTANT]
> For mobile (React Native/Expo), use `Expo SecureStore` or a similar encrypted local database instead of IndexedDB.

---

## 3. Encryption Process (Upload)

Uploads are handled in two phases to provide instant feedback while ensuring heavy processing happens in the background.

### Phase 1: Metadata & Thumbnail (Fast)
1.  **Generate Thumbnail**: Create a small (e.g., 400px) webp/jpeg blob.
2.  **Derive Key**: `derivePhotoKey(FMK, PhotoID)`.
3.  **Encrypt Metadata**: 
    - JSON object containing `caption`, `tags`, `location`, `date`.
    - Encrypt using **AES-GCM** with a random 12-byte IV.
4.  **Encrypt Thumbnail**: Encrypt using **AES-GCM**.
5.  **Write to Firestore**: Create the `Post` and `Photo` records with the `encryptedMetadata` and thumbnail storage path.

### Phase 2: Full Resolution Media (Background)
1.  **Encrypt Full Image**: Encrypt the original large file using the same derived Photo Key.
2.  **Upload to Storage**: Upload the large `.enc` blob to Firebase Storage.
3.  **Update Firestore**: Once done, update the Firestore record to point to the `fullResPath`.

---

## 4. Parallel Processing Utility

For multi-image posts, we use a concurrency-limited worker pattern to prevent browser/network bottlenecks.

- **Concurrency**: Default is **3** simultaneous tasks.
- **Worker Pattern**:
    ```typescript
    const workers = Array(concurrency).fill(null).map(() => processNext());
    await Promise.all(workers);
    ```
- **Recursive Processing**: Each worker finishes its task, increments a shared `currentIndex`, and calls itself again until the list is empty.

---

## 5. Decryption Process (Gallery Rendering)

1.  **Check Cache**: Always check a local "Decrypted Cache" (IndexedDB) first.
2.  **Download Blob**: If not cached, download the `.enc` blob from Firebase Storage.
3.  **Slice Data**:
    - `IV`: First 12 bytes.
    - `Ciphertext`: Bytes 12 to EOF (includes the GCM Auth Tag).
4.  **Decrypt**: `crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, Ciphertext)`.
5.    **Render**: `URL.createObjectURL(decryptedBlob)`.

---

## 6. Implementation Roadmap for Mobile (React Native/Expo)

### Cryptography Library
Use **`expo-crypto`** or **`react-native-quick-crypto`**. Standard Web Crypto APIs may need a polyfill (`react-native-get-random-values` + `webcrypto`).

### Key Storage
- Replace IndexedDB with **`expo-secure-store`** for the Family Master Key.
- For caching decrypted images, consider a local filesystem cache (private application directory).

### Parallelism
Javascript is single-threaded, but the `crypto` and `fetch` calls are offloaded to native threads. You can use a similar worker pattern or a library like `p-limit`.

### Background Tasks
Mobile has stricter background task limits. Ensure full-res uploads are registered as **Background Tasks** so they don't get killed if the user switches apps.
