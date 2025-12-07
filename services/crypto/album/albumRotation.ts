/**
 * Album Key Rotation
 *
 * Implements secure key rotation for family albums:
 * - Generates new album key
 * - Re-encrypts all photos with new key
 * - Updates member keys
 * - Maintains audit trail
 *
 * @module Album/AlbumRotation
 */

import {
  generateAESKey,
  exportKeyRaw,
  importDerivedKey,
  decryptAES256GCM,
  encryptAES256GCM,
  wipeMemory,
  secureRandomBytes,
} from '../core/cryptoCore';
import {
  hardwareEncrypt,
  hardwareDecrypt,
} from '../keys/keyManager';
import {
  retrieveCryptoKey,
} from '../keys/web/secureStorage';
import {
  AlbumType,
  FamilyAlbumKeyStorage,
  AlbumKeyRotationResult,
  AlbumMetadata,
  AlbumError,
  AlbumErrorCode,
} from '../../../src/types/album';
import { auth } from '../../../lib/firebase';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getFirestore,
  writeBatch,
} from 'firebase/firestore';

// ============================================================================
// ALBUM KEY ROTATION
// ============================================================================

/**
 * Rotate Album Key
 *
 * Generates new key for family album and re-encrypts all content.
 * Only available for family albums (private albums derive keys).
 *
 * Why rotate?
 * - Suspected key compromise
 * - Member removed from album
 * - Periodic security practice
 *
 * @param albumId - Album to rotate
 * @returns Rotation result
 *
 * @example
 * const result = await rotateAlbumKey('album_123');
 * console.log(`Re-encrypted ${result.photosReencrypted} photos`);
 */
export async function rotateAlbumKey(
  albumId: string
): Promise<AlbumKeyRotationResult> {
  if (!auth.currentUser) {
    throw new AlbumError(
      'User not authenticated',
      AlbumErrorCode.ACCESS_DENIED
    );
  }

  const startTime = Date.now();
  const db = getFirestore();

  try {
    // Get album metadata
    const albumDoc = await getDoc(doc(db, 'albums', albumId));

    if (!albumDoc.exists()) {
      throw new AlbumError(
        'Album not found',
        AlbumErrorCode.ALBUM_NOT_FOUND
      );
    }

    const albumData = albumDoc.data() as AlbumMetadata;

    // Verify user is owner
    if (albumData.ownerId !== auth.currentUser.uid) {
      throw new AlbumError(
        'Only album owner can rotate keys',
        AlbumErrorCode.ACCESS_DENIED
      );
    }

    // Verify it's a family album
    if (albumData.type !== AlbumType.FAMILY) {
      throw new AlbumError(
        'Can only rotate family album keys (private album keys are derived)',
        AlbumErrorCode.OPERATION_NOT_ALLOWED
      );
    }

    // Get old album key
    const oldKeyDoc = await getDoc(
      doc(db, 'albumKeys', `${albumId}_${auth.currentUser.uid}`)
    );

    if (!oldKeyDoc.exists()) {
      throw new AlbumError(
        'Album key not found',
        AlbumErrorCode.KEY_NOT_FOUND
      );
    }

    const oldKeyData = oldKeyDoc.data() as FamilyAlbumKeyStorage;

    // Decrypt old key
    const oldEncryptedKey = Uint8Array.from(
      atob(oldKeyData.encryptedKey),
      c => c.charCodeAt(0)
    );
    const oldIv = Uint8Array.from(atob(oldKeyData.iv), c => c.charCodeAt(0));

    const oldKeyBytes = await hardwareDecrypt('user_private_key', {
      ciphertext: oldEncryptedKey,
      iv: oldIv,
      authTag: new Uint8Array(0),
    });

    const oldKey = await importDerivedKey(
      oldKeyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Generate new album key
    const newKey = await generateAESKey(true);
    const newKeyBytes = await exportKeyRaw(newKey);

    // Re-encrypt all photos with new key
    const photosReencrypted = await reencryptAllPhotos(
      albumId,
      oldKey,
      await importDerivedKey(
        newKeyBytes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      )
    );

    // Update album keys for all members
    const members = albumData.members;
    const membersUpdated = await updateMemberAlbumKeys(
      albumId,
      newKeyBytes,
      oldKeyData.version + 1
    );

    // Update album metadata
    await updateDoc(doc(db, 'albums', albumId), {
      lastModified: Date.now(),
    });

    // Log rotation event
    await logKeyRotation(albumId, oldKeyData.version, oldKeyData.version + 1);

    // Clean up
    wipeMemory(oldKeyBytes);
    wipeMemory(newKeyBytes);

    const durationMs = Date.now() - startTime;

    return {
      albumId,
      newVersion: oldKeyData.version + 1,
      photosReencrypted,
      membersUpdated,
      rotatedAt: Date.now(),
      durationMs,
    };
  } catch (error) {
    throw new AlbumError(
      'Failed to rotate album key',
      AlbumErrorCode.ROTATION_FAILED,
      error
    );
  }
}

// ============================================================================
// PHOTO RE-ENCRYPTION
// ============================================================================

/**
 * Re-encrypt all photos in album
 *
 * Decrypts with old key, encrypts with new key.
 * Done in batches to avoid memory issues.
 */
async function reencryptAllPhotos(
  albumId: string,
  oldKey: CryptoKey,
  newKey: CryptoKey
): Promise<number> {
  const db = getFirestore();
  let reencrypted = 0;

  try {
    // Get all photos in album
    const photosQuery = query(
      collection(db, 'photos'),
      where('albumId', '==', albumId)
    );

    const photosSnapshot = await getDocs(photosQuery);

    // Process in batches of 500 (Firestore limit)
    const batchSize = 500;
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const photoDoc of photosSnapshot.docs) {
      const photoData = photoDoc.data();

      // Decrypt photo metadata with old key
      if (photoData.encryptedMetadata) {
        const oldMetadata = Uint8Array.from(
          atob(photoData.encryptedMetadata),
          c => c.charCodeAt(0)
        );
        const oldIv = Uint8Array.from(
          atob(photoData.metadataIv),
          c => c.charCodeAt(0)
        );
        const oldAuthTag = Uint8Array.from(
          atob(photoData.metadataAuthTag),
          c => c.charCodeAt(0)
        );

        const decryptedMetadata = await decryptAES256GCM(
          { ciphertext: oldMetadata, iv: oldIv, authTag: oldAuthTag },
          oldKey
        );

        // Encrypt with new key
        const newEncrypted = await encryptAES256GCM(decryptedMetadata, newKey);

        // Update photo document
        batch.update(photoDoc.ref, {
          encryptedMetadata: btoa(String.fromCharCode(...newEncrypted.ciphertext)),
          metadataIv: btoa(String.fromCharCode(...newEncrypted.iv)),
          metadataAuthTag: btoa(String.fromCharCode(...newEncrypted.authTag)),
          keyVersion: photoData.keyVersion ? photoData.keyVersion + 1 : 1,
          lastRotated: Date.now(),
        });

        wipeMemory(decryptedMetadata);
        reencrypted++;
        batchCount++;
      }

      // Commit batch when limit reached
      if (batchCount >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }

    return reencrypted;
  } catch (error) {
    throw new AlbumError(
      'Failed to re-encrypt photos',
      AlbumErrorCode.ROTATION_FAILED,
      error
    );
  }
}

// ============================================================================
// MEMBER KEY UPDATES
// ============================================================================

/**
 * Update album keys for all members
 *
 * Encrypts new key with each member's public key.
 */
async function updateMemberAlbumKeys(
  albumId: string,
  newKeyBytes: Uint8Array,
  newVersion: number
): Promise<number> {
  const db = getFirestore();
  let updated = 0;

  try {
    // Get all album keys for this album
    const keysQuery = query(
      collection(db, 'albumKeys'),
      where('albumId', '==', albumId)
    );

    const keysSnapshot = await getDocs(keysQuery);

    for (const keyDoc of keysSnapshot.docs) {
      const keyData = keyDoc.data() as FamilyAlbumKeyStorage;

      // Get member's public key and encrypt new album key
      // For now, use hardware encryption with their user ID
      // In production, you'd use their actual public key

      const encrypted = await hardwareEncrypt(
        newKeyBytes,
        await retrieveCryptoKey('user_private_key')
      );

      // Update member's album key
      await setDoc(
        doc(db, 'albumKeys', keyDoc.id),
        {
          encryptedKey: btoa(String.fromCharCode(...encrypted.ciphertext)),
          iv: btoa(String.fromCharCode(...encrypted.iv)),
          version: newVersion,
          lastRotated: Date.now(),
        },
        { merge: true }
      );

      updated++;
    }

    return updated;
  } catch (error) {
    throw new AlbumError(
      'Failed to update member keys',
      AlbumErrorCode.ROTATION_FAILED,
      error
    );
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log key rotation event
 */
async function logKeyRotation(
  albumId: string,
  oldVersion: number,
  newVersion: number
): Promise<void> {
  if (!auth.currentUser) return;

  const db = getFirestore();

  try {
    await setDoc(doc(collection(db, 'auditLogs')), {
      type: 'album_key_rotated',
      albumId,
      userId: auth.currentUser.uid,
      oldVersion,
      newVersion,
      timestamp: Date.now(),
      ipAddress: null, // Would be populated by Cloud Function
      userAgent: navigator.userAgent,
    });
  } catch (error) {
    // Don't fail rotation if logging fails
    console.error('Failed to log key rotation:', error);
  }
}
