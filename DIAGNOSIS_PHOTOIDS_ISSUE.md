# Gallery vs Album Decryption Issue - DIAGNOSIS

## 🎯 ROOT CAUSE IDENTIFIED

The issue is **NOT with encryption or decryption logic**. The problem is with **data structure in Firestore**.

### Findings from Logs

#### Album View Post (✅ WORKING):
- **Post ID**: `cEfWLJMciNjp0nJDsN9d`
- **photoIds**: `Array(1)` - Contains 1 photo ID
- **Album ID**: `b0b4d945-72b2-48d4-a66d-c45044e89707`
- **Result**: Successfully fetches 1 photo → Decrypts ✅

#### Gallery View Post (❌ BROKEN):
- **Post ID**: `RdM56a4cPHXELGZQVIEy`  
- **photoIds**: `Array(0)` - **EMPTY!** ❌
- **Album ID**: `4dbc248f-b4c3-44fa-9646-0b92b4de02c9`
- **Result**: Finds 0 photos → Nothing to decrypt → Shows locked image ❌

---

## The Problem

**The `photoIds` field is empty in the Gallery post, but populated in the Album post.**

Since both `subscribeToPostsFeed()` and `subscribeToAlbumPosts()` use identical data mapping:

```typescript
return {
  ...data,
  id: doc.id,
  _isPost: true,
  isEncrypted: data.isEncrypted ?? (data.albumId ? true : false),
  createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now()
} as Post;
```

The difference must be in the **actual Firestore documents**.

---

## Possible Root Causes

### 1. **Data Inconsistency in Firestore**

The posts collection has inconsistent data:
- Some posts have `photoIds: []` (empty array)
- Other posts have `photoIds: ["photo-id-123"]` (populated)

**Why this happens:**
- During upload, the `photoIds` field might not be set properly
- Or it's being cleared/overwritten somewhere

### 2. **Different Query Results**

Although unlikely since both queries use the same mapping, it's possible that:
- Different indexes are being used
- Different fields are being returned
- Caching is causing stale data

---

## Diagnosis Steps

### Step 1: Check Firestore Console

1. Open Firebase Console → Firestore Database
2. Navigate to the `posts` collection
3. Find both post documents:
   - `RdM56a4cPHXELGZQVIEy` (Gallery - broken)
   - `cEfWLJMciNjp0nJDsN9d` (Album - working)

4. **Compare the `photoIds` field:**
   - Is it an empty array `[]`?
   - Is it missing entirely?
   - Does it have actual photo IDs?

### Step 2: Check Upload Logic

The issue might be in how posts are created. Check the upload flow:

**File to check**: `services/photoService.ts` or upload components

**Look for**:
- Where `photoIds` is set during post creation
- Whether it's properly updated after photo upload
- If there's a race condition where the post is created before photos

---

## Quick Fix Options

### Option 1: Fix at Query Time (Band-aid)

Modify `subscribeToPostsFeed` to handle empty `photoIds`:

```typescript
subscribeToPostsFeed: (userId: string, callback: (posts: Post[]) => void) => {
  const q = query(
    collection(db, POSTS_COLLECTION),
    where('authorId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // FIX: If photoIds is empty but post has coverPhotoId, use that
      let photoIds = data.photoIds || [];
      if (photoIds.length === 0 && data.coverPhotoId) {
        photoIds = [data.coverPhotoId];
      }
      
      return {
        ...data,
        id: doc.id,
        photoIds, // Use fixed photoIds
        _isPost: true,
        isEncrypted: data.isEncrypted ?? (data.albumId ? true : false),
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now()
      } as Post;
    });

    console.log(`[PhotoService] Posts feed updated: ${posts.length} posts`);
    callback(posts);
  });
}
```

### Option 2: Fix at Upload Time (Proper fix)

Find where posts are created and ensure `photoIds` is always set:

```typescript
// In upload/create post function
const postData = {
  ...otherFields,
  photoIds: photoIds || [], // Ensure it's always an array
  coverPhotoId: photoIds?.[0], // Set first photo as cover
};
```

### Option 3: Database Migration Script

Create a script to fix existing posts:

```typescript
// scripts/fixPhotoIds.ts
async function fixEmptyPhotoIds() {
  const postsRef = collection(db, 'posts');
  const q = query(postsRef, where('photoIds', '==', []));
  
  const snapshot = await getDocs(q);
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Try to find photos for this post
    const albumId = data.albumId;
    const postId = doc.id;
    
    if (albumId) {
      const photosRef = collection(db, 'albums', albumId, 'photos');
      const photosQuery = query(photosRef, where('postId', '==', postId));
      const photosSnap = await getDocs(photosQuery);
      
      const photoIds = photosSnap.docs.map(d => d.id);
      
      if (photoIds.length > 0) {
        await updateDoc(doc.ref, {
          photoIds,
          coverPhotoId: photoIds[0]
        });
        console.log(`Fixed post ${postId}: added ${photoIds.length} photoIds`);
      }
    }
  }
}
```

---

## Recommended Action Plan

1. **Immediate**: Check Firestore console to confirm `photoIds` is empty for `RdM56a4cPHXELGZQVIEy`

2. **Quick Fix**: Apply Option 1 to handle empty arrays in the query

3. **Root Fix**: Investigate upload logic to prevent empty `photoIds` in the future

4. **Data Fix**: Run migration script (Option 3) to fix existing broken posts

---

## Test Commands

Once fixed, verify both screens show the same image:

```javascript
// In browser console
// Check a specific post
firebase.firestore().collection('posts').doc('RdM56a4cPHXELGZQVIEy').get()
  .then(doc => console.log('Gallery post:', doc.data()));

firebase.firestore().collection('posts').doc('cEfWLJMciNjp0nJDsN9d').get()
  .then(doc => console.log('Album post:', doc.data()));
```

Compare the `photoIds` field in both!
