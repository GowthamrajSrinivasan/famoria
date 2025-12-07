# How to Verify Encryption Is Working

This guide shows you multiple ways to confirm that your encryption system is actually encrypting data properly.

## ✅ Verification Test Results

Run the verification tests to see proof encryption is working:

```bash
npm test -- encryptionVerification.test.ts
```

### What These Tests Prove:

#### 1. **Encrypted Data is Different from Original** ✓
```
Original bytes:  [84, 104, 105, 115,  32, ...]  ("This is sensitive...")
Encrypted bytes: [205, 131, 75, 64, 100, ...]  (random-looking)
```
- The encrypted data looks completely different
- No readable text remains

#### 2. **Encrypted Data Looks Random** ✓
```
Original (repetitive): AAAAAAAAAAAAAAAAAAAAAA
Encrypted:            c7 7e 82 b2 c9 e7 a1 ff...
Most common byte:     5.9% (should be <10%)
```
- Even repetitive patterns become random
- Good statistical distribution

#### 3. **Decryption Recovers Original Data** ✓
```
Original:  "Secret message: User password is secure123!"
Decrypted: "Secret message: User password is secure123!"
Match? true
```
- Perfect recovery of original data
- No corruption or data loss

#### 4. **Wrong Key Cannot Decrypt** ✓
```
✓ Decryption failed as expected (authentication check)
```
- AES-GCM authentication prevents wrong-key decryption
- Cryptographic proof of encryption

#### 5. **Random IVs Prevent Pattern Analysis** ✓
```
First encryption IV:  05 03 a2 7a 0a 12 d0 28...
Second encryption IV: d5 36 19 37 71 e9 fd 23...
IVs are different? true
Ciphertexts are different? true
```
- Same plaintext produces different ciphertext each time
- Prevents attackers from detecting duplicate data

#### 6. **Tampering is Detected** ✓
```
Tampered byte 0: 243 -> 242
✓ Tampering detected (GCM auth tag validation failed)
```
- Any modification to ciphertext is detected
- Integrity protection via GCM authentication

#### 7. **File Formats are Hidden** ✓
```
Original JPEG header: 0xff 0xd8 0xff 0xe0...
Encrypted version:    0xea 0xc6 0x57 0xa6...
JPEG magic bytes visible? false
```
- File type cannot be determined from encrypted data
- Metadata privacy protected

#### 8. **Key Derivation Works** ✓
```
Album 1 key: 35 36 ef ad ce f9 f6 66
Album 2 key: ec 64 cc 47 da eb 22 2d
Keys are different? true
```
- Different albums get cryptographically distinct keys
- HKDF ensures proper key separation

---

## 🔍 How to Check Encrypted Data in Firebase

### Step 1: Upload a Photo

Use your app or create a test script:

```typescript
import { encryptPhoto } from './services/crypto/photo/photoEncryption';
import { uploadEncryptedPhoto } from './services/crypto/photo/photoUpload';
import { generateAESKey } from './services/crypto/core/cryptoCore';

// Create test photo
const photoFile = new File([/* photo data */], 'test.jpg', { type: 'image/jpeg' });
const albumKey = await generateAESKey(false);

// Encrypt and upload
const encrypted = await encryptPhoto(photoFile, 'album_123', albumKey);
const photoId = await uploadEncryptedPhoto(encrypted);

console.log('Uploaded photo ID:', photoId);
```

### Step 2: Check Firebase Storage

1. Open Firebase Console: https://console.firebase.google.com
2. Go to **Storage** tab
3. Navigate to: `encrypted/{userId}/{albumId}/{photoId}/`
4. You should see two files:
   - `original` - Encrypted full-size photo
   - `thumbnail` - Encrypted thumbnail

### Step 3: Download and Inspect the Encrypted File

Click on the `original` file and copy the download URL. Then download it:

```bash
curl -o encrypted_photo.bin "https://storage.googleapis.com/..."
```

### Step 4: Verify It's Actually Encrypted

Try to open the file with an image viewer - **it should fail** or show garbage:

```bash
# Try to identify the file type (should fail or show "data")
file encrypted_photo.bin
# Output: encrypted_photo.bin: data

# Try to view as image (should fail)
open encrypted_photo.bin  # macOS
# OR
xdg-open encrypted_photo.bin  # Linux
```

If the image viewer can display the photo, **encryption is NOT working**.

If you see an error like "unknown file format" or "corrupted file", **encryption IS working** ✓

### Step 5: Check Firestore Metadata

1. Open Firebase Console: https://console.firebase.google.com
2. Go to **Firestore Database** tab
3. Go to collection: `photos`
4. Open a photo document

You should see:
- `encryptedMetadata.ciphertext` - Base64 string (encrypted)
- `ivs.photo` - Base64 string (initialization vector)
- `ivs.thumbnail` - Base64 string
- `ivs.metadata` - Base64 string

**Example of what you should see:**
```json
{
  "photoId": "photo_1234567890_abc123",
  "albumId": "album_123",
  "encryptedMetadata": {
    "ciphertext": "xK8Vj9mL2nQ5tR7wY3pE...",  // Looks random
    "iv": "A8fG2kL9sD4mP1qX",
    "authTag": "mN5jK8wR3tY2pL9fB"
  },
  "ivs": {
    "photo": "L9sD4mP1qX8fG2kA",
    "thumbnail": "P1qX8fG2kAL9sD4m",
    "metadata": "8fG2kAL9sD4mP1qX"
  }
}
```

**Try to decode the ciphertext** (it should be gibberish):

```bash
echo "xK8Vj9mL2nQ5tR7wY3pE..." | base64 -d | od -A x -t x1
```

You should see random-looking bytes, not readable JSON or text.

---

## 🧪 Quick Manual Tests

### Test 1: Encrypt and Compare

```typescript
import { encryptAES256GCM, generateAESKey } from './services/crypto/core/cryptoCore';

const secret = new TextEncoder().encode("My secret password");
const key = await generateAESKey(false);

const encrypted = await encryptAES256GCM(secret, key);

console.log('Original:', Array.from(secret));
console.log('Encrypted:', Array.from(encrypted.ciphertext));
console.log('Are they different?',
  !secret.every((byte, i) => byte === encrypted.ciphertext[i])
);
```

**Expected output:**
```
Original: [77, 121, 32, 115, 101, 99, 114, 101, 116, ...]
Encrypted: [158, 73, 201, 44, 9, 183, 94, 221, 102, ...]
Are they different? true
```

### Test 2: Try to Decrypt with Wrong Key

```typescript
const secret = new TextEncoder().encode("Secret data");

const correctKey = await generateAESKey(false);
const wrongKey = await generateAESKey(false);

const encrypted = await encryptAES256GCM(secret, correctKey);

// This should throw an error
try {
  await decryptAES256GCM(encrypted, wrongKey);
  console.log('❌ ERROR: Wrong key succeeded! Encryption broken!');
} catch (err) {
  console.log('✓ Correct: Wrong key was rejected');
}
```

### Test 3: Verify EXIF Stripping

```typescript
import { stripEXIF } from './services/crypto/photo/photoEncryption';

// Load a JPEG with EXIF data
const jpegWithExif = await fetch('photo_with_gps.jpg').then(r => r.arrayBuffer());
const original = new Uint8Array(jpegWithExif);

// Strip EXIF
const stripped = await stripEXIF(original, 'image/jpeg');

console.log('Original size:', original.length);
console.log('Stripped size:', stripped.length);
console.log('EXIF removed:', original.length > stripped.length);

// Search for GPS markers in original
const hasGPS = searchForBytes(original, [0x88, 0x25]); // GPS tag
console.log('Original has GPS tag:', hasGPS);
console.log('Stripped has GPS tag:', searchForBytes(stripped, [0x88, 0x25]));
```

---

## 🔐 Security Checklist

Use this checklist to verify all encryption features:

- [ ] **Encrypted data is different from original** (Test 1)
- [ ] **Encrypted data appears random** (Test 2)
- [ ] **Decryption works perfectly** (Test 3)
- [ ] **Wrong key cannot decrypt** (Test 4)
- [ ] **Each encryption uses random IV** (Test 5)
- [ ] **Tampering is detected** (Test 6)
- [ ] **File format is hidden** (Test 7)
- [ ] **Album keys are derived correctly** (Test 8)
- [ ] **EXIF metadata is stripped** (Test EXIF)
- [ ] **Firebase Storage contains encrypted blobs** (Manual check)
- [ ] **Firestore metadata is encrypted** (Manual check)
- [ ] **Downloaded files cannot be opened without decryption** (Manual check)

---

## 📊 What Encryption Looks Like

### ❌ **Unencrypted** (BAD - DO NOT DO THIS)
```
Firebase Storage file contents:
FF D8 FF E0 00 10 4A 46 49 46 00 01...  (JPEG header visible)

You can open this file and see the photo! ❌
```

### ✅ **Encrypted** (GOOD - What you should see)
```
Firebase Storage file contents:
A3 F2 8D 44 B9 7E 12 CC 5F 91 3D...  (Random bytes)

Cannot open this file - shows "corrupted" or "unknown format" ✓
```

### Firestore Metadata Comparison

**❌ Unencrypted (BAD):**
```json
{
  "originalName": "vacation_beach.jpg",  // Readable!
  "location": "Hawaii",  // Privacy leak!
  "width": 1920,
  "height": 1080
}
```

**✅ Encrypted (GOOD):**
```json
{
  "encryptedMetadata": {
    "ciphertext": "xK8Vj9mL2nQ5tR7wY3pE8fG2kAL9sD4m...",  // Unreadable
    "iv": "A8fG2kL9sD4mP1qX",
    "authTag": "mN5jK8wR3tY2pL9fB"
  }
}
```

---

## 🛠️ Tools for Verification

### 1. Hex Viewer
View raw bytes of encrypted files:

```bash
# macOS/Linux
xxd encrypted_photo.bin | head -20

# Or use hexdump
hexdump -C encrypted_photo.bin | head -20
```

**Encrypted data should look like:**
```
00000000: a3 f2 8d 44 b9 7e 12 cc  5f 91 3d 4a 2c 88 ff 31  |...D.~.._.=J,..1|
00000010: 7b 55 c9 03 d4 89 42 1f  96 2e a7 51 88 3c dd 77  |{U....B....Q.<.w|
```

### 2. File Command
Check file type:

```bash
file encrypted_photo.bin
```

**Expected output:**
```
encrypted_photo.bin: data
```

**NOT:**
```
encrypted_photo.bin: JPEG image data  ❌ (means not encrypted!)
```

### 3. Entropy Analysis
High entropy = good encryption:

```bash
# Install ent tool
brew install ent  # macOS
# OR
sudo apt-get install ent  # Linux

# Check entropy
ent encrypted_photo.bin
```

**Expected output:**
```
Entropy = 7.99 bits per byte.  ✓ (close to 8 = very random)
```

**Bad encryption:**
```
Entropy = 4.5 bits per byte.  ❌ (low = poor encryption)
```

---

## 🎯 Summary

**Your encryption is working if:**

1. ✅ All 8 verification tests pass
2. ✅ Encrypted files in Firebase Storage cannot be opened as images
3. ✅ Firestore contains base64 strings that look random
4. ✅ `file` command reports "data" not "JPEG"
5. ✅ Hex dump shows random bytes
6. ✅ Entropy is close to 8 bits/byte
7. ✅ Wrong key cannot decrypt
8. ✅ JPEG magic bytes (FF D8) not visible in encrypted data

**Run the tests now:**
```bash
npm test -- encryptionVerification.test.ts
```

All 8 tests should pass with detailed output showing the encryption is working correctly.
