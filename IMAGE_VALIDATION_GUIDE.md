# Image Upload Validation Guide

## 📱 Supported Devices & Formats

### Mobile Phones
- **iPhone**: HEIC/HEIF (native format), JPEG ✅
- **Android**: JPEG (most common), HEIC (newer devices) ✅

### Cameras
- **DSLR**: JPEG ✅
- **Mirrorless**: JPEG ✅
- **Point & Shoot**: JPEG, PNG ✅

## ✅ Validation Rules

### 1. File Size Limit: **20MB Maximum**

**Why this limit?**
- Accommodates high-quality DSLR JPEGs (typically 5-15MB)
- Allows modern smartphone photos (2-8MB)
- Prevents extremely slow uploads
- Ensures reasonable processing time for AI

**Typical file sizes:**
- iPhone HEIC: 2-5MB ✅
- iPhone JPEG: 3-8MB ✅
- Android JPEG: 2-6MB ✅
- DSLR JPEG: 5-15MB ✅
- DSLR RAW: 20-50MB ❌ (too large, not supported)

### 2. Supported Formats

**Allowed:**
- `image/jpeg` - JPEG/JPG ✅
- `image/png` - PNG ✅
- `image/heic` - HEIC (iPhone) ✅
- `image/heif` - HEIF (iPhone) ✅
- `image/webp` - WebP ✅

**Not Supported:**
- RAW formats (CR2, NEF, ARW, DNG) ❌
- GIF (animated) ❌
- BMP ❌
- TIFF ❌
- SVG ❌
- PSD (Photoshop) ❌

## 🚨 Error Messages

### 1. "Not an Image File"
**Trigger:** Non-image file uploaded
**User sees:**
> The file "document.pdf" is not an image.
> Please select a photo file (JPEG, PNG, or HEIC from your camera).

### 2. "Unsupported Image Format"
**Trigger:** Image in unsupported format (e.g., GIF, BMP, RAW)
**User sees:**
> GIF format is not supported.
> Please use photos from your phone or camera. Supported formats: JPEG, PNG, HEIC (iPhone photos).

**Example scenarios:**
- User uploads `.CR2` (Canon RAW): ❌ Format not supported
- User uploads `.gif`: ❌ Format not supported
- User uploads `.bmp`: ❌ Format not supported

### 3. "File Too Large"
**Trigger:** File exceeds 20MB
**User sees:**
> This photo is 25.3MB, which exceeds the 20MB limit.
> Try reducing the image quality in your camera settings, or use a photo editor to compress it.

**Common causes:**
- DSLR RAW files (convert to JPEG first)
- Uncompressed TIFF files
- Very high-resolution scans

### 4. "Invalid Image File"
**Trigger:** File smaller than 1KB (likely corrupted)
**User sees:**
> This file appears to be corrupted or incomplete.
> Please try selecting a different photo.

### 5. "AI Analysis Failed"
**Trigger:** Gemini API fails to analyze the image
**User sees:**
> Unable to analyze your photo automatically.
> The photo will still be uploaded, but you may need to add details manually. Try uploading a clearer photo for better results.

**What happens:**
- Photo can still be uploaded
- Default caption and tags provided
- User can edit details manually

### 6. "Upload Failed"
**Trigger:** Firebase Storage upload fails
**User sees:**
> Failed to upload photo. Please try again.

**Specific error scenarios:**

**Permission error:**
> You don't have permission to upload photos. Please sign in again.

**Network error:**
> Network error. Please check your internet connection and try again.

**Quota exceeded:**
> Storage limit reached. Please contact support.

## 🎯 Validation Flow

```
1. User selects file
   ↓
2. Check: Is it an image? (MIME type starts with 'image/')
   ❌ → Show "Not an Image File" error
   ↓
3. Check: Is format supported? (JPEG, PNG, HEIC, HEIF, WebP)
   ❌ → Show "Unsupported Image Format" error
   ↓
4. Check: Is size <= 20MB?
   ❌ → Show "File Too Large" error
   ↓
5. Check: Is size >= 1KB?
   ❌ → Show "Invalid Image File" error
   ↓
6. ✅ Load preview & run AI analysis
   ↓
7. AI Analysis
   ❌ → Show warning but allow upload with defaults
   ↓
8. User clicks "Save to Family Feed"
   ↓
9. Upload to Firebase Storage
   ❌ → Show "Upload Failed" error
   ↓
10. Save to Firestore
    ↓
11. ✅ Success! Photo added to feed
```

## 💡 User Instructions

### For iPhone Users:
✅ **Just use your Camera Roll photos - they work perfectly!**
- Photos are automatically in HEIC or JPEG format
- File sizes are optimized for sharing
- No additional steps needed

### For Android Users:
✅ **Camera photos work great!**
- Default JPEG format is fully supported
- Modern devices using HEIC are also supported
- No conversion needed

### For DSLR Users:
⚠️ **Use JPEG, not RAW:**
1. Set your camera to save JPEG (or JPEG + RAW)
2. For existing RAW files, convert to JPEG first using:
   - Adobe Lightroom
   - Capture One
   - Camera manufacturer software
3. Recommended JPEG quality: High (80-90%)
4. File size should be under 20MB

**If your JPEG is over 20MB:**
1. Reduce quality to 80% in your photo editor
2. OR resize to max 4000px width
3. This won't noticeably affect print or screen quality

## 🔧 Technical Implementation

### File Input (Uploader.tsx:203)
```tsx
<input
  type="file"
  accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp"
/>
```

### Validation Function (Uploader.tsx:52-92)
```tsx
const validateFile = (file: File): ValidationError | null => {
  // 1. Check MIME type
  if (!file.type.startsWith('image/')) { ... }

  // 2. Check format whitelist
  if (!ALLOWED_FORMATS.includes(file.type.toLowerCase())) { ... }

  // 3. Check size limits
  if (file.size > MAX_FILE_SIZE) { ... }
  if (file.size < 1024) { ... }

  return null; // Valid!
}
```

### Constants (Uploader.tsx:16-33)
```tsx
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp'
];
```

## 📊 Testing Checklist

- [ ] Upload iPhone HEIC photo (< 5MB) → ✅ Should work
- [ ] Upload Android JPEG photo (< 6MB) → ✅ Should work
- [ ] Upload DSLR JPEG photo (< 15MB) → ✅ Should work
- [ ] Upload PNG screenshot → ✅ Should work
- [ ] Upload 25MB file → ❌ Should show "File Too Large"
- [ ] Upload .CR2 RAW file → ❌ Should show "Unsupported Format"
- [ ] Upload .pdf document → ❌ Should show "Not an Image File"
- [ ] Upload .gif file → ❌ Should show "Unsupported Format"
- [ ] Upload corrupted/0-byte file → ❌ Should show "Invalid Image File"
- [ ] Upload while offline → ❌ Should show network error on save

## 🎨 UI Components

### Error Display (Uploader.tsx:215-234)
- Red background with border
- X icon indicator
- Bold error title
- Descriptive message
- Helpful suggestion
- "Try Again" button to dismiss

### Upload Area Info (Uploader.tsx:211)
Shows supported formats: "Supports JPEG, PNG, HEIC (max 20MB)"

## 🔄 Future Enhancements

### Potential Improvements:
1. **Automatic image compression** for files near 20MB limit
2. **Image dimension validation** (e.g., min 500px, max 8000px)
3. **Aspect ratio warnings** for extremely wide/tall images
4. **EXIF data preservation** for photo metadata
5. **RAW file conversion** (ambitious, would require server-side processing)
6. **Progress indicator** for large file uploads
7. **Drag & drop multiple files** at once
8. **Batch upload** capability

### Not Recommended:
- ❌ Supporting GIF (animated images not suitable for family photos)
- ❌ Supporting RAW (too large, requires conversion)
- ❌ Increasing limit beyond 20MB (performance concerns)
