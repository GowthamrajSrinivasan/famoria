# 🚨 QUICK FIX: Use Temporary Permissive Rules

Since the Firebase Console deployment isn't working, let's use **temporary permissive rules** to test the album functionality.

---

## ⚡ **Do This Now:**

### **Step 1: Go to Firebase Console**
https://console.firebase.google.com/project/famoria-app/firestore/rules

### **Step 2: Copy These TEMPORARY Rules**

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // User documents
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Photos
    match /photos/{photoId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null &&
                       request.auth.uid == request.resource.data.authorId;
      allow update: if request.auth != null && (
        request.auth.uid == resource.data.authorId ||
        (request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['likes', 'commentsCount']))
      );
      allow delete: if request.auth != null &&
                       request.auth.uid == resource.data.authorId;

      match /comments/{commentId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null;
        allow delete: if request.auth != null &&
                         request.auth.uid == resource.data.userId;
      }
    }

    // Albums - TEMPORARY: Allow all authenticated users
    match /albums/{albumId} {
      allow read, create, update, delete: if request.auth != null;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### **Step 3: Publish**
Click the orange "Publish" button

### **Step 4: Test**
- Refresh your app (Cmd+Shift+R)
- Try creating an album - **it should work now!** ✅

---

## ⚠️ **Important:**

These are **TEMPORARY** rules that allow any authenticated user to create/edit/delete any album (for testing purposes).

**After you verify albums work:**
1. We'll replace with the proper secure rules
2. The secure rules will restrict based on `createdBy` and `members` fields

---

## ✅ **What This Does:**

- Allows you to test album creation RIGHT NOW
- You can verify the UI, modal scrolling, search, etc.
- Once working, we'll add proper security back

**Try it now and let me know if albums work!** 🚀
