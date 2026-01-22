# Famoria: Firebase & Mobile Integration Guide

This document outlines critical Firebase configuration changes and data fetching strategies that must be replicated in the mobile app to ensure data consistency and feature parity with the web version.

---

## 1. Security Rules Update
To support the robust, multi-stage photo recovery system (especially searching across albums), the following **recursive match** is now required in `firestore.rules`.

```firestore
// Allow collection group queries for photos across all paths
match /{path=**}/photos/{photoId} {
  allow read: if request.auth != null;
}
```

> [!IMPORTANT]
> Without this rule, the mobile app will receive a "Missing or insufficient permissions" error when attempting to fetch photos belonging to legacy or misplaced posts.

---

## 2. Firestore Indexes
A new **Collection Group index** is required to find photos by their parent `postId` regardless of which album sub-collection they are stored in.

| Collection Group | Scope | Fields |
| :--- | :--- | :--- |
| `photos` | `COLLECTION_GROUP` | `postId: ASC`, `orderInPost: ASC` |

---

## 3. Robust Photo Fetching Strategy
Legacy or corrupted data can sometimes result in a `Post` document pointing to the wrong `albumId`. To handle this, the mobile service should implement the following **5-Stage Recovery** when fetching photos for a post:

### Stage 1: Direct ID Search
If the `Post` document contains a `photoIds` array, fetch those specific documents from the specified `albumId`.

### Stage 2: Ordered Album Query
Query the `photos` sub-collection under the `albumId` where `postId == targetPostId`, ordered by `orderInPost`.

### Stage 3: Unordered Album Query (Fallback)
Same as Stage 2, but **without** `orderBy`. This captures documents where the `orderInPost` field is missing or malformed.

### Stage 4: Top-Level Feed Check
Query the top-level `photos` collection (the public feed) for any references where `postId == targetPostId`. If found, follow the `albumPhotoId` and `albumId` stored in that reference to the actual encrypted document.

### Stage 5: Collection Group Recovery (Last Resort)
Perform a `collectionGroup('photos')` query where `postId == targetPostId`. This finds the photo even if it's stored in a completely different album than what the `Post` document claims.

---

## 4. Diagnostic Indicators
- **Suspicious Album ID**: If a `Post` has `albumId == postId`, this is a strong indicator of data inconsistency and the app should jump straight to the Stage 5 recovery logic.
- **Empty Post Fallback**: If all stages return 0 photos, the UI should attempt a "Legacy Fallback" by looking for a single photo document with an ID matching the current item's ID or `albumPhotoId`.
