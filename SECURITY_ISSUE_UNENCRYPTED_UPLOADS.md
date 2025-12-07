# 🚨 CRITICAL SECURITY ISSUE: Unencrypted Photo Uploads

## Problem Summary

**Your photos are being uploaded to Firebase Storage WITHOUT encryption.**

Even though we built a complete encryption system (Phase 5), it's **not being used** by your actual upload components.

---

## Why You Can See Images in Firebase Storage

### Current Upload Flow (INSECURE)

```
User selects photo
     ↓
Uploader.tsx (line 161)
     ↓
storageService.uploadImage()  ← NO ENCRYPTION!
     ↓
Firebase Storage (plaintext JPEG files)
     ↓
Anyone with access can see the photos
```

**Line 161 in `components/Uploader.tsx`:**
```typescript
const downloadURL = await storageService.uploadImage(
  fileToUpload,
  `photos/${user.id}/${fileName}`
);
```

This uploads the raw file directly to storage. **No encryption, no privacy.**

---

## What SHOULD Be Happening

### Secure Upload Flow (What We Built)

```
User selects photo
     ↓
Encrypt photo with album key
     ↓
Strip EXIF metadata (GPS, camera info, etc.)
     ↓
Generate encrypted thumbnail
     ↓
Upload encrypted blobs to Firebase Storage
     ↓
Store encrypted metadata in Firestore
     ↓
Storage contains unreadable binary data (encrypted)
```

**This is what we built in Phase 5, but it's NOT being used!**

---

## Files That Need to Be Updated

### ❌ Currently Using Unencrypted Upload:

1. **`components/Uploader.tsx`** (line 161)
   - Main photo upload component
   - Uses: `storageService.uploadImage()` ← INSECURE

2. **`components/EditPhotoModal.tsx`**
   - Photo editing component
   - Likely also uses unencrypted upload

3. **`services/storageService.ts`**
   - Legacy upload service
   - Should be **deprecated** or **removed**

### ✅ Encrypted Upload (Built but Not Used):

- `services/crypto/photo/photoEncryption.ts`
- `services/crypto/photo/photoUpload.ts`
- `services/crypto/photo/photoDownload.ts`

---

## The Solution

### Option 1: Quick Fix (Recommended)

**Replace the upload logic in `Uploader.tsx` to use encrypted upload.**

Before (line 154-176):
```typescript
const handleSave = async () => {
  // ... validation ...

  // ❌ INSECURE: Direct upload
  const downloadURL = await storageService.uploadImage(
    fileToUpload,
    `photos/${user.id}/${fileName}`
  );

  const newPhotoData = {
    url: downloadURL,  // ← Plaintext image URL
    caption: analysis.caption,
    tags: analysis.tags,
    // ...
  };

  await photoService.addPhoto(newPhotoData);
};
```

After (SECURE):
```typescript
import { encryptPhoto } from '../services/crypto/photo/photoEncryption';
import { uploadEncryptedPhoto } from '../services/crypto/photo/photoUpload';
import { getAlbumKey } from '../services/crypto/album/albumKeys';

const handleSave = async () => {
  if (!preview || !analysis || !fileToUpload || !user) return;
  setIsUploading(true);

  try {
    // 1. Get or create album
    const albumId = await getOrCreateAlbum(analysis.album, user.id);

    // 2. Get album encryption key
    const albumKey = await getAlbumKey(albumId);

    // 3. Encrypt the photo
    const encryptedPhoto = await encryptPhoto(
      fileToUpload,
      albumId,
      albumKey
    );

    // 4. Upload encrypted photo
    const photoId = await uploadEncryptedPhoto(
      encryptedPhoto,
      (progress) => {
        console.log(`Upload: ${progress.percentage}%`);
      }
    );

    // 5. Save metadata (encrypted metadata is already in Firestore)
    const newPhotoData = {
      photoId,
      albumId,
      caption: analysis.caption,
      tags: analysis.tags,
      uploadedAt: Date.now(),
      uploadedBy: user.id,
    };

    await photoService.addPhoto(newPhotoData);

    onUploadComplete(newPhotoData as Photo);
  } catch (error) {
    console.error("Encrypted upload failed", error);
    // Handle error
  } finally {
    setIsUploading(false);
  }
};
```

### Option 2: Create a Wrapper Service

Create `services/securePhotoService.ts`:
```typescript
import { encryptPhoto } from './crypto/photo/photoEncryption';
import { uploadEncryptedPhoto } from './crypto/photo/photoUpload';
import { getAlbumKey, createFamilyAlbum } from './crypto/album/albumKeys';

export const securePhotoService = {
  /**
   * Upload photo with encryption
   */
  uploadPhoto: async (
    file: File,
    albumName: string,
    userId: string,
    onProgress?: (percentage: number) => void
  ): Promise<string> => {
    // 1. Get or create album
    let albumId = await getAlbumIdByName(albumName);
    if (!albumId) {
      const album = await createFamilyAlbum({
        name: albumName,
        description: `${albumName} photos`,
      });
      albumId = album.albumId;
    }

    // 2. Get album key
    const albumKey = await getAlbumKey(albumId);

    // 3. Encrypt photo
    const encrypted = await encryptPhoto(file, albumId, albumKey);

    // 4. Upload
    const photoId = await uploadEncryptedPhoto(encrypted, (progress) => {
      if (onProgress) onProgress(progress.percentage);
    });

    return photoId;
  },

  /**
   * Download and decrypt photo
   */
  downloadPhoto: async (photoId: string): Promise<string> => {
    const { url } = await downloadAndDecryptPhoto(photoId);
    return url; // Object URL for display
  },
};
```

Then use it in components:
```typescript
import { securePhotoService } from '../services/securePhotoService';

const photoId = await securePhotoService.uploadPhoto(
  fileToUpload,
  analysis.album,
  user.id,
  (percentage) => console.log(`${percentage}%`)
);
```

---

## Migration Steps

### Step 1: Stop New Unencrypted Uploads

1. Update `Uploader.tsx` to use encrypted upload
2. Update `EditPhotoModal.tsx` to use encrypted upload
3. Add a feature flag to disable old upload path

### Step 2: Verify Encryption is Working

1. Upload a test photo through the updated UI
2. Check Firebase Storage - file should be named `encrypted/{userId}/{albumId}/{photoId}/original`
3. Download the file - should NOT be viewable as JPEG
4. Check Firestore `photos` collection - metadata should be encrypted

```bash
# Download encrypted file from Firebase
curl -o test.bin "https://storage.googleapis.com/.../original"

# Try to view it (should fail)
file test.bin
# Output should be: "test.bin: data" (not "JPEG image")
```

### Step 3: Re-encrypt Existing Photos (Optional)

**WARNING: This will re-upload all photos. Make sure to back up first.**

```typescript
// Migration script
async function migrateExistingPhotos() {
  const photos = await getAllPhotos();

  for (const photo of photos) {
    console.log(`Migrating ${photo.id}...`);

    // 1. Download plaintext photo
    const response = await fetch(photo.url);
    const blob = await response.blob();
    const file = new File([blob], photo.originalName, { type: 'image/jpeg' });

    // 2. Encrypt and re-upload
    const albumKey = await getAlbumKey(photo.albumId);
    const encrypted = await encryptPhoto(file, photo.albumId, albumKey);
    const photoId = await uploadEncryptedPhoto(encrypted);

    // 3. Delete old plaintext version
    await deleteObject(ref(storage, photo.storagePath));

    // 4. Update Firestore with new encrypted reference
    await updateDoc(doc(db, 'photos', photo.id), {
      photoId,
      encrypted: true,
      migratedAt: Date.now(),
    });

    console.log(`✓ Migrated ${photo.id}`);
  }

  console.log('Migration complete!');
}
```

### Step 4: Remove Old Upload Service

Once all photos are encrypted:

1. Delete or deprecate `services/storageService.ts`
2. Remove all references to `storageService.uploadImage`
3. Add a comment: "DEPRECATED - Use securePhotoService instead"

---

## Verification Checklist

After implementing the fix:

- [ ] Uploaded photo appears as "data" not "JPEG" in Firebase Storage
- [ ] Photo stored at path: `encrypted/{userId}/{albumId}/{photoId}/original`
- [ ] Firestore `photos` doc has encrypted metadata
- [ ] Downloaded file cannot be opened as image
- [ ] Photo displays correctly in app (after decryption)
- [ ] EXIF metadata is stripped (no GPS, camera info)
- [ ] Thumbnail is generated and encrypted
- [ ] Upload progress tracking works
- [ ] All existing tests pass

---

## Testing the Fix

### Test 1: Upload New Photo

1. Select a photo through UI
2. Wait for upload to complete
3. Go to Firebase Console → Storage
4. Navigate to the uploaded file
5. Download it
6. Try to open with image viewer → **Should fail**

### Test 2: View Photo in App

1. Upload photo through UI
2. Navigate to gallery
3. Photo should display correctly ← Proves decryption works

### Test 3: Check Metadata

1. Go to Firestore → `photos` collection
2. Open uploaded photo document
3. Check `encryptedMetadata.ciphertext` field
4. Should be base64 string, not readable JSON

### Test 4: EXIF Stripping

1. Upload a photo with GPS data (from phone)
2. Download encrypted file from storage
3. Decrypt it manually
4. Check EXIF data: `exiftool decrypted.jpg`
5. Should show NO GPS coordinates

---

## Current Status

- ✅ Encryption system implemented (Phase 5)
- ✅ All tests passing
- ❌ **UI components NOT using encryption**
- ❌ **Photos stored as plaintext**
- ❌ **SECURITY VULNERABILITY: Anyone with storage access can view photos**

## Next Steps

1. **URGENT**: Update `Uploader.tsx` to use encrypted upload
2. Update `EditPhotoModal.tsx` to use encrypted upload
3. Create `securePhotoService.ts` wrapper (optional but recommended)
4. Test encrypted upload flow
5. Verify photos are actually encrypted in Firebase
6. Plan migration for existing plaintext photos (if any)

---

## Why This Matters

**Current State:**
- All photos in Firebase Storage are **visible to anyone with access**
- EXIF metadata (GPS location, camera info) is **NOT stripped**
- Photo thumbnails are **NOT encrypted**
- Metadata (captions, tags) is **NOT encrypted**

**After Fix:**
- Photos are **encrypted blobs** (unreadable without key)
- EXIF metadata **stripped before upload**
- Thumbnails **encrypted separately**
- Metadata **encrypted in Firestore**
- Only authorized users with correct keys can view photos

This is the difference between:
- ❌ "We have an encryption system" (not used)
- ✅ "Our photos are actually encrypted" (working)

**The encryption is only as good as its implementation. Right now, it's not being used.**
