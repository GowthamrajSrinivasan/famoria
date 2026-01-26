# Debug Guide: Gallery vs Album Decryption Issue

## What We Added

We've enhanced the logging in three key files to help identify why image decryption works in the Album screen but not in the Gallery screen:

### 1. **PhotoCard.tsx** - Enhanced Image Decryption Logging
- Logs critical flags: `isEncrypted`, `albumId`, `hasFamilyKey`
- Shows whether decryption will be **skipped** or **proceed**
- Displays encrypted metadata availability

### 2. **App.tsx** - Gallery Screen Post Metadata Logging
- Logs post data **BEFORE** metadata decryption
- Logs **AFTER successful** metadata decryption
- Logs **AFTER failed** metadata decryption (returns original)
- Shows total posts received and processed

### 3. **AlbumView.tsx** - Album Screen Post Metadata Logging
- Same logging as Gallery for comparison
- Includes a NOTE that it doesn't set `isEncrypted=true` explicitly

---

## How to Test

### Step 1: Open Browser Console
1. Open your app in Chrome/Firefox
2. Press **F12** to open DevTools
3. Go to **Console** tab
4. Clear the console (🚫 icon or Ctrl+L)

### Step 2: Test Gallery Screen
1. Navigate to **Gallery** view
2. Watch the console for logs with `[App/Gallery]` prefix
3. Look for posts with these patterns:

**✅ Working Post Pattern:**
```
[App/Gallery] 🔍 Post abc123 BEFORE decrypt:
  isEncrypted: true (or undefined)
  albumId: "someAlbumId"
  hasEncryptedMetadata: true
  
[App/Gallery] ✅ Post abc123 AFTER decrypt SUCCESS:
  isEncrypted: true ← SET BY GALLERY
  albumId: "someAlbumId"
  
[PhotoCard] 🔍 Rendering item abc123:
  isEncrypted: true
  albumId: "someAlbumId"
  willProceedToDecrypt: true ← SHOULD BE TRUE
```

**❌ Broken Post Pattern:**
```
[App/Gallery] 🔍 Post xyz789 BEFORE decrypt:
  isEncrypted: false (or undefined)
  albumId: undefined (or missing)
  hasEncryptedMetadata: false
  
[App/Gallery] ⏭️ Skipping metadata decrypt for xyz789
  
[PhotoCard] 🔍 Rendering item xyz789:
  isEncrypted: false
  albumId: undefined
  willSkipDecryption: true ← THIS IS THE PROBLEM!
```

### Step 3: Test Album Screen
1. Navigate to **Album** view
2. Open the same album that has the problematic images
3. Look for logs with `[AlbumView]` prefix
4. Compare the **SAME post ID** between Gallery and Album:

**Expected in Album:**
```
[AlbumView] 🔍 Post xyz789 BEFORE decrypt:
  isEncrypted: true
  albumId: "someAlbumId"
  
[AlbumView] ✅ Post xyz789 AFTER decrypt SUCCESS:
  isEncrypted: true ← PRESERVED FROM ORIGINAL
  NOTE: 'NOT setting isEncrypted=true explicitly'
  
[PhotoCard] 🔍 Rendering item xyz789:
  isEncrypted: true
  willProceedToDecrypt: true ← WORKS!
```

---

## What to Look For

### Key Diagnostic Questions

1. **Is `isEncrypted` different between Gallery and Album for the same post?**
   - Gallery might have `false` or `undefined`
   - Album might have `true`

2. **Is `albumId` missing in Gallery but present in Album?**
   - This would cause immediate skip (Line 78 in PhotoCard)

3. **Is metadata decryption failing in Gallery?**
   - Look for `❌ Failed to decrypt post` messages
   - Check if it's returning the original post with bad flags

4. **Are posts missing `encryptedMetadata` in Gallery?**
   - If `hasEncryptedMetadata: false`, metadata won't be decrypted
   - Original `isEncrypted` flag will be preserved (might be `false`)

---

## Common Issues & Solutions

### Issue 1: `isEncrypted: false` in Gallery
**Symptom:**
```
[PhotoCard] willSkipDecryption: true
```

**Cause:** Posts in your database have `isEncrypted: false` set explicitly

**Solution:** Fix in `App.tsx` line 212:
```typescript
} catch (err) {
  console.error(`[App/Gallery] Failed to decrypt post ${post.id}:`, err);
  return {
    ...post,
    isEncrypted: true, // ← Force it to true
  };
}
```

### Issue 2: Missing `albumId` in Gallery
**Symptom:**
```
[PhotoCard] albumId: undefined
[PhotoCard] willSkipDecryption: true
```

**Cause:** `subscribeToPostsFeed` doesn't include `albumId` properly

**Solution:** Check `photoService.ts` - the query might need to join album data

### Issue 3: Different Metadata Between Screens
**Symptom:**
```
[App/Gallery] hasEncryptedMetadata: false
[AlbumView] hasEncryptedMetadata: true
```

**Cause:** Different Firestore queries returning different fields

**Solution:** Check `photoService.subscribeToPostsFeed()` vs `photoService.subscribeToAlbumPosts()`

---

## What Data to Share

If you need help after testing, please share:

1. **Console logs** for the **same post ID** in both screens
2. **Full log output** from `[PhotoCard]` showing `willSkipDecryption` status
3. **Screenshots** of the console showing the issue
4. **Firestore document** of the problematic post (redact sensitive data)

Example format:
```
Post ID: abc123xyz

=== GALLERY SCREEN ===
[App/Gallery] Post abc123xyz BEFORE: { isEncrypted: false, albumId: undefined }
[PhotoCard] willSkipDecryption: true

=== ALBUM SCREEN ===  
[AlbumView] Post abc123xyz BEFORE: { isEncrypted: true, albumId: "album456" }
[PhotoCard] willProceedToDecrypt: true
```

---

## Next Steps

1. **Test both screens** and collect console output
2. **Identify the pattern** - which flag is problematic?
3. **Apply the appropriate fix** from the solutions above
4. **Verify** the fix works in both screens
5. **(Optional)** Remove debug logging once fixed

---

## Quick Fix Reference

### If isEncrypted is the problem:
**File:** `App.tsx` around line 212  
**Change:** Always set `isEncrypted: true` after metadata decryption OR on error

### If albumId is the problem:
**File:** `services/photoService.ts`  
**Change:** Ensure `subscribeToPostsFeed` includes `albumId` field

### If both are fine but still failing:
**File:** `PhotoCard.tsx` line 78  
**Change:** Make decryption condition more lenient - prioritize `albumId` over `isEncrypted`

---

Good luck! 🔍
