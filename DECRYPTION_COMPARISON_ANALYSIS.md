# Decryption Comparison: Gallery Screen vs Album Screen

## Executive Summary

Both Gallery and Album screens decrypt the **same images**, but they use **different data sources and fetching mechanisms**. The decryption logic in `PhotoCard.tsx` is shared, but the way images are loaded before reaching PhotoCard differs.

---

## 1. Gallery Screen (App.tsx - ViewState.GALLERY)

### Data Flow
```
App.tsx (Lines 183-235)
  ↓
photoService.subscribeToPostsFeed(user.id)
  ↓
Fetches ALL posts across ALL albums the user has access to
  ↓
Decrypts post metadata (caption, tags, location)
  ↓
Stores in `posts` state
  ↓
Filters & displays in PhotoCard
  ↓
PhotoCard decrypts images
```

### Key Characteristics

**Line 190:** 
```typescript
unsubscribe = photoService.subscribeToPostsFeed(user.id, async (newPosts) => {
```

**Post Metadata Decryption (Lines 193-216):**
```typescript
const decrypted = await Promise.all(newPosts.map(async (post) => {
  // Robust check: Decrypt if NOT explicitly unencrypted AND has encrypted metadata
  if (familyKey && post.isEncrypted !== false && (post as any).encryptedMetadata) {
    try {
      const postKey = await photoKeyModule.derivePhotoKey(familyKey, post.id);
      const metadata = await photoCryptoModule.decryptMetadata({
        encrypted: (post as any).encryptedMetadata,
        iv: (post as any).metadataIv,
        authTag: (post as any).metadataAuthTag
      }, postKey);
      return {
        ...post,
        caption: metadata.caption || post.caption,
        tags: metadata.tags || post.tags,
        location: metadata.location || post.location,
        isEncrypted: true // ← MARKS AS ENCRYPTED
      };
    } catch (err) {
      console.error(`[App] Failed to decrypt post ${post.id}:`, err);
      return post; // ← Returns ORIGINAL post on failure
    }
  }
  return post;
}));
```

**Important:**
- Decrypts **metadata only** (caption, tags, location)
- **Does NOT decrypt image files** at this stage
- Sets `isEncrypted: true` if decryption succeeds
- **Falls back to original post** if metadata decryption fails

---

## 2. Album Screen (AlbumView.tsx)

### Data Flow
```
AlbumView.tsx (Lines 105-184)
  ↓
photoService.subscribeToAlbumPosts(album.id)
  ↓
Fetches posts ONLY for this specific album
  ↓
Decrypts post metadata (caption, tags, location)
  ↓
Stores in local `posts` state
  ↓
Displays in PhotoCard
  ↓
PhotoCard decrypts images
```

### Key Characteristics

**Line 121:**
```typescript
unsubscribePosts = photoService.subscribeToAlbumPosts(album.id, async (fetchedPosts) => {
```

**Post Metadata Decryption (Lines 123-145):**
```typescript
const decrypted = await Promise.all(fetchedPosts.map(async (post) => {
  if (familyKey && post.isEncrypted && (post as any).encryptedMetadata) {
    try {
      const postKey = await photoKeyModule.derivePhotoKey(familyKey, post.id);
      const metadata = await photoCryptoModule.decryptMetadata({
        encrypted: (post as any).encryptedMetadata,
        iv: (post as any).metadataIv,
        authTag: (post as any).metadataAuthTag
      }, postKey);
      return {
        ...post,
        caption: metadata.caption || post.caption,
        tags: metadata.tags || post.tags,
        location: metadata.location || post.location
      };
    } catch (err) {
      console.error(`[AlbumView] Failed to decrypt post ${post.id}:`, err);
      return post;
    }
  }
  return post;
}));
```

**Important:**
- Similar metadata decryption
- **Does NOT explicitly set `isEncrypted` flag** after successful decryption
- Scoped to a single album

---

## 3. PhotoCard Image Decryption (Shared Component)

Both screens use the same `PhotoCard.tsx` component for image decryption.

### Critical Logic (Lines 68-99)

**Line 78: Encryption Check**
```typescript
// Handle non-encrypted or non-post items
// Robust check: Only skip if explicitly NOT encrypted OR missing albumId
// If isEncrypted is undefined but albumId exists, we assume it should be encrypted
if (photo.isEncrypted === false || !photo.albumId) {
  console.log(`[PhotoCard] Skipping decryption: isEncrypted=${photo.isEncrypted}, albumId=${photo.albumId}`);
  if ('url' in photo) {
    setDisplayUrls([photo.url || '']);
  }
  return;
}
```

**This is the KEY DIFFERENCE:**

- **Condition 1:** `photo.isEncrypted === false` → Skip decryption
- **Condition 2:** `!photo.albumId` → Skip decryption
- **Otherwise:** Proceed to decrypt

### Line 93: Family Key Check
```typescript
const albumKey = familyKey;

if (!albumKey) {
  console.warn(`[PhotoCard] Locked: Missing Family Key for ${photo.id}`);
  if (photo.isEncrypted) {
    setIsLocked(true);
  }
  return;
}
```

---

## 4. The Critical Difference

### Gallery Screen Issue

**In App.tsx (Line 208):**
```typescript
isEncrypted: true // Ensure it's marked as encrypted if we successfully decrypted
```

**Problem:**
Even after **successfully decrypting metadata**, the Gallery screen **explicitly sets `isEncrypted: true`**. This means when PhotoCard receives the post:
- `post.isEncrypted === true` ✅ (not false)
- `post.albumId` exists ✅
- PhotoCard **proceeds to decrypt images** ✅

**BUT**, if metadata decryption **fails** (Line 211):
```typescript
console.error(`[App] Failed to decrypt post ${post.id}:`, err);
return post; // ← Returns ORIGINAL post
```

The original post might:
- Have `isEncrypted: false` or `undefined`
- Not have correct metadata structure
- **PhotoCard skips decryption at Line 78**

### Album Screen Behavior

**In AlbumView.tsx:**
- **Does NOT explicitly set `isEncrypted` flag** after metadata decryption
- Preserves the original `post.isEncrypted` value from Firestore
- If the post was originally encrypted, it remains marked as encrypted
- PhotoCard receives the post **with its original encryption flag intact**

---

## 5. Root Cause Analysis

### Why Gallery Screen Fails

**Scenario 1: Metadata Decryption Fails**
1. `subscribeToPostsFeed` fetches posts
2. Metadata decryption fails (Line 210-212)
3. Returns **original post** without modifications
4. Original post might have `isEncrypted: false` or missing field
5. PhotoCard receives it
6. **Line 78 check:** `photo.isEncrypted === false` → **SKIPS DECRYPTION** ❌

**Scenario 2: Missing Fields**
1. Posts from `subscribeToPostsFeed` might be missing fields
2. No `albumId` set properly
3. PhotoCard receives it
4. **Line 78 check:** `!photo.albumId` → **SKIPS DECRYPTION** ❌

### Why Album Screen Works

1. `subscribeToAlbumPosts` fetches posts with correct structure
2. Posts are **guaranteed to have `albumId`** (used in the query itself)
3. Even if metadata decryption fails, original post structure is preserved
4. PhotoCard receives well-formed post
5. Decryption proceeds successfully ✅

---

## 6. Debugging Recommendations

### Add Console Logs

**In PhotoCard.tsx (Line 58):**
```typescript
console.log(`[PhotoCard] Rendering item ${photo.id}:`, {
  isPost: !!post,
  photoIds: post?.photoIds,
  photoCount,
  caption: photo.caption,
  isEncrypted: photo.isEncrypted, // ← Check this value
  albumId: photo.albumId,         // ← Check this value
  hasFamilyKey: !!familyKey       // ← Check this value
});
```

**What to look for:**
- **Gallery posts:** Check `isEncrypted` and `albumId` values
- **Album posts:** Compare the same fields
- Look for differences in these critical fields

### Check Firestore Data

Run this query to inspect your posts:
```javascript
// In browser console
const posts = await firebase.firestore()
  .collection('posts')
  .where('authorId', '==', 'YOUR_USER_ID')
  .get();

posts.forEach(doc => {
  console.log(doc.id, {
    isEncrypted: doc.data().isEncrypted,
    albumId: doc.data().albumId,
    encryptedMetadata: !!doc.data().encryptedMetadata,
    metadataIv: !!doc.data().metadataIv,
    metadataAuthTag: !!doc.data().metadataAuthTag
  });
});
```

---

## 7. Proposed Solutions

### Solution 1: Fix Metadata Decryption in App.tsx

**Problem:** Returning original post on failure might break downstream logic.

**Fix (Lines 210-213):**
```typescript
} catch (err) {
  console.error(`[App] Failed to decrypt post ${post.id}:`, err);
  // Instead of returning original, preserve structure
  return {
    ...post,
    isEncrypted: true, // ← Keep marked as encrypted
    caption: post.caption || '',
    tags: post.tags || [],
    location: post.location || ''
  };
}
```

### Solution 2: Make PhotoCard More Robust

**In PhotoCard.tsx (Line 78):**
```typescript
// More lenient check - only skip if EXPLICITLY marked as unencrypted
// AND we have no albumId at all
if (photo.isEncrypted === false && !photo.albumId) {
  console.log(`[PhotoCard] Skipping decryption: isEncrypted=${photo.isEncrypted}, albumId=${photo.albumId}`);
  if ('url' in photo) {
    setDisplayUrls([photo.url || '']);
  }
  return;
}

// If we have an albumId, ALWAYS attempt decryption regardless of isEncrypted flag
if (photo.albumId && !familyKey) {
  console.warn(`[PhotoCard] Locked: Has albumId but missing Family Key for ${photo.id}`);
  setIsLocked(true);
  return;
}
```

### Solution 3: Align Both Screens

**Make AlbumView match App.tsx behavior:**
```typescript
return {
  ...post,
  caption: metadata.caption || post.caption,
  tags: metadata.tags || post.tags,
  location: metadata.location || post.location,
  isEncrypted: true // ← Add this line
};
```

---

## 8. Testing Plan

1. **Add logging** to both `App.tsx` and `AlbumView.tsx` to track `isEncrypted` values
2. **Inspect posts** in both Gallery and Album views
3. **Compare console output** for the same post in both views
4. **Check Firestore** data to verify source of truth
5. **Test with both encrypted and unencrypted posts**
6. **Verify cache behavior** - clear cache and test again

---

## Summary Table

| Aspect | Gallery Screen (App.tsx) | Album Screen (AlbumView.tsx) | PhotoCard.tsx |
|--------|--------------------------|------------------------------|---------------|
| **Data Source** | `subscribeToPostsFeed(userId)` | `subscribeToAlbumPosts(albumId)` | Receives post from parent |
| **Scope** | All posts across all albums | Single album only | Individual post |
| **Sets `isEncrypted` on success** | ✅ Yes (Line 208) | ❌ No | N/A - reads it |
| **Returns original on metadata failure** | ✅ Yes (Line 212) | ✅ Yes (Line 141) | N/A |
| **Guarantees `albumId`** | ⚠️ Depends on query | ✅ Yes (inherent to query) | Checks it (Line 78) |
| **Image Decryption** | Delegates to PhotoCard | Delegates to PhotoCard | ✅ Performs actual decryption |
| **Decryption Skip Condition** | N/A | N/A | `isEncrypted === false OR !albumId` |

---

## Conclusion

The issue is likely in the **data structure** being passed from Gallery screen to PhotoCard:
- Posts might have incorrect `isEncrypted` flags
- Posts might be missing `albumId`
- Metadata decryption failures preserve problematic flags

**Recommended next step:** Add the debugging logs and examine the actual post data being passed to PhotoCard in both scenarios.
