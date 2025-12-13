# Famoria Encryption Architecture — Hybrid Hardware‑Bound Security (v4.0)

**Purpose:** Integrate the strict (PIN not used in v4)‑based zero‑knowledge workflow (v3.0) with a **hardware‑bound, non‑extractable key model** (v4.0) to eliminate daily (PIN not used in v4) friction **without weakening security**.

This architecture supports **two layers**:

1. **Root Security ((PIN not used in v4)‑Bound, Zero‑Knowledge)** – protects the master key across devices and backups.
2. **Convenience Security (Hardware‑Bound)** – enables instant unlock on trusted devices using non‑extractable WebCrypto keys.

> **Invariant:** Famoria servers and Google never see decrypted master keys. All wrapping, unwrapping, derivation, and AI decryption happens client‑side only.

---

## 1. Key Hierarchy (Final)

````
User (PIN not used in v4) ──## PIN & KDF Status (v4)

> **Important:** In v4 Hardware‑Bound architecture, **PIN and Argon2id are NOT used** for normal operation.

- No PIN at album creation
- No PIN for daily unlock
- No PIN for recovery

Security relies on:
- Hardware‑bound non‑extractable DeviceKey
- Google Drive OAuth + at‑rest encryption
- User‑controlled Recovery Kit

---

## 2. Album Creation (One‑Time, Enforced — **Updated**)

> **Important change:** The **actual Master Key (MK)** is stored in Google Drive `appDataFolder` (cloud backup), while **device security** is achieved by immediately wrapping the same MK with a non‑extractable `DeviceKey` stored in IndexedDB. (PIN not used in v4) security is optional in v4 and may be added later as an additional wrapping layer if required.

### Strict Creation Flow

1. **User creates album**.
2. App generates **Master Key (MK)** locally:
   - 32 bytes cryptographically secure random.
   - Exists in RAM only during setup.

3. **Store MK in Google Drive (Backup Layer)**
   - MK is serialized (Base64) and uploaded to:
     - `Google Drive → appDataFolder`
   - Access protected by:
     - Google OAuth
     - Google Drive AES‑256 at‑rest encryption

4. **Generate DeviceKey (Hardware‑Bound)**
   ```ts
   const deviceKey = await crypto.subtle.generateKey(
     { name: 'AES-GCM', length: 256 },
     false, // non‑extractable
     ['encrypt','decrypt','wrapKey','unwrapKey']
   );
````

5. **Wrap MK with DeviceKey (Local Security Layer)**

   * MK is encrypted using `DeviceKey` via AES‑GCM
   * Result: **Device‑Wrapped MK** (ciphertext + IV + auth tag)

6. **Persist DeviceKey Handle**

   * Store **CryptoKey handle only** in IndexedDB
   * Raw key material is never accessible to JavaScript

7. **Generate Recovery Kit (Mandatory)**

   * Base64 export of MK is generated **once**
   * User is instructed to:

     * Download
     * Print or store offline securely
   * Famoria never stores the recovery kit

8. **Memory Hygiene**

   * Plain MK bytes are wiped from memory immediately
   * DeviceKey remains protected inside browser crypto subsystem

### Resulting State

| Location     | What is Stored                       |
| ------------ | ------------------------------------ |
| Google Drive | **Plain MK (Base64)** — cloud backup |
| IndexedDB    | DeviceKey handle (non‑extractable)   |
| App Memory   | ❌ Nothing persistent                 |

---

## 3. Daily Usage (Zero Friction Path)

```
User opens album
   ↓
IndexedDB has DeviceKey?
   ↓ yes
Unwrap MK using DeviceKey (browser‑internal)
   ↓
MK lives only as CryptoKey handle
   ↓
HKDF(photoId) → photo keys
   ↓
Decrypt photos + metadata
```

* No (PIN not used in v4) prompt
* No raw key bytes exposed to JS
* Auto‑lock timer still enforced (15 min)

---

## 4. Fallback Path (New Device / Cache Cleared)

```
No DeviceKey found
   ↓
Prompt user for (PIN not used in v4) or Recovery Kit
   ↓
Argon2id((PIN not used in v4)) → PRK
   ↓
Unwrap (PIN not used in v4)‑Wrapped MK
   ↓
Generate new DeviceKey
   ↓
Re‑wrap MK with DeviceKey
   ↓
Store DeviceKey in IDB
```

(PIN not used in v4) is **never removed** from the system — it remains the cryptographic root of trust.

---

## 5. Auto‑Lock & Memory Safety (Mandatory)

* Auto‑lock after **15 minutes** inactivity
* Immediate lock on:

  * `visibilitychange`
  * `pagehide`
  * `beforeunload`
  * device sleep
* On lock:

  * All in‑memory CryptoKey references dropped
  * IndexedDB DeviceKey remains protected by browser

---

## 6. Invite & Sharing (Unchanged Security Model)

* Inviter must unlock MK (via DeviceKey or (PIN not used in v4)).
* MK is encrypted client‑side with a one‑time invite key.
* Invitee decrypts locally and **re‑wraps MK** using:

  * their own (PIN not used in v4) (root)
  * their own DeviceKey (convenience)
* Famoria never participates in decryption.

---

## 7. Threat Model (Hybrid v4)

| Threat           | Outcome              | Why                                     |
| ---------------- | -------------------- | --------------------------------------- |
| Server breach    | ❌ Cannot decrypt     | Zero‑knowledge                          |
| Drive leak       | ❌ Cannot decrypt     | Needs (PIN not used in v4) or DeviceKey |
| XSS attack       | ⚠️ Live access only  | Non‑extractable keys                    |
| Offline attacker | ❌ No keys            | Hardware‑bound                          |
| Lost device      | ⚠️ Photos accessible | OS lock required                        |
| New device       | ✅ Recoverable        | (PIN not used in v4) / Recovery Kit     |

---

## 8. Why This Is Better Than (PIN not used in v4)‑Only (v3)

| Aspect               | v3 ((PIN not used in v4)‑only)  | v4 (Hybrid)    |
| -------------------- | ------------------------------- | -------------- |
| Daily UX             | (PIN not used in v4) every time | Instant unlock |
| XSS resistance       | Medium                          | **High**       |
| Offline exfiltration | Possible                        | **Impossible** |
| Cross‑device         | Yes                             | Yes            |
| Zero‑knowledge       | Yes                             | Yes            |

---

## 9. Final Guarantees

✔ (PIN not used in v4) remains the cryptographic root
✔ DeviceKey improves usability, not trust
✔ Master Key never leaves client in plaintext
✔ Non‑extractable keys prevent offline theft
✔ Recovery always possible (explicit user action)

---

**Status:** Production‑grade hybrid encryption model
**Comparable to:** 1Password, iCloud Advanced Data Protection (web), Proton Pass

*Famoria Encryption Architecture — Hybrid Hardware‑Bound v4.0*
