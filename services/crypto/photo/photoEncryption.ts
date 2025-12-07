/**
 * Photo Encryption Service
 *
 * Encrypts photos before upload with:
 * - EXIF metadata stripping
 * - Thumbnail generation
 * - AES-256-GCM encryption
 *
 * @module Photo/PhotoEncryption
 */

import piexif from 'piexifjs';
import {
  encryptAES256GCM,
  decryptAES256GCM,
  wipeMemory,
} from '../core/cryptoCore';
import {
  PhotoMetadata,
  EncryptedPhoto,
  ImageDimensions,
  ThumbnailOptions,
  PhotoError,
  PhotoErrorCode,
  MAX_PHOTO_SIZE,
  DEFAULT_THUMBNAIL_SIZE,
  DEFAULT_THUMBNAIL_QUALITY,
  SUPPORTED_FORMATS,
} from '../../../src/types/photo';
import { auth } from '../../../lib/firebase';

// ============================================================================
// PHOTO ENCRYPTION
// ============================================================================

/**
 * Encrypt photo before upload
 *
 * Complete photo processing pipeline:
 * 1. Read file
 * 2. Validate format and size
 * 3. Strip EXIF metadata
 * 4. Extract dimensions
 * 5. Generate thumbnail
 * 6. Encrypt original
 * 7. Encrypt thumbnail
 * 8. Encrypt metadata
 *
 * @param photoFile - Photo file to encrypt
 * @param albumId - Album ID
 * @param albumKey - Album encryption key
 * @returns Encrypted photo ready for upload
 *
 * @example
 * const encryptedPhoto = await encryptPhoto(file, 'album_123', albumKey);
 * await uploadEncryptedPhoto(encryptedPhoto);
 */
export async function encryptPhoto(
  photoFile: File,
  albumId: string,
  albumKey: CryptoKey
): Promise<EncryptedPhoto> {
  if (!auth.currentUser) {
    throw new PhotoError(
      'User not authenticated',
      PhotoErrorCode.ACCESS_DENIED
    );
  }

  try {
    // Validate file
    validatePhotoFile(photoFile);

    const photoId = generatePhotoId();

    // Step 1: Read file
    const arrayBuffer = await photoFile.arrayBuffer();
    const photoData = new Uint8Array(arrayBuffer);

    // Step 2: Strip EXIF data
    const strippedPhoto = await stripEXIF(photoData, photoFile.type);

    // Step 3: Get image dimensions
    const dimensions = await getImageDimensions(strippedPhoto, photoFile.type);

    // Step 4: Extract metadata (without EXIF)
    const metadata: PhotoMetadata = {
      originalName: photoFile.name,
      mimeType: photoFile.type,
      size: strippedPhoto.length,
      width: dimensions.width,
      height: dimensions.height,
      capturedAt: photoFile.lastModified,
      uploadedAt: Date.now(),
      uploadedBy: auth.currentUser.uid,
    };

    // Step 5: Generate thumbnail
    const thumbnail = await generateThumbnail(strippedPhoto, photoFile.type, {
      maxSize: DEFAULT_THUMBNAIL_SIZE,
      quality: DEFAULT_THUMBNAIL_QUALITY,
    });

    // Step 6: Encrypt original photo
    const encryptedPhoto = await encryptAES256GCM(strippedPhoto, albumKey);

    // Step 7: Encrypt thumbnail
    const encryptedThumbnail = await encryptAES256GCM(thumbnail, albumKey);

    // Step 8: Encrypt metadata
    const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
    const encryptedMetadata = await encryptAES256GCM(metadataBytes, albumKey);

    // Step 9: Create blobs for upload
    const photoBlob = new Blob([encryptedPhoto.ciphertext], {
      type: 'application/octet-stream',
    });

    const thumbnailBlob = new Blob([encryptedThumbnail.ciphertext], {
      type: 'application/octet-stream',
    });

    // Clean up sensitive data
    wipeMemory(photoData);
    wipeMemory(strippedPhoto);
    wipeMemory(thumbnail);
    wipeMemory(metadataBytes);

    return {
      photoId,
      albumId,
      encryptedBlob: photoBlob,
      encryptedThumbnail: thumbnailBlob,
      encryptedMetadata,
      iv: encryptedPhoto.iv,
      thumbnailIv: encryptedThumbnail.iv,
      metadataIv: encryptedMetadata.iv,
      authTag: encryptedPhoto.authTag,
      thumbnailAuthTag: encryptedThumbnail.authTag,
      size: photoBlob.size,
    };
  } catch (error) {
    if (error instanceof PhotoError) {
      throw error;
    }
    throw new PhotoError(
      'Failed to encrypt photo',
      PhotoErrorCode.ENCRYPTION_FAILED,
      error
    );
  }
}

// ============================================================================
// PHOTO DECRYPTION
// ============================================================================

/**
 * Decrypt photo after download
 *
 * @param encryptedBlob - Encrypted photo blob
 * @param iv - Initialization vector
 * @param authTag - Authentication tag
 * @param albumKey - Album decryption key
 * @returns Decrypted photo data
 *
 * @example
 * const photoData = await decryptPhoto(blob, iv, authTag, albumKey);
 * const url = URL.createObjectURL(new Blob([photoData], { type: 'image/jpeg' }));
 */
export async function decryptPhoto(
  encryptedBlob: Blob,
  iv: Uint8Array,
  authTag: Uint8Array,
  albumKey: CryptoKey
): Promise<Uint8Array> {
  try {
    const arrayBuffer = await encryptedBlob.arrayBuffer();
    const ciphertext = new Uint8Array(arrayBuffer);

    const decrypted = await decryptAES256GCM(
      {
        ciphertext,
        iv,
        authTag,
      },
      albumKey
    );

    return decrypted;
  } catch (error) {
    throw new PhotoError(
      'Failed to decrypt photo',
      PhotoErrorCode.DECRYPTION_FAILED,
      error
    );
  }
}

/**
 * Decrypt photo metadata
 *
 * @param encryptedMetadata - Encrypted metadata
 * @param iv - Initialization vector
 * @param authTag - Authentication tag
 * @param albumKey - Album key
 * @returns Decrypted metadata
 */
export async function decryptPhotoMetadata(
  encryptedMetadata: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  albumKey: CryptoKey
): Promise<PhotoMetadata> {
  try {
    const decrypted = await decryptAES256GCM(
      {
        ciphertext: encryptedMetadata,
        iv,
        authTag,
      },
      albumKey
    );

    const metadataJson = new TextDecoder().decode(decrypted);
    const metadata = JSON.parse(metadataJson) as PhotoMetadata;

    wipeMemory(decrypted);

    return metadata;
  } catch (error) {
    throw new PhotoError(
      'Failed to decrypt metadata',
      PhotoErrorCode.DECRYPTION_FAILED,
      error
    );
  }
}

// ============================================================================
// EXIF STRIPPING
// ============================================================================

/**
 * Strip EXIF metadata from photo
 *
 * Removes all EXIF data including:
 * - GPS coordinates
 * - Camera make/model
 * - Photo settings
 * - Date/time
 * - Software info
 *
 * @param photoData - Photo bytes
 * @param mimeType - Image MIME type
 * @returns Photo with EXIF removed
 */
export async function stripEXIF(
  photoData: Uint8Array,
  mimeType: string
): Promise<Uint8Array> {
  try {
    // Only JPEG/JPG have EXIF data
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      // Convert to base64 data URL (handle large arrays safely)
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < photoData.length; i += chunkSize) {
        const chunk = photoData.slice(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const dataURL = `data:${mimeType};base64,${btoa(binary)}`;

      // Remove EXIF data
      const stripped = piexif.remove(dataURL);

      // Convert back to Uint8Array
      const base64 = stripped.split(',')[1];
      const decodedBinary = atob(base64);
      return new Uint8Array(decodedBinary.split('').map(c => c.charCodeAt(0)));
    }

    // Other formats don't have EXIF, return as-is
    return photoData;
  } catch (error) {
    throw new PhotoError(
      'Failed to strip EXIF metadata',
      PhotoErrorCode.EXIF_STRIP_FAILED,
      error
    );
  }
}

// ============================================================================
// IMAGE PROCESSING
// ============================================================================

/**
 * Get image dimensions without rendering
 *
 * @param photoData - Photo bytes
 * @param mimeType - Image MIME type
 * @returns Width and height
 */
export async function getImageDimensions(
  photoData: Uint8Array,
  mimeType: string
): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([photoData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new PhotoError(
          'Failed to load image for dimensions',
          PhotoErrorCode.INVALID_FORMAT
        )
      );
    };

    img.src = url;
  });
}

/**
 * Generate thumbnail
 *
 * Creates a resized version of the photo.
 * Maintains aspect ratio.
 *
 * @param photoData - Original photo bytes
 * @param mimeType - Image MIME type
 * @param options - Thumbnail options
 * @returns Thumbnail bytes
 */
export async function generateThumbnail(
  photoData: Uint8Array,
  mimeType: string,
  options: ThumbnailOptions
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([photoData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(
          new PhotoError(
            'Failed to get canvas context',
            PhotoErrorCode.THUMBNAIL_FAILED
          )
        );
        return;
      }

      // Calculate new dimensions (maintain aspect ratio)
      let { width, height } = img;
      if (width > height) {
        if (width > options.maxSize) {
          height = (height * options.maxSize) / width;
          width = options.maxSize;
        }
      } else {
        if (height > options.maxSize) {
          width = (width * options.maxSize) / height;
          height = options.maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        async (thumbnailBlob) => {
          if (!thumbnailBlob) {
            URL.revokeObjectURL(url);
            reject(
              new PhotoError(
                'Failed to generate thumbnail',
                PhotoErrorCode.THUMBNAIL_FAILED
              )
            );
            return;
          }

          const buffer = await thumbnailBlob.arrayBuffer();
          URL.revokeObjectURL(url);
          resolve(new Uint8Array(buffer));
        },
        options.format || mimeType,
        options.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new PhotoError(
          'Failed to load image for thumbnail',
          PhotoErrorCode.THUMBNAIL_FAILED
        )
      );
    };

    img.src = url;
  });
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate photo file
 *
 * Checks:
 * - File size (max 50MB)
 * - File format (JPEG, PNG, WebP, HEIC)
 *
 * @param file - Photo file
 * @throws {PhotoError} If validation fails
 */
function validatePhotoFile(file: File): void {
  // Check size
  if (file.size > MAX_PHOTO_SIZE) {
    throw new PhotoError(
      `Photo too large (max ${MAX_PHOTO_SIZE / 1024 / 1024}MB)`,
      PhotoErrorCode.FILE_TOO_LARGE
    );
  }

  // Check format
  if (!SUPPORTED_FORMATS.includes(file.type)) {
    throw new PhotoError(
      `Unsupported format: ${file.type}. Supported: ${SUPPORTED_FORMATS.join(', ')}`,
      PhotoErrorCode.INVALID_FORMAT
    );
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate unique photo ID
 */
function generatePhotoId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `photo_${timestamp}_${random}`;
}

/**
 * Create object URL for photo display
 *
 * @param photoData - Decrypted photo bytes
 * @param mimeType - Image MIME type
 * @returns Object URL
 */
export function createPhotoURL(photoData: Uint8Array, mimeType: string): string {
  const blob = new Blob([photoData], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Revoke object URL to free memory
 *
 * @param url - Object URL to revoke
 */
export function revokePhotoURL(url: string): void {
  URL.revokeObjectURL(url);
}
