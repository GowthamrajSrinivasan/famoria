# Famoria: Flutter Encryption & Processing Architecture Guide

This document defines the implementation details for End-to-End Encryption (E2EE) and parallel processing in the Famoria Flutter app. It ensures cross-platform compatibility with the web version.

## 1. Key Hierarchy & Security Model

Famoria uses a hierarchical key model. The primary security anchor is the Family Master Key (FMK).

### A. Family Master Key (FMK)
- **What**: A random 256-bit (32-byte) key generated once per family.
- **Generation**: Use a cryptographically secure random number generator (e.g., `Random.secure()`).
- **Storage**: 
    - **Local (Persistent Cache)**: Stored using [**`flutter_secure_storage`**](https://pub.dev/packages/flutter_secure_storage). This ensures the key is kept in the iOS Keychain or Android Keystore (hardware-encrypted enclave).
    - **Cloud Sync/Backup**: Stored in the user's **Google Drive AppData storage**.
- **Acquisition Logic**:
    - **Account Creator**: Generate a new FMK and save it to Google Drive AppData.
    - **Invitation Recipient**: Extract the FMK from the invitation URL and save it to Google Drive AppData.
- **Persistence Rules**: 
    - **No Inactivity Timer**: The key remains accessible as long as the user is logged in.
    - **Instant Re-entry**: On app launch, the key is automatically pulled from `flutter_secure_storage`. If missing, the app must fetch it from Google Drive AppData after OAuth 2.0 login.
    - **Seamless Experience**: Redirect users directly to the Dashboard if the key is available.

### B. Derived Keys
- **Photo-Specific Keys**: Every media item has a unique key derived from the **FMK** and its **UUID** using **HKDF-SHA256**.
- **Post Keys**: Used for metadata encryption, derived from the **FMK**.

---

## 2. Encryption Standards & Compatibility

To maintain seamless interoperability with the web app, the Flutter implementation must follow these standards.

### Data Format
All encrypted outputs must concatenate components in the following order:
`IV (12 bytes) + Ciphertext + Auth Tag (16 bytes)`

### Cryptography Library
Use the [**`cryptography`**](https://pub.dev/packages/cryptography) package:
- **Algorithm**: `AesGcm` (AES with 256-bit key).
- **Benefits**: Uses Web Cryptography API on Web and highly optimized native/SIMD code on Android/iOS.
- **Compatibility**: 100% compatible with `crypto.subtle` used in the web version.

---

## 3. Implementation Workflow

### Phase 1: Metadata & Thumbnails (Foreground)
1. **Metadata Encryption**: 
   - **Album Metadata**: Names/descriptions encrypted as a JSON blob using the `familyKey`.
   - **Post Metadata**: Captions, tags, and locations encrypted using unique `postKeys` derived from the `familyKey`.
2. **Thumbnails**: Create a small preview, encrypt using the derived photo key, and upload to Firestore/Storage.
3. **UI Updates**:
   - `AlbumGrid`, `AlbumView`, `PhotoCard`, and `PhotoLightbox` must handle client-side decryption within real-time subscription callbacks.

### Phase 2: Full-Resolution Media (Background)
1. **Background Reliability**: Use [**`workmanager`**](https://pub.dev/packages/workmanager) for Flutter.
2. **Process**:
   - Encrypt the original large file using the derived photo key.
   - Continue the upload even if the app is put in the background.
   - Update Firestore records once the upload completes.

---

## 4. Key Retrieval Flow (OAuth 2.0)

1. **User Logs In**: Standard OAuth 2.0 flow via Google.
2. **Check Drive**: Request access to `drive.appdata` scope.
3. **Fetch FMK**: If the file exists in AppData, download and store it in `flutter_secure_storage`.
4. **Local Cache**: Always prefer `flutter_secure_storage` for instant access; sync to Drive only when necessary (initial setup/invitation).

> [!IMPORTANT]
> Never store the Family Master Key in `SharedPreferences` or any non-encrypted storage. Hardware-backed security via `flutter_secure_storage` is mandatory.
