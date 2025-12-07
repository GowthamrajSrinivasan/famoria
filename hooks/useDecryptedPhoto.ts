import { useState, useEffect } from 'react';
import { securePhotoService } from '../services/securePhotoService';

/**
 * Hook to decrypt and display encrypted photos
 *
 * Handles both encrypted and unencrypted photo URLs:
 * - If URL starts with "encrypted://", decrypts the photo
 * - If URL is a regular URL or base64, returns it as-is
 * - Automatically cleans up object URLs on unmount
 *
 * @param photoUrl - The photo URL (can be "encrypted://photoId", regular URL, or base64)
 * @param photoId - Optional photo ID (used if photoUrl doesn't start with encrypted://)
 * @returns Object with decrypted URL, loading state, and error
 */
export const useDecryptedPhoto = (photoUrl: string, photoId?: string) => {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isMounted = true;

    const loadPhoto = async () => {
      try {
        // Check if photo is encrypted
        const isEncrypted = photoUrl.startsWith('encrypted://');

        if (!isEncrypted) {
          // Photo is not encrypted, use URL as-is
          if (isMounted) {
            setDecryptedUrl(photoUrl);
            setLoading(false);
          }
          return;
        }

        // Photo is encrypted, decrypt it
        setLoading(true);
        setError(null);

        // Extract photo ID from URL
        const extractedPhotoId = photoUrl.replace('encrypted://', '');
        const photoIdToUse = extractedPhotoId || photoId;

        if (!photoIdToUse) {
          throw new Error('Photo ID is required for encrypted photos');
        }

        // Download and decrypt photo
        const result = await securePhotoService.downloadPhoto(photoIdToUse);

        if (isMounted) {
          objectUrl = result.url;
          setDecryptedUrl(result.url);
          setLoading(false);
        } else {
          // Component unmounted, clean up immediately
          URL.revokeObjectURL(result.url);
        }
      } catch (err) {
        console.error('Failed to decrypt photo:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to decrypt photo'));
          setLoading(false);
        }
      }
    };

    loadPhoto();

    // Cleanup function
    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [photoUrl, photoId]);

  return { url: decryptedUrl, loading, error };
};

/**
 * Hook to decrypt photo thumbnail
 *
 * Similar to useDecryptedPhoto but specifically for thumbnails.
 * Falls back to full photo if thumbnail is not available.
 *
 * @param photoUrl - The photo URL
 * @param photoId - Optional photo ID
 * @returns Object with decrypted thumbnail URL, loading state, and error
 */
export const useDecryptedThumbnail = (photoUrl: string, photoId?: string) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isMounted = true;

    const loadThumbnail = async () => {
      try {
        // Check if photo is encrypted
        const isEncrypted = photoUrl.startsWith('encrypted://');

        if (!isEncrypted) {
          // Photo is not encrypted, use URL as-is
          if (isMounted) {
            setThumbnailUrl(photoUrl);
            setLoading(false);
          }
          return;
        }

        // Photo is encrypted, decrypt thumbnail
        setLoading(true);
        setError(null);

        // Extract photo ID from URL
        const extractedPhotoId = photoUrl.replace('encrypted://', '');
        const photoIdToUse = extractedPhotoId || photoId;

        if (!photoIdToUse) {
          throw new Error('Photo ID is required for encrypted photos');
        }

        // Download and decrypt thumbnail
        const result = await securePhotoService.downloadThumbnail(photoIdToUse);

        if (isMounted) {
          objectUrl = result.url;
          setThumbnailUrl(result.url);
          setLoading(false);
        } else {
          // Component unmounted, clean up immediately
          URL.revokeObjectURL(result.url);
        }
      } catch (err) {
        console.error('Failed to decrypt thumbnail:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to decrypt thumbnail'));
          setLoading(false);
        }
      }
    };

    loadThumbnail();

    // Cleanup function
    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [photoUrl, photoId]);

  return { url: thumbnailUrl, loading, error };
};
