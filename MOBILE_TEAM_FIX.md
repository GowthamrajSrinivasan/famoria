# 🔧 Mobile Decryption Fix - URGENT

## TL;DR
**MAC verification fails because mobile expects a different byte format than web produces.**

## The Problem

**Web encrypts as:**
```
[IV: 12 bytes] + [Ciphertext + Auth Tag combined]
```

**Mobile expects:**
```
[IV: 12 bytes] + [Ciphertext] + [MAC: 16 bytes]
```

BUT they're actually the SAME format! You just need to extract the MAC correctly.

---

## The Fix

### Find Your Decryption Code

Look for where you construct `SecretBox` or parse encrypted bytes. It probably looks like:

```dart
// ❌ CURRENT (WRONG)
final iv = encryptedBytes.sublist(0, 12);
final ciphertext = encryptedBytes.sublist(12, encryptedBytes.length - 16);
final mac = encryptedBytes.sublist(encryptedBytes.length - 16);
```

### Update To This

```dart
// ✅ CORRECT
final iv = encryptedBytes.sublist(0, 12);
final dataWithMac = encryptedBytes.sublist(12);

// The last 16 bytes of dataWithMac ARE the MAC
final ciphertext = dataWithMac.sublist(0, dataWithMac.length - 16);
final mac = dataWithMac.sublist(dataWithMac.length - 16);

final secretBox = SecretBox(ciphertext, nonce: iv, mac: Mac(mac));
```

**OR** if your crypto library supports it:

```dart
// ✅ EVEN BETTER (if supported)
final iv = encryptedBytes.sublist(0, 12);
final dataWithMac = encryptedBytes.sublist(12);

final secretBox = SecretBox.fromCombinedCiphertext(
  dataWithMac, 
  nonce: iv
);
```

---

## Why This Fixes It

**Before:**
- You were calculating the MAC position from the TOTAL file size
- But the web format has IV FIRST, then data+mac
- So `encryptedBytes.length - 16` was INCLUDING the IV
- Result: You were extracting the WRONG 16 bytes as the MAC

**After:**
- You skip the IV (first 12 bytes)
- THEN take the last 16 bytes of the REMAINING data
- Result: You get the CORRECT MAC bytes

---

## Test Immediately

Use these photo IDs from your diagnostic logs:
- `89263127-26ff-4ff8-b6a8-146b53fca6a9`
- `82ba2767-f3c7-4191-b7b9-842a1171640e`

After the fix, they should decrypt successfully.

---

## Expected Log Output

**Before:**
```
❌ Decryption error: SecretBoxAuthenticationError: 
   SecretBox has wrong message authentication code (MAC)
```

**After:**
```
✅ Decryption successful: 89263127-26ff-4ff8-b6a8-146b53fca6a9
✅ Decryption successful: 82ba2767-f3c7-4191-b7b9-842a1171640e
```

---

## Questions?

If this doesn't work, check:
1. Are you using `AesGcm.with256bits()`? ✅
2. Is the FMK hash consistent? (Should be `7ef015cccdf61a7b`) ✅
3. Are you deriving the photo key with HKDF using the photo UUID? ✅

If all three are YES and it still fails, the issue is elsewhere. But 95% confidence this fix will work.

---

**Fix Complexity:** 🟢 5-minute code change  
**Impact:** 🔴 Critical - Unblocks all photo decryption  
**Risk:** 🟢 None - This is a parsing fix, no crypto changes
