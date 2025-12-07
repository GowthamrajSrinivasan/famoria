# Cryptographic Policy

## Overview

This document defines the cryptographic standards and algorithms used in Famoria's encryption implementation.

---

## Cryptographic Algorithms

### Symmetric Encryption

**Algorithm:** AES-256-GCM (Galois/Counter Mode)

**Parameters:**
- Key Size: 256 bits (32 bytes)
- IV Size: 96 bits (12 bytes) - randomly generated per operation
- Authentication Tag: 128 bits (16 bytes)
- Mode: GCM (provides AEAD - Authenticated Encryption with Associated Data)

**Justification:**
- NIST approved (FIPS 197)
- Hardware-accelerated on modern devices
- Provides both confidentiality and integrity
- No known practical attacks

**Usage:**
- Photo encryption
- Thumbnail encryption
- Metadata encryption
- Album key encryption

**Implementation:**
```typescript
// Web Crypto API
crypto.subtle.encrypt(
  {
    name: 'AES-GCM',
    iv: randomIV,      // 12 bytes, unique per operation
    tagLength: 128     // 16 bytes auth tag
  },
  key,                 // 256-bit AES key
  plaintext
);
```

---

### Key Derivation

**Algorithm:** Argon2id

**Parameters:**
- Memory: 64 MB (65536 KB)
- Iterations: 3
- Parallelism: 4 threads
- Salt: 16 bytes (128 bits) - randomly generated
- Output: 32 bytes (256 bits)

**Justification:**
- OWASP recommended
- Winner of Password Hashing Competition (2015)
- Resistant to GPU/ASIC attacks
- Hybrid approach (Argon2i + Argon2d)
- Memory-hard function

**Usage:**
- Master key derivation from passphrase
- Private album key derivation

**Implementation:**
```typescript
import { argon2id } from '@noble/hashes/argon2';

const derived = argon2id(
  password,
  salt,
  {
    m: 65536,    // 64 MB
    t: 3,        // 3 iterations
    p: 4,        // 4 threads
  }
);
```

**Security Notes:**
- ⚠️ Never reduce memory parameter (weakens security)
- ⚠️ Salt must be unique per user
- ⚠️ Store salt securely (not secret, but required for derivation)

---

### Asymmetric Encryption

**Algorithm:** RSA-OAEP-4096

**Parameters:**
- Modulus: 4096 bits
- Public Exponent: 65537 (0x010001)
- Padding: OAEP with SHA-256
- Hash: SHA-256

**Justification:**
- Industry standard for key encapsulation
- 4096 bits provides long-term security
- OAEP prevents padding oracle attacks
- Compatible with all platforms

**Usage:**
- Family album key encryption
- Key wrapping for sharing
- Recovery key encryption

**Implementation:**
```typescript
crypto.subtle.generateKey(
  {
    name: 'RSA-OAEP',
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['encrypt', 'decrypt']
);
```

**Future:** Transition to X25519 for better performance (post-launch)

---

### Key Derivation Function (HKDF)

**Algorithm:** HKDF-SHA256

**Parameters:**
- Hash: SHA-256
- Salt: 16 bytes (unique per album)
- Info: Context string (e.g., "album:private:uuid")
- Output: 32 bytes (256 bits)

**Justification:**
- RFC 5869 standard
- Cryptographically strong key derivation
- Suitable for deriving multiple keys from single master key

**Usage:**
- Deriving Private Album keys from master key
- Key hierarchy construction

**Implementation:**
```typescript
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const albumKey = hkdf(
  sha256,
  masterKey,
  salt,
  info,
  32  // 256-bit output
);
```

---

### Hashing

**Algorithm:** SHA-256 / SHA-512

**Usage:**
- SHA-256: General-purpose hashing, integrity checks
- SHA-512: Recovery codes, high-security scenarios

**Justification:**
- NIST approved (FIPS 180-4)
- No known collision attacks
- Hardware-accelerated

---

### HMAC

**Algorithm:** HMAC-SHA256

**Parameters:**
- Hash: SHA-256
- Key Size: 256 bits

**Usage:**
- Audit log integrity
- API authentication (future)
- Message authentication

---

### Random Number Generation

**Source:** Web Crypto API `crypto.getRandomValues()`

**Fallback:** Platform-specific CSPRNG
- iOS: SecRandomCopyBytes
- Android: SecureRandom
- Web: crypto.getRandomValues()

**Justification:**
- Cryptographically Secure Pseudo-Random Number Generator (CSPRNG)
- Guaranteed by platform
- No custom RNG (dangerous)

**Usage:**
- IV generation
- Salt generation
- Key generation
- Nonce generation

**Implementation:**
```typescript
import { randomBytes } from '@noble/hashes/utils';

const iv = randomBytes(12);        // For AES-GCM
const salt = randomBytes(16);      // For Argon2id
const recoveryCode = randomBytes(32);
```

**Security Rules:**
- ✅ ALWAYS use crypto.getRandomValues() or platform CSPRNG
- ❌ NEVER use Math.random()
- ❌ NEVER use timestamp-based RNG
- ❌ NEVER reuse IVs or salts

---

## Key Management

### Key Hierarchy

```
Device Hardware Security Module (Secure Enclave / Keystore)
    ├── Master Key Encryption Key (KEK)
    │   └── Encrypts user's master key
    │
    ├── User RSA Private Key (4096-bit)
    │   └── Decrypts Family Album keys
    │
    └── Biometric-Protected Keys
        └── Quick unlock keys
```

### Key Storage

**Family Albums:**
- Album Key: Random AES-256 key
- Storage: Encrypted with user's RSA public key
- Location: Firestore `albumKeys/{albumId}_{userId}`
- Shareable: Yes (re-encrypted for each member)

**Private Albums:**
- Album Key: Derived via HKDF from master key
- Storage: NEVER stored (derived on-demand)
- Location: Salt stored in Firestore `albums/{albumId}.salt`
- Shareable: No

**Master Key:**
- Derivation: Argon2id from user passphrase
- Storage: Encrypted with hardware-backed KEK
- Location: Device secure storage only
- Backup: Recovery methods only

---

## Security Requirements

### Mandatory Checks

Before ANY crypto operation:

1. **IV Uniqueness**
   ```typescript
   // ✅ CORRECT: Generate new IV every time
   const iv = randomBytes(12);

   // ❌ WRONG: Reusing IV
   const iv = cachedIV; // NEVER DO THIS
   ```

2. **Key Validation**
   ```typescript
   // Verify key is correct type and size
   if (key.algorithm.name !== 'AES-GCM') throw new Error();
   if (key.algorithm.length !== 256) throw new Error();
   ```

3. **Memory Wiping**
   ```typescript
   // After crypto operation, wipe sensitive data
   function wipeMemory(data: Uint8Array) {
     for (let i = 0; i < data.length; i++) {
       data[i] = 0;
     }
   }
   ```

4. **Constant-Time Comparison**
   ```typescript
   // Prevent timing attacks
   function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
     if (a.length !== b.length) return false;
     let result = 0;
     for (let i = 0; i < a.length; i++) {
       result |= a[i] ^ b[i];
     }
     return result === 0;
   }
   ```

---

## Prohibited Practices

### ❌ NEVER

1. **Hardcode Keys**
   ```typescript
   // ❌ WRONG
   const secretKey = "abc123...";
   ```

2. **Reuse IVs**
   ```typescript
   // ❌ WRONG: Same IV for multiple encryptions
   const iv = new Uint8Array(12); // All zeros
   ```

3. **Use Weak KDFs**
   ```typescript
   // ❌ WRONG: PBKDF2 with low iterations
   pbkdf2(password, salt, 1000, 32); // Too weak
   ```

4. **Store Keys in Plaintext**
   ```typescript
   // ❌ WRONG
   localStorage.setItem('key', keyBytes);
   ```

5. **Use Math.random() for Crypto**
   ```typescript
   // ❌ WRONG
   const iv = Math.random() * 1000000;
   ```

6. **Implement Custom Crypto**
   ```typescript
   // ❌ WRONG: Custom encryption
   function myEncrypt(data) { /* ... */ }
   ```

---

## Testing Requirements

### Unit Tests

Every crypto function MUST have:

1. **Correctness Tests**
   - Encrypt → Decrypt = Original
   - Key derivation is deterministic
   - Signature verification works

2. **Security Tests**
   - IV is unique per call
   - Auth tags are validated
   - Tampering is detected

3. **Edge Cases**
   - Empty input
   - Maximum size input
   - Invalid keys

### Example:
```typescript
describe('AES-GCM Encryption', () => {
  it('should decrypt to original plaintext', async () => {
    const plaintext = new TextEncoder().encode('secret');
    const key = await generateAESKey();

    const encrypted = await encryptAES256GCM(plaintext, key);
    const decrypted = await decryptAES256GCM(encrypted, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('should generate unique IVs', async () => {
    const plaintext = new TextEncoder().encode('test');
    const key = await generateAESKey();

    const enc1 = await encryptAES256GCM(plaintext, key);
    const enc2 = await encryptAES256GCM(plaintext, key);

    expect(enc1.iv).not.toEqual(enc2.iv);
  });

  it('should detect tampering', async () => {
    const plaintext = new TextEncoder().encode('data');
    const key = await generateAESKey();

    const encrypted = await encryptAES256GCM(plaintext, key);

    // Tamper with ciphertext
    encrypted.ciphertext[0] ^= 0xFF;

    await expect(
      decryptAES256GCM(encrypted, key)
    ).rejects.toThrow('Decryption failed');
  });
});
```

---

## Compliance

### Standards Followed

- ✅ NIST FIPS 197 (AES)
- ✅ NIST FIPS 180-4 (SHA-2)
- ✅ RFC 5869 (HKDF)
- ✅ RFC 9106 (Argon2)
- ✅ OWASP Cryptographic Storage Cheat Sheet

### Audit Requirements

- External cryptographic review (annually)
- Penetration testing (quarterly)
- Code review of all crypto code (pre-release)

---

## Migration & Upgrades

### Algorithm Lifecycle

**Current (2024):**
- AES-256-GCM
- Argon2id
- RSA-4096
- SHA-256

**Planned Upgrades:**
- Post-quantum algorithms (2026+)
  - CRYSTALS-Kyber for key exchange
  - CRYSTALS-Dilithium for signatures

**Deprecation Process:**
1. Announce 6 months before
2. Support parallel algorithms
3. Migrate users gradually
4. Remove after 12 months

---

## Emergency Procedures

### If Algorithm Compromised

1. **Immediate:**
   - Disable affected feature
   - Notify users within 24h

2. **Short-term (< 1 week):**
   - Deploy emergency update
   - Force key rotation

3. **Long-term (< 1 month):**
   - Migrate to new algorithm
   - Re-encrypt all affected data

---

**Last Updated:** December 2024
**Version:** 1.0.0
**Next Review:** March 2025
**Owner:** Security Team
