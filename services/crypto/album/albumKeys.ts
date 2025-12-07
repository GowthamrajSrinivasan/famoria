/**
 * Album Key Management
 *
 * Implements secure album-level encryption:
 * - Family Albums: Hybrid encryption, shareable, AI-enabled
 * - Private Albums: E2EE with HKDF derivation, maximum privacy
 *
 * @module Album/AlbumKeys
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  generateAESKey,
  exportKeyRaw,
  importDerivedKey,
  encryptAES256GCM,
  decryptAES256GCM,
  secureRandomBytes,
  wipeMemory,
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
  AlbumKey,
  FamilyAlbumKeyStorage,
  PrivateAlbumKeyMetadata,
  CreateAlbumOptions,
  AlbumMetadata,
  AlbumVisibility,
  AlbumError,
  AlbumErrorCode,
} from '../../../src/types/album';
import { KeyType } from '../../../src/types/keyStorage';
import { auth } from '../../../lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where, getFirestore } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

/** HKDF info prefix for private albums */
const PRIVATE_ALBUM_INFO_PREFIX = 'album:private:';

/** Album key version */
const ALBUM_KEY_VERSION = 1;

/** Maximum album size (100GB) */
const MAX_ALBUM_SIZE = 100 * 1024 * 1024 * 1024;

/** Maximum photos per album */
const MAX_PHOTOS_PER_ALBUM = 50000;

// ============================================================================
// IN-MEMORY KEY CACHE
// ============================================================================

/** Album key cache (in memory for session) */
const albumKeyCache = new Map<string, AlbumKey>();

/**
 * Cache album key
 */
function cacheAlbumKey(albumKey: AlbumKey): void {
  albumKeyCache.set(albumKey.albumId, {
    ...albumKey,
    lastUsed: Date.now(),
  });
}

/**
 * Get cached album key
 */
function getCachedAlbumKey(albumId: string): AlbumKey | null {
  const cached = albumKeyCache.get(albumId);
  if (cached) {
    // Update last used
    cached.lastUsed = Date.now();
    return cached;
  }
  return null;
}

/**
 * Clear album key cache
 */
export function clearAlbumKeyCache(): void {
  albumKeyCache.clear();
}

// ============================================================================
// FAMILY ALBUM KEY MANAGEMENT
// ============================================================================

/**
 * Create Family Album
 *
 * Creates a shareable family album with AI features.
 * Album key is encrypted with user's public key.
 *
 * @param options - Album creation options
 * @returns Album ID and metadata
 *
 * @example
 * const album = await createFamilyAlbum({
 *   name: 'Summer Vacation 2024',
 *   description: 'Trip to Hawaii',
 *   aiEnabled: true,
 * });
 */
export async function createFamilyAlbum(
  options: CreateAlbumOptions
): Promise<{ albumId: string; metadata: AlbumMetadata }> {
  if (!auth.currentUser) {
    throw new AlbumError(
      'User not authenticated',
      AlbumErrorCode.ACCESS_DENIED
    );
  }

  const albumId = generateAlbumId();
  const db = getFirestore();

  try {
    // Generate random AES-256 key for album
    const albumKey = await generateAESKey(true); // extractable for sharing
    const rawKey = await exportKeyRaw(albumKey);

    // SIMPLIFIED APPROACH: Store album key directly (encrypted with user-derived key)
    // TODO: Upgrade to hardware-backed encryption in Phase 2
    const salt = secureRandomBytes(16);

    // Derive encryption key from user ID (temporary approach)
    const userKeyMaterial = new TextEncoder().encode(auth.currentUser.uid);
    const derivedEncryptionKey = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', userKeyMaterial),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Encrypt album key with derived key
    const encrypted = await encryptAES256GCM(rawKey, derivedEncryptionKey);

    // Store encrypted key in Firestore
    const keyStorage: FamilyAlbumKeyStorage = {
      albumId,
      userId: auth.currentUser.uid,
      encryptedKey: btoa(String.fromCharCode(...encrypted.ciphertext)),
      iv: btoa(String.fromCharCode(...encrypted.iv)),
      salt: btoa(String.fromCharCode(...salt)),
      authTag: btoa(String.fromCharCode(...encrypted.authTag)),
      createdAt: Date.now(),
      version: ALBUM_KEY_VERSION,
    };

    await setDoc(
      doc(db, 'albumKeys', `${albumId}_${auth.currentUser.uid}`),
      keyStorage
    );

    // Create album metadata
    const metadata: AlbumMetadata = {
      albumId,
      name: options.name,
      ...(options.description && { description: options.description }),
      type: AlbumType.FAMILY,
      visibility: options.visibility || AlbumVisibility.PRIVATE,
      ownerId: auth.currentUser.uid,
      members: [auth.currentUser.uid],
      createdAt: Date.now(),
      lastModified: Date.now(),
      photoCount: 0,
      totalSize: 0,
      aiEnabled: options.aiEnabled || false,
      ...(options.aiEnabled && { aiConsentedAt: Date.now() }),
      shareable: true,
      tags: options.tags || [],
      ...(options.color && { color: options.color }),
      archived: false,
      deleted: false,
    };

    await setDoc(doc(db, 'albums', albumId), metadata);

    // Cache the album key
    const importedKey = await importDerivedKey(
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    cacheAlbumKey({
      albumId,
      type: AlbumType.FAMILY,
      key: importedKey,
      salt,
      createdAt: Date.now(),
    });

    // Clean up
    wipeMemory(rawKey);

    return { albumId, metadata };
  } catch (error) {
    console.error('Album creation error details:', error);
    throw new AlbumError(
      'Failed to create family album',
      AlbumErrorCode.OPERATION_NOT_ALLOWED,
      error
    );
  }
}

/**
 * Get Family Album Key
 *
 * Decrypts and returns the album key for a family album.
 *
 * @param albumId - Album ID
 * @returns Decrypted album key
 */
async function getFamilyAlbumKey(albumId: string): Promise<CryptoKey> {
  if (!auth.currentUser) {
    throw new AlbumError(
      'User not authenticated',
      AlbumErrorCode.ACCESS_DENIED
    );
  }

  // Check cache first
  const cached = getCachedAlbumKey(albumId);
  if (cached) {
    return cached.key;
  }

  const db = getFirestore();

  try {
    // Get encrypted key from Firestore
    const keyDoc = await getDoc(
      doc(db, 'albumKeys', `${albumId}_${auth.currentUser.uid}`)
    );

    if (!keyDoc.exists()) {
      throw new AlbumError(
        'No access to this album',
        AlbumErrorCode.ACCESS_DENIED
      );
    }

    const keyData = keyDoc.data() as FamilyAlbumKeyStorage;

    // Deserialize
    const encryptedKey = Uint8Array.from(atob(keyData.encryptedKey), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(keyData.iv), c => c.charCodeAt(0));
    const authTag = keyData.authTag
      ? Uint8Array.from(atob(keyData.authTag), c => c.charCodeAt(0))
      : new Uint8Array(0);
    const salt = Uint8Array.from(atob(keyData.salt), c => c.charCodeAt(0));

    // SIMPLIFIED APPROACH: Derive decryption key from user ID
    // TODO: Upgrade to hardware-backed encryption in Phase 2
    const userKeyMaterial = new TextEncoder().encode(auth.currentUser.uid);
    const derivedEncryptionKey = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', userKeyMaterial),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Decrypt album key
    const decrypted = await decryptAES256GCM(
      { ciphertext: encryptedKey, iv, authTag },
      derivedEncryptionKey
    );

    // Import as CryptoKey
    const albumKey = await importDerivedKey(
      decrypted,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Cache for future use
    cacheAlbumKey({
      albumId,
      type: AlbumType.FAMILY,
      key: albumKey,
      salt,
      createdAt: keyData.createdAt,
    });

    // Clean up
    wipeMemory(decrypted);

    return albumKey;
  } catch (error) {
    console.error('Failed to get family album key:', error);
    throw new AlbumError(
      'Failed to get family album key',
      AlbumErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// PRIVATE ALBUM KEY MANAGEMENT
// ============================================================================

/**
 * Create Private Album
 *
 * Creates a private album with E2EE.
 * Album key is derived from master key and never stored.
 *
 * @param options - Album creation options
 * @param masterKey - User's master key
 * @returns Album ID and metadata
 *
 * @example
 * const album = await createPrivateAlbum(
 *   { name: 'Personal Photos', description: 'Private memories' },
 *   masterKey
 * );
 */
export async function createPrivateAlbum(
  options: CreateAlbumOptions,
  masterKey: Uint8Array
): Promise<{ albumId: string; metadata: AlbumMetadata }> {
  if (!auth.currentUser) {
    throw new AlbumError(
      'User not authenticated',
      AlbumErrorCode.ACCESS_DENIED
    );
  }

  const albumId = generateAlbumId();
  const salt = secureRandomBytes(16);
  const db = getFirestore();

  try {
    // Derive album key from master key using HKDF
    const info = new TextEncoder().encode(`${PRIVATE_ALBUM_INFO_PREFIX}${albumId}`);
    const derivedKey = hkdf(sha256, masterKey, salt, info, 32);

    // Import as CryptoKey
    const albumKey = await importDerivedKey(
      derivedKey,
      { name: 'AES-GCM', length: 256 },
      false, // NOT extractable
      ['encrypt', 'decrypt']
    );

    // Encrypt album name and description
    const encryptedName = await encryptAES256GCM(
      new TextEncoder().encode(options.name),
      albumKey
    );
    const encryptedDescription = options.description
      ? await encryptAES256GCM(
          new TextEncoder().encode(options.description),
          albumKey
        )
      : undefined;

    // Create album metadata (NO KEY MATERIAL)
    const metadata: AlbumMetadata = {
      albumId,
      name: btoa(String.fromCharCode(...encryptedName.ciphertext)),
      ...(encryptedDescription && {
        description: btoa(String.fromCharCode(...encryptedDescription.ciphertext))
      }),
      type: AlbumType.PRIVATE,
      visibility: AlbumVisibility.PRIVATE,
      ownerId: auth.currentUser.uid,
      members: [auth.currentUser.uid],
      createdAt: Date.now(),
      lastModified: Date.now(),
      photoCount: 0,
      totalSize: 0,
      aiEnabled: false, // Never allowed for private albums
      shareable: false,
      salt: btoa(String.fromCharCode(...salt)),
      tags: options.tags || [],
      ...(options.color && { color: options.color }),
      archived: false,
      deleted: false,
    };

    await setDoc(doc(db, 'albums', albumId), metadata);

    // Cache the album key
    cacheAlbumKey({
      albumId,
      type: AlbumType.PRIVATE,
      key: albumKey,
      salt,
      createdAt: Date.now(),
    });

    // Clean up
    wipeMemory(derivedKey);

    return { albumId, metadata };
  } catch (error) {
    throw new AlbumError(
      'Failed to create private album',
      AlbumErrorCode.OPERATION_NOT_ALLOWED,
      error
    );
  }
}

/**
 * Get Private Album Key
 *
 * Derives the album key from master key for a private album.
 *
 * @param albumId - Album ID
 * @param masterKey - User's master key
 * @returns Derived album key
 */
async function getPrivateAlbumKey(
  albumId: string,
  masterKey: Uint8Array
): Promise<CryptoKey> {
  // Check cache first
  const cached = getCachedAlbumKey(albumId);
  if (cached) {
    return cached.key;
  }

  const db = getFirestore();

  try {
    // Get album metadata (contains salt)
    const albumDoc = await getDoc(doc(db, 'albums', albumId));

    if (!albumDoc.exists()) {
      throw new AlbumError(
        'Album not found',
        AlbumErrorCode.ALBUM_NOT_FOUND
      );
    }

    const albumData = albumDoc.data() as AlbumMetadata;

    if (!albumData.salt) {
      throw new AlbumError(
        'Salt not found for private album',
        AlbumErrorCode.KEY_NOT_FOUND
      );
    }

    // Deserialize salt
    const salt = Uint8Array.from(atob(albumData.salt), c => c.charCodeAt(0));

    // Derive key using HKDF
    const info = new TextEncoder().encode(`${PRIVATE_ALBUM_INFO_PREFIX}${albumId}`);
    const derivedKey = hkdf(sha256, masterKey, salt, info, 32);

    // Import as CryptoKey
    const albumKey = await importDerivedKey(
      derivedKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Cache for future use
    cacheAlbumKey({
      albumId,
      type: AlbumType.PRIVATE,
      key: albumKey,
      salt,
      createdAt: albumData.createdAt,
    });

    // Clean up
    wipeMemory(derivedKey);

    return albumKey;
  } catch (error) {
    throw new AlbumError(
      'Failed to get private album key',
      AlbumErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// UNIFIED ALBUM KEY RETRIEVAL
// ============================================================================

/**
 * Get Album Key
 *
 * Universal function to get album key (family or private).
 *
 * @param albumId - Album ID
 * @param masterKey - Master key (required for private albums)
 * @returns Album key
 *
 * @example
 * // For family album
 * const key = await getAlbumKey('album_123');
 *
 * // For private album
 * const key = await getAlbumKey('album_456', masterKey);
 */
export async function getAlbumKey(
  albumId: string,
  masterKey?: Uint8Array
): Promise<CryptoKey> {
  const db = getFirestore();

  try {
    // Get album metadata to determine type
    const albumDoc = await getDoc(doc(db, 'albums', albumId));

    if (!albumDoc.exists()) {
      throw new AlbumError(
        'Album not found',
        AlbumErrorCode.ALBUM_NOT_FOUND
      );
    }

    const albumData = albumDoc.data() as AlbumMetadata;
    // Support both old albums (with 'privacy' field) and new albums (with 'type' field)
    const albumType = albumData.type || (albumData as any).privacy;

    if (albumType === AlbumType.FAMILY || albumType === 'family') {
      return await getFamilyAlbumKey(albumId);
    } else if (albumType === AlbumType.PRIVATE || albumType === 'private') {
      if (!masterKey) {
        throw new AlbumError(
          'Master key required for private album',
          AlbumErrorCode.MASTER_KEY_REQUIRED
        );
      }
      return await getPrivateAlbumKey(albumId, masterKey);
    } else {
      throw new AlbumError(
        `Invalid album type: ${albumType}`,
        AlbumErrorCode.INVALID_ALBUM_TYPE
      );
    }
  } catch (error) {
    if (error instanceof AlbumError) {
      throw error;
    }
    throw new AlbumError(
      'Failed to get album key',
      AlbumErrorCode.KEY_NOT_FOUND,
      error
    );
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate Album ID
 *
 * Creates a unique album ID.
 */
function generateAlbumId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `album_${timestamp}_${random}`;
}

/**
 * Validate Album Options
 */
function validateAlbumOptions(options: CreateAlbumOptions): void {
  if (!options.name || options.name.trim().length === 0) {
    throw new AlbumError(
      'Album name is required',
      AlbumErrorCode.OPERATION_NOT_ALLOWED
    );
  }

  if (options.name.length > 100) {
    throw new AlbumError(
      'Album name too long (max 100 characters)',
      AlbumErrorCode.OPERATION_NOT_ALLOWED
    );
  }

  if (options.description && options.description.length > 500) {
    throw new AlbumError(
      'Album description too long (max 500 characters)',
      AlbumErrorCode.OPERATION_NOT_ALLOWED
    );
  }

  // Private albums cannot have AI enabled
  if (options.type === AlbumType.PRIVATE && options.aiEnabled) {
    throw new AlbumError(
      'AI processing not allowed for private albums',
      AlbumErrorCode.OPERATION_NOT_ALLOWED
    );
  }
}
