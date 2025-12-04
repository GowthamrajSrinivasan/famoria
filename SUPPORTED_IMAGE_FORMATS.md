# Supported Image Formats for AI Edits

## ✅ Supported Image Formats

Based on the current code and Gemini API capabilities:

### Fully Supported:
- **JPEG/JPG** (.jpg, .jpeg) - ✅ Recommended
- **PNG** (.png) - ✅ Recommended
- **WebP** (.webp) - ✅ Modern format
- **HEIC/HEIF** (.heic, .heif) - ✅ iPhone photos

### Also Accepted:
- **GIF** (.gif) - Only first frame processed
- **BMP** (.bmp) - Works but not optimized
- **SVG** (.svg) - May work but not recommended for photos

## ❌ Not Supported / Will Throw Errors

### Will Be Rejected:
1. **Non-image files**
   - PDFs, videos, documents
   - Validation: `file.type.startsWith('image/')` (Uploader.tsx:26)
   - Error: File silently rejected (no upload happens)

2. **Corrupted images**
   - Partially downloaded files
   - Invalid file headers
   - Error: "Could not process image URL. Please try uploading a file directly."

### May Cause Issues:
1. **Very large files** (>10MB recommended limit)
   - No explicit size validation currently
   - May timeout or fail with Gemini API
   - Error: Network timeout or API error

2. **Exotic formats**
   - TIFF, RAW, PSD
   - May fail at API level
   - Error: Gemini API rejection

3. **Animated images**
   - Animated GIFs, animated PNGs
   - Only first frame will be processed
   - Not technically an error, but unexpected behavior

## Current Validation Flow

### Step 1: File Input (Uploader.tsx:124)
```tsx
<input accept="image/*" />
```
Browser allows selection of any image format.

### Step 2: Type Check (Uploader.tsx:26)
```tsx
if (!file.type.startsWith('image/')) return;
```
Only files with image MIME type proceed.

### Step 3: Base64 Conversion (Uploader.tsx:29-35)
```tsx
const reader = new FileReader();
reader.readAsDataURL(file);
```
Converts to Base64 data URI.

### Step 4: Gemini Processing (geminiService.ts:24-54)
```tsx
prepareImagePart(input)
```
- Extracts MIME type from data URI
- Defaults to "image/jpeg" if unknown
- Sends to Gemini API

### Step 5: API Validation
Gemini API validates:
- Format compatibility
- File size (API limits)
- Content safety (no inappropriate content)

## Recommendations

### For Best Results:
1. ✅ Use JPEG or PNG (< 5MB)
2. ✅ Standard aspect ratios (1:1, 4:3, 16:9)
3. ✅ Resolution: 500px - 4000px width
4. ✅ Well-lit, clear photos

### To Avoid Errors:
1. ❌ Don't upload files > 10MB
2. ❌ Avoid exotic/proprietary formats
3. ❌ Don't use corrupted/partial downloads
4. ❌ Avoid extremely high resolutions (> 8000px)

## Error Messages & Meanings

### "Could not process image URL"
- Cause: Remote URL fetch failed or corrupted data
- Solution: Upload the file directly instead

### "Empty response from Gemini"
- Cause: API returned no data
- Solution: Check API key, try different image

### "AI returned text instead of an image"
- Cause: Gemini refused to process (safety/policy)
- Solution: Check image content, try different prompt

### "No edited image returned by Gemini"
- Cause: API didn't return image data
- Solution: Simplify edit prompt, try again

## Improvements Needed

### Current Gaps:
1. **No file size validation** before upload
2. **No progress indicator** for large files
3. **No explicit format validation** beyond MIME type
4. **No resolution/dimension checks**

### Recommended Additions:
```tsx
// Add size check
if (file.size > 10 * 1024 * 1024) {
  alert('File too large. Please use images under 10MB.');
  return;
}

// Add format whitelist
const allowedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
if (!allowedFormats.includes(file.type)) {
  alert('Format not supported. Please use JPEG, PNG, WebP, or HEIC.');
  return;
}
```
