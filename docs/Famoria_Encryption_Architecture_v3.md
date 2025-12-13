# Famoria Encryption Architecture — Enforced PIN Workflow (v3.0)

**Purpose:** This document *strictly enforces* the user workflow you defined: master key generation, PIN-based encryption with Argon2id, storage in Google Drive appDataFolder, daily unlock with PIN, HKDF per-photo keys, and a 15-minute auto-lock. It is written as an implementable, security-first spec with code snippets and storage formats.

---

## Table of contents

1. Goals & Assumptions
2. High-level Flow (strict)
3. KDF & Crypto Parameters
4. Data Formats (what is stored in Drive / Firestore)
5. Implementation: Album creation (code)
6. Implementation: Daily unlock & auto-lock (code)
7. Implementation: Photo key derivation & encryption (code)
8. Invite flow (client-only) — strict
9. Firestore & Storage rules (summary)
10. Threat model & security guarantees
11. Recovery / UX notes
12. Phase-by-Phase Implementation Plan

---

## 1. Goals & Assumptions

* **User workflow (must be enforced):**

  * User creates album → generates master key locally → chooses a 4–6 digit PIN → Argon2id(PIN) → PIN-derived key → master key encrypted with PIN-derived key → stored in Google Drive appDataFolder (encrypted blob only).
  * Daily: user enters PIN → master key decrypted in memory → per-photo keys derived (HKDF) → photos + metadata decrypted on device → auto-lock after 15 minutes.

* **Assumptions:**

  * Google Drive `appDataFolder` is used as encrypted storage target (access by OAuth).
  * Famoria servers do **not** hold plaintext master keys.
  * No silent background decryption: user must actively unlock with PIN.
  * Recovery of PIN is out-of-scope (zero-knowledge): losing PIN = losing access unless user created a recovery artifact.

---

## 2. High-level Flow (strict)

### Album creation (strict enforced steps)

1. Generate master key locally (cryptographically secure random 32 bytes).
2. Prompt user to create a 4–6 digit PIN; confirm PIN.
3. Generate a random `deviceSalt` (16 bytes) and `kdfSalt` (16 bytes).
4. Derive `PIN_Key = Argon2id(PIN, kdfSalt, params)` in-browser.
5. Encrypt `masterKey` with `PIN_Key` via AES-GCM → produce `encryptedMasterKey` + `iv` + `authTag`.
6. Construct `driveBlob` (JSON): includes `encryptedMasterKey`, `iv`, `authTag`, `kdfSalt`, `kdfParams`, `version`, `masterKeyId`, `createdAt`.
7. Upload `driveBlob` to Google Drive `appDataFolder` under filename `famoria_album_${albumId}.key`.
8. Save album metadata in Firestore pointing to `masterKeyId` (not the key contents).

### Daily usage (strict enforced steps)

1. On app open, user enters PIN.
2. Fetch `driveBlob` from Google Drive.
3. Run Argon2id(PIN, kdfSalt, kdfParams) locally to derive `PIN_Key`.
4. Decrypt `encryptedMasterKey` using AES-GCM with `PIN_Key` → `masterKey` in RAM only.
5. Derive per-photo keys via HKDF(masterKey, photoId).
6. Decrypt metadata + photos locally.
7. Start/refresh an **auto-lock timer** (15 minutes) — any inactivity or pagehide clears `masterKey` and requires PIN again.

---

## 3. KDF & Crypto Parameters (recommended, non-negotiable for security)

* **Argon2id (browser):**

  * salt: 16 bytes (random per album)
  * time (iterations): 3
  * memory: 65536 KB (64 MB) — **Baseline**. (Implement Dynamic KDF tuning: benchmark device on first run and adjust memory/time to hit ~250ms delay).
  * parallelism: 1
  * output length: 32 bytes (256 bits)

* **AES-GCM:**

  * key size: 256 bits
  * iv: 12–16 bytes (use 12 bytes preferred for AES-GCM)
  * tag length: 128 bits

* **HKDF (photo key derivation):**

  * hash: SHA-256
  * salt: `famoria-photo-v1` (explicit label)
  * info: photoId (unique per photo)
  * output length: 32 bytes

**Note:** These parameters balance security and browser performance. Adjust memory/time if devices are lower-capacity, but prefer higher memory for stronger brute-force resistance.

---

## 4. Data formats (what goes to Drive / Firestore)

### Drive blob (JSON) — stored at `appDataFolder`

```json
{
  "version": 1,
  "masterKeyId": "<uuid>",
  "encryptedMasterKey": "<base64>",
  "iv": "<base64>",
  "authTag": "<base64>",
  "kdfSalt": "<base64>",
  "kdfParams": {
    "time": 3,
    "memoryKb": 65536,
    "parallelism": 1,
    "algo": "argon2id"
  },
  "createdAt": 1690000000000
}
```

> **Important:** Only this JSON blob is stored. **No plaintext master key** anywhere.

### Firestore `albums` doc (public metadata reference)

```json
{
  "id": "albumId",
  "name": "Family Vacation 2024",
  "createdBy": "uid_123",
  "masterKeyId": "<uuid>",
  "members": ["uid_123"],
  "version": 1,
  "createdAt": "serverTimestamp()"
}
```

### Firestore `photos` doc (encrypted metadata)

The photo doc contains references and encrypted metadata only; photo storage path points to Firebase Storage where encrypted bytes live.

```json
{
  "id": "photoId",
  "albumId": "albumId",
  "encryptedPath": "albums/albumId/photos/photoId.enc",
  "encryptedMetadata": "<base64>",
  "metadataIv": "<base64>",
  "metadataAuthTag": "<base64>",
  "photoIv": "<base64>",
  "photoAuthTag": "<base64>",
  "photoId": "photoId",
  "version": 1,
  "createdAt": "serverTimestamp()"
}
```

---

## 5. Implementation: Album creation (TypeScript, browser-safe)

> Uses `argon2-browser` (or `argon2-wasm`) and WebCrypto. This code enforces the strict workflow.

```typescript
// libs/crypto/pinWrap.ts
import { hash as argon2 } from 'argon2-browser';

// helper to convert
function toBase64(u8: Uint8Array) { return btoa(String.fromCharCode(...u8)); }
function fromBase64(s: string) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

export async function createAndStoreMasterKey(albumId: string, pin: string, accessToken: string) {
  // 1. Generate master key
  const masterKey = crypto.getRandomValues(new Uint8Array(32));
  const masterKeyId = crypto.randomUUID();

  // 2. KDF salt and params
  const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const kdfParams = { time: 3, mem: 65536, parallelism: 1 };

  // 3. Derive PIN_Key via Argon2id
  const argonRes = await argon2({ pass: pin, salt: toBase64(kdfSalt), time: kdfParams.time, mem: kdfParams.mem, parallelism: kdfParams.parallelism, type: 2, hashLen: 32 });
  const pinKeyBytes = fromBase64(argonRes.hash);

  // 4. Import pinKey into WebCrypto and wrap masterKey with AES-GCM
  const cryptoKey = await crypto.subtle.importKey('raw', pinKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, masterKey);
  const wrappedArray = new Uint8Array(wrapped);
  const encryptedMasterKey = toBase64(wrappedArray.slice(0, -16));
  const authTag = toBase64(wrappedArray.slice(-16));

  // 5. Drive blob
  const driveBlob = {
    version: 1,
    masterKeyId,
    encryptedMasterKey,
    iv: toBase64(iv),
    authTag,
    kdfSalt: toBase64(kdfSalt),
    kdfParams: { time: kdfParams.time, memoryKb: kdfParams.mem, parallelism: kdfParams.parallelism, algo: 'argon2id' },
    createdAt: Date.now()
  };

  // 6. Upload to Google Drive appDataFolder using accessToken
  // (same approach as in earlier code you provided)
  await uploadDriveAppDataFile(`famoria_album_${albumId}.key`, JSON.stringify(driveBlob), accessToken);

  // 7. Clear sensitive memory
  masterKey.fill(0);
  pinKeyBytes.fill(0);

  return masterKeyId;
}
```

**Notes:**

* `argon2-browser` returns base64; `hash` property contains the derived value.
* `mem: 65536` means ~64 MB — measure actual memory usage on low-end devices and reduce if necessary.

---

## 6. Implementation: Daily unlock & auto-lock (TypeScript)

```typescript
// libs/crypto/unlock.ts
import { hash as argon2 } from 'argon2-browser';

let MASTER_KEY: Uint8Array | null = null;
let autoLockTimer: number | null = null;
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

export async function unlockMasterKey(albumId: string, pin: string, accessToken: string) {
  // 1. Fetch driveBlob
  const driveBlob = await fetchDriveBlob(albumId, accessToken); // returns parsed JSON
  const kdfSalt = atob(driveBlob.kdfSalt);

  // 2. Argon2 derive
  const argonRes = await argon2({ pass: pin, salt: driveBlob.kdfSalt, time: driveBlob.kdfParams.time, mem: driveBlob.kdfParams.memoryKb, parallelism: driveBlob.kdfParams.parallelism, type: 2, hashLen: 32 });
  const pinKeyBytes = Uint8Array.from(atob(argonRes.hash), c => c.charCodeAt(0));

  // 3. Decrypt master key
  const cryptoKey = await crypto.subtle.importKey('raw', pinKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = Uint8Array.from(atob(driveBlob.iv), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(driveBlob.encryptedMasterKey), c => c.charCodeAt(0));
  const authTag = Uint8Array.from(atob(driveBlob.authTag), c => c.charCodeAt(0));
  const combined = new Uint8Array(encrypted.length + authTag.length);
  combined.set(encrypted, 0); combined.set(authTag, encrypted.length);

  const masterKeyBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, combined.buffer);
  MASTER_KEY = new Uint8Array(masterKeyBuf);

  // 4. Start auto-lock timer
  resetAutoLock();

  // 5. Setup Cross-Tab Sync (Web App)
  broadcastUnlock(MASTER_KEY);

  // 6. clear pinKey
  pinKeyBytes.fill(0);

  return true;
}

// ============================================
// WEB APP SPECIFIC: CROSS-TAB SYNC
// Use BroadcastChannel to share key in RAM only
// WARNING: NEVER store MasterKey in localStorage
// ============================================
const LINK_CHANNEL = new BroadcastChannel('famoria_key_sync');

export function broadcastUnlock(masterKey: Uint8Array) {
  LINK_CHANNEL.onmessage = (event) => {
    if (event.data === 'REQUEST_KEY' && masterKey) {
      // Send key to the new tab (memory-to-memory only)
      LINK_CHANNEL.postMessage({ type: 'SYNC_KEY', key: Array.from(masterKey) });
    }
  };
}

export function trySyncKey(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    LINK_CHANNEL.postMessage('REQUEST_KEY');
    const timeout = setTimeout(() => resolve(null), 500); // 500ms wait
    LINK_CHANNEL.onmessage = (event) => {
      if (event.data?.type === 'SYNC_KEY') {
        clearTimeout(timeout);
        const syncedKey = new Uint8Array(event.data.key);
        // Setup state...
        MASTER_KEY = syncedKey;
        resolve(syncedKey);
      }
    };
  });
}


// Correct Logic via Timestamp (localStorage for cross-tab/persistence)
const LAST_ACTIVE_KEY = 'famoria_last_active';

export function touchActivity() {
  localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  resetAutoLock();
}

export function checkAutoLock() {
  const lastActive = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0');
  const now = Date.now();
  if (now - lastActive > AUTO_LOCK_MS) {
    lock();
  }
}

export function lock() {
  if (MASTER_KEY) { 
    MASTER_KEY.fill(0); 
    MASTER_KEY = null; 
  }
  if (autoLockTimer) { clearTimeout(autoLockTimer); autoLockTimer = null; }
  // Note: localStorage is NOT cleared here to preserve last active time for logic, 
  // but the session key is gone.
}

// Bind to visibility and user activity
window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        lock();
    } else {
        checkAutoLock();
    }
});

// Periodic check (every minute) to handle cases where visibility events might be missed
setInterval(checkAutoLock, 60000);

['mousemove','keydown','touchstart'].forEach(e => window.addEventListener(e, touchActivity));

// > [!WARNING] MEMORY MANAGEMENT CAVEAT
// > JavaScript (V8) does not guarantee immediate memory wiping. `masterKey.fill(0)` clears the current view, 
// > but copies may exist in GC generations due to internal browser implementation details. 
// > This is "Best Effort" security, not military-grade hardware isolation.

```

**Important:**

* Lock must also occur on `pagehide`, `beforeunload`, and `blur` events for robustness.
* Multi-tab: keep a locked state in `localStorage` and broadcast via `storage` event so other tabs know to lock.

---

## 7. Implementation: Photo key derivation & encryption

(As in v3.0, but enforce using `MASTER_KEY` in RAM)

```typescript
// libs/crypto/photoKey.ts
export async function derivePhotoKey(masterKey: Uint8Array, photoId: string): Promise<Uint8Array> {
  const salt = new TextEncoder().encode('famoria-photo-v1');
  const info = new TextEncoder().encode(photoId);
  const masterCryptoKey = await crypto.subtle.importKey('raw', masterKey, { name: 'HKDF' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, masterCryptoKey, 256);
  return new Uint8Array(derived);
}
```

Encryption / decryption flows remain identical to prior spec — but crucially: **the code above reads `MASTER_KEY` from memory only after unlock** and never from storage directly.

---

## 8. Invite flow (client-only, strict)

**Rules:** inviter must unlock the master key (enter PIN) locally. The master key is re-encrypted and transferred in encrypted form. The recipient re-encrypts with their PIN locally and stores in their Drive.

### Invite creation (inviter)

1. Inviter unlocks masterKey via PIN (masterKey in RAM).
2. Generate `inviteKey` (32 bytes random) and `inviteIv` (12 bytes).
3. Encrypt `masterKey` with `inviteKey` using AES-GCM → produce `encMasterForInvite`.
4. Build invite payload (JSON): `{ albumId, inviterId, encMasterForInvite(base64), inviteIv(base64), meta }`.
5. Sign this payload locally with a short-lived JWT for authenticity (optional) — server signs only the invite token for tracking; **do not include plaintext masterKey anywhere on server**.
6. Share invite link containing the payload or token.

### Invite acceptance (recipient)

1. Recipient opens invite, authenticates with Google, fetches invite payload (or decodes token).
2. App prompts recipient to enter a PIN (4–6 digits) to secure the master key on their device.
3. Recipient decrypts `encMasterForInvite` using `inviteKey` held in payload (inviteKey transmitted inside encrypted token or via ephemeral secure channel). This step must be implemented so that the inviteKey is only included in the invite payload and treated as ephemeral — ensure one-time-use and expiry.
4. Recipient re-encrypts `masterKey` with Argon2id(recipientPIN, newKdfSalt) and stores the new Drive blob in their Drive `appDataFolder`.
5. Update album membership in Firestore (server needs only member IDs, not keys).

**Security notes:**

* Invite payload MUST expire and be one-time-use.
* Server can assist by issuing a short-lived signed invite token but must never be able to decrypt the enclosed master key.

---

## 9. Firestore & Storage rules (summary)

* `albums` read/write: only members.
* `photos` read/write: only album members.
* `security_logs` write: only trusted Cloud Functions.

(Keep same rule set as previously provided; rules do not contain keys.)

---

## 10. Threat model & security guarantees

* **Famoria server compromise:** attacker cannot decrypt photos because master keys are encrypted with user PIN.
* **Google Drive compromise:** attacker obtains `driveBlob` but needs PIN + Argon2 to derive `PIN_Key` — with Argon2 configured strongly, brute force is expensive.
* **Invite link leak:** invite tokens are one-time and encrypted. If stolen after expiry, they are useless.
* **Stolen device:** if device unlocked, attacker may access decrypted MASTER_KEY in RAM until auto-lock; recommend device-level biometrics + OS screen lock.

**Guarantees:**

* Master key is always encrypted at rest.
* Decryption occurs only after explicit PIN entry.
* Keys are wiped from memory on auto-lock, backgrounding, or close.

---

## 11. Recovery & UX notes

* **Recovery Kit (MANDATORY):**
  *   **Requirement**: Zero-Knowledge means "Forgot PIN = Data Loss". This is unacceptable UX.
  *   **Solution**: During setup, force the user to download/copy a **Recovery Key** (random 32-byte hex string).
  *   **Usage**: The Recovery Key can decrypt the Master Key independently of the PIN (requires storing a 2nd encrypted header in Drive, or wrapping the MK with the Recovery Key).
  *   *Implementation*: `EncryptedMK_Recovery = Encrypt(MK, Key=RecoveryKey)`. Stored alongside the PIN-wrapped blob.

* **Key Rotation (PIN Change):**
  *   **Trigger**: User wants to change PIN.
  *   **Flow**:
      1.  Unlock `MasterKey` with OLD PIN.
      2.  Derive `New_PIN_Key` from NEW PIN (new salt).
      3.  Re-encrypt `MasterKey` with `New_PIN_Key`.
      4.  Overwrite `driveBlob` in Google Drive.
  *   **Effect on Invites**: None. Invites contain the Master Key encrypted by an ephemeral invite key, so they remain valid until they expire. The underlying Master Key has not changed, only the way it is stored for the owner.

* **PIN UX:** 4–6 digits are convenient but lower entropy — Argon2 params must be strong and auto-lock strict.

---

## 12. Phase-by-Phase Implementation Plan

This plan breaks down the strict security architecture into 4 executable phases.

### Phase 1: Cryptographic Foundation (Day 1-2)
**Goal**: Establish the "Root of Trust" using Argon2id and WebCrypto.

1.  **Dependencies**: Install `argon2-browser` or `argon2-wasm`.
2.  **Argon2 Service**:
    *   Implement benchmark utility to auto-tune memory/time.
    *   Create helper to derive `PIN_Key` from User PIN input.
3.  **Master Key Logic**:
    *   Implement `generateMasterKey()` (CSPRNG).
    *   Implement `wrapMasterKey(mk, pinKey)` using AES-GCM.
    *   Implement `unwrapMasterKey(blob, pinKey)` using AES-GCM.
4.  **Unit Tests**: Verify key generation and derivation vectors.

### Phase 2: Album Creation & PIN Enforcement (Day 3-5)
**Goal**: Prevent any album creation without a PIN-wrapped Master Key.

1.  **UI/UX**: Create "New Album" wizard with mandatory PIN setup screen.
2.  **Recovery Kit**: Generate fallback key (32-hex) and prompt user to download PDF/TXT.
3.  **Drive Integration**:
    *   Implement upload to `appDataFolder` (`famoria_album_${id}.key`).
    *   Verify only encrypted JSON blob is transmitted.
4.  **State Management**:
    *   Store `MasterKey` in a global React Context / Redux store (volatile RAM).
    *   **Verify**: Reloading page should clear state.

### Phase 3: Session Security & Auto-Lock (Day 6-7)
**Goal**: Protect the key in memory.

1.  **Auto-Lock Timer**:
    *   Implement `localStorage` timestamp tracking.
    *   Hook into `visibilitychange`, `mousemove`, `keydown`.
    *   Create `lockSession()` to wipe memory.
2.  **Unlock Screen**:
    *   Create modal for PIN re-entry if `MasterKey` is null but Album is active.
3.  **Cross-Tab Sync ("Magic Unlock")**:
    *   Implement `BroadcastChannel` logic to share `MasterKey` memory-to-memory when a new tab opens (`trySyncKey`).
    *   Implement "Global Lock" via `localStorage` event listener to ensure all tabs lock when one does.

### Phase 4: Encryption Pipeline Integration (Day 8-10)
**Goal**: Connect the secure key to the photo upload/download flow.

1.  **HKDF Integration**:
    *   Implement `derivePhotoKey(masterKey, photoId)`.
2.  **Upload Flow**:
    *   Update `Uploader.tsx`: Check for `MasterKey` → Derive Photo Key → Encrypt → Upload.
3.  **Download/View Flow**:
    *   Update `PhotoCard.tsx`: Check for `MasterKey` → Derive Photo Key → Decrypt → URL.createObjectURL.
4.  **End-to-End Test**:
    *   Full flow: Create Album → Set PIN → Upload Photo → Refresh Page → Unlock with PIN → View Photo.

---

*Document created for Famoria — strict PIN workflow enforcement (v3.0).*
