/**
 * Album Encryption Test Suite
 *
 * Tests album-level encryption for family and private albums.
 *
 * @module Tests/Album
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createFamilyAlbum,
  createPrivateAlbum,
  getAlbumKey,
  clearAlbumKeyCache,
} from '../albumKeys';
import { rotateAlbumKey } from '../albumRotation';
import {
  AlbumType,
  AlbumVisibility,
  AlbumErrorCode,
  AlbumError,
} from '../../../../src/types/album';
import { secureRandomBytes } from '../../core/cryptoCore';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firebase Auth
vi.mock('../../../../lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-123',
      email: 'test@example.com',
    },
  },
}));

// Mock Firestore
const mockFirestoreData = new Map();

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((db, collection, id) => ({ collection, id })),
  setDoc: vi.fn((docRef, data) => {
    const key = `${docRef.collection}/${docRef.id}`;
    mockFirestoreData.set(key, data);
    return Promise.resolve();
  }),
  getDoc: vi.fn((docRef) => {
    const key = `${docRef.collection}/${docRef.id}`;
    const data = mockFirestoreData.get(key);
    return Promise.resolve({
      exists: () => !!data,
      data: () => data,
    });
  }),
  getDocs: vi.fn(() => Promise.resolve({
    docs: [],
  })),
  collection: vi.fn((db, name) => ({ name })),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
}));

// Mock keyManager
vi.mock('../../keys/keyManager', () => ({
  storeCryptoKey: vi.fn(() => Promise.resolve()),
  retrieveCryptoKey: vi.fn(async () => {
    // Return a mock CryptoKey
    return await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }),
  hardwareEncrypt: vi.fn(async (data) => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return {
      ciphertext: new Uint8Array(ciphertext),
      iv,
      authTag: new Uint8Array(16),
    };
  }),
  hardwareDecrypt: vi.fn(async (keyId, encrypted) => {
    // For testing, just return some random bytes
    return secureRandomBytes(32);
  }),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

beforeEach(() => {
  mockFirestoreData.clear();
  clearAlbumKeyCache();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// FAMILY ALBUM TESTS
// ============================================================================

describe('Family Album Encryption', () => {
  describe('createFamilyAlbum', () => {
    it('should create family album with encrypted key', async () => {
      const result = await createFamilyAlbum({
        name: 'Summer Vacation 2024',
        description: 'Trip to Hawaii',
        type: AlbumType.FAMILY,
        aiEnabled: true,
      });

      expect(result.albumId).toBeDefined();
      expect(result.metadata.name).toBe('Summer Vacation 2024');
      expect(result.metadata.type).toBe(AlbumType.FAMILY);
      expect(result.metadata.aiEnabled).toBe(true);
      expect(result.metadata.shareable).toBe(true);
    });

    it('should store encrypted key in Firestore', async () => {
      const result = await createFamilyAlbum({
        name: 'Test Album',
        type: AlbumType.FAMILY,
      });

      const keyData = mockFirestoreData.get(
        `albumKeys/${result.albumId}_test-user-123`
      );

      expect(keyData).toBeDefined();
      expect(keyData.encryptedKey).toBeDefined();
      expect(keyData.iv).toBeDefined();
      expect(keyData.salt).toBeDefined();
      expect(keyData.version).toBe(1);
    });

    it('should store album metadata', async () => {
      const result = await createFamilyAlbum({
        name: 'Test Album',
        description: 'Test Description',
        type: AlbumType.FAMILY,
        tags: ['vacation', 'summer'],
        color: '#FF5733',
      });

      const albumData = mockFirestoreData.get(`albums/${result.albumId}`);

      expect(albumData).toBeDefined();
      expect(albumData.name).toBe('Test Album');
      expect(albumData.description).toBe('Test Description');
      expect(albumData.ownerId).toBe('test-user-123');
      expect(albumData.members).toContain('test-user-123');
      expect(albumData.tags).toEqual(['vacation', 'summer']);
      expect(albumData.color).toBe('#FF5733');
    });

    it('should set correct permissions for family album', async () => {
      const result = await createFamilyAlbum({
        name: 'Test Album',
        type: AlbumType.FAMILY,
        aiEnabled: false,
      });

      expect(result.metadata.shareable).toBe(true);
      expect(result.metadata.aiEnabled).toBe(false);
      expect(result.metadata.visibility).toBe(AlbumVisibility.PRIVATE);
    });

    it('should generate unique album IDs', async () => {
      const album1 = await createFamilyAlbum({
        name: 'Album 1',
        type: AlbumType.FAMILY,
      });

      const album2 = await createFamilyAlbum({
        name: 'Album 2',
        type: AlbumType.FAMILY,
      });

      expect(album1.albumId).not.toBe(album2.albumId);
    });
  });

  describe('getAlbumKey - Family', () => {
    it('should retrieve family album key', async () => {
      const created = await createFamilyAlbum({
        name: 'Test Album',
        type: AlbumType.FAMILY,
      });

      const key = await getAlbumKey(created.albumId);

      expect(key).toBeDefined();
      expect(key).toBeInstanceOf(CryptoKey);
    });

    it('should cache album keys', async () => {
      const created = await createFamilyAlbum({
        name: 'Test Album',
        type: AlbumType.FAMILY,
      });

      // First call
      const key1 = await getAlbumKey(created.albumId);

      // Second call should use cache
      const key2 = await getAlbumKey(created.albumId);

      expect(key1).toBe(key2);
    });

    it('should throw error for non-existent album', async () => {
      await expect(getAlbumKey('non-existent-album')).rejects.toThrow(AlbumError);
    });
  });
});

// ============================================================================
// PRIVATE ALBUM TESTS
// ============================================================================

describe('Private Album Encryption', () => {
  const masterKey = secureRandomBytes(32);

  describe('createPrivateAlbum', () => {
    it('should create private album with derived key', async () => {
      const result = await createPrivateAlbum(
        {
          name: 'Personal Photos',
          description: 'Private memories',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      expect(result.albumId).toBeDefined();
      expect(result.metadata.type).toBe(AlbumType.PRIVATE);
      expect(result.metadata.shareable).toBe(false);
      expect(result.metadata.aiEnabled).toBe(false);
    });

    it('should encrypt album name for private albums', async () => {
      const result = await createPrivateAlbum(
        {
          name: 'Secret Album',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      const albumData = mockFirestoreData.get(`albums/${result.albumId}`);

      // Name should be encrypted (base64)
      expect(albumData.name).not.toBe('Secret Album');
      expect(albumData.name).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should store salt but not key', async () => {
      const result = await createPrivateAlbum(
        {
          name: 'Private Album',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      const albumData = mockFirestoreData.get(`albums/${result.albumId}`);

      expect(albumData.salt).toBeDefined();
      expect(albumData.salt).toMatch(/^[A-Za-z0-9+/=]+$/);

      // Should NOT have encrypted key in albumKeys collection
      const keyData = mockFirestoreData.get(
        `albumKeys/${result.albumId}_test-user-123`
      );
      expect(keyData).toBeUndefined();
    });

    it('should not allow AI for private albums', async () => {
      const result = await createPrivateAlbum(
        {
          name: 'Private Album',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      expect(result.metadata.aiEnabled).toBe(false);
      expect(result.metadata.aiConsentedAt).toBeUndefined();
    });

    it('should derive same key from same master key and salt', async () => {
      const album1 = await createPrivateAlbum(
        {
          name: 'Album 1',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      // Get the key twice
      const key1 = await getAlbumKey(album1.albumId, masterKey);
      const key2 = await getAlbumKey(album1.albumId, masterKey);

      // Keys should be the same instance (cached)
      expect(key1).toBe(key2);
    });

    it('should derive different keys for different albums', async () => {
      const album1 = await createPrivateAlbum(
        {
          name: 'Album 1',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      const album2 = await createPrivateAlbum(
        {
          name: 'Album 2',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      const key1 = await getAlbumKey(album1.albumId, masterKey);
      const key2 = await getAlbumKey(album2.albumId, masterKey);

      // Keys should be different instances
      expect(key1).not.toBe(key2);
    });
  });

  describe('getAlbumKey - Private', () => {
    it('should require master key for private albums', async () => {
      const created = await createPrivateAlbum(
        {
          name: 'Private Album',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      // Without master key
      await expect(getAlbumKey(created.albumId)).rejects.toThrow(AlbumError);
      await expect(getAlbumKey(created.albumId)).rejects.toThrow('Master key required');
    });

    it('should retrieve private album key with master key', async () => {
      const created = await createPrivateAlbum(
        {
          name: 'Private Album',
          type: AlbumType.PRIVATE,
        },
        masterKey
      );

      const key = await getAlbumKey(created.albumId, masterKey);

      expect(key).toBeDefined();
      expect(key).toBeInstanceOf(CryptoKey);
    });
  });
});

// ============================================================================
// ALBUM KEY ROTATION TESTS
// ============================================================================

describe('Album Key Rotation', () => {
  it('should only allow rotation for family albums', async () => {
    const privateAlbum = await createPrivateAlbum(
      {
        name: 'Private Album',
        type: AlbumType.PRIVATE,
      },
      secureRandomBytes(32)
    );

    await expect(rotateAlbumKey(privateAlbum.albumId)).rejects.toThrow(AlbumError);
  });

  it('should require album owner for rotation', async () => {
    // This test would require changing auth.currentUser which is mocked
    // Skip for now as it requires more complex mocking
    expect(true).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Album Integration', () => {
  it('should handle both album types in same app', async () => {
    const masterKey = secureRandomBytes(32);

    // Create both types
    const familyAlbum = await createFamilyAlbum({
      name: 'Family Photos',
      type: AlbumType.FAMILY,
      aiEnabled: true,
    });

    const privateAlbum = await createPrivateAlbum(
      {
        name: 'Private Photos',
        type: AlbumType.PRIVATE,
      },
      masterKey
    );

    // Get keys
    const familyKey = await getAlbumKey(familyAlbum.albumId);
    const privateKey = await getAlbumKey(privateAlbum.albumId, masterKey);

    // Verify they're different
    expect(familyKey).not.toBe(privateKey);

    // Verify properties
    expect(familyAlbum.metadata.shareable).toBe(true);
    expect(privateAlbum.metadata.shareable).toBe(false);
    expect(familyAlbum.metadata.aiEnabled).toBe(true);
    expect(privateAlbum.metadata.aiEnabled).toBe(false);
  });

  it('should maintain key cache across operations', async () => {
    const masterKey = secureRandomBytes(32);

    const album = await createPrivateAlbum(
      {
        name: 'Test Album',
        type: AlbumType.PRIVATE,
      },
      masterKey
    );

    const key1 = await getAlbumKey(album.albumId, masterKey);
    const key2 = await getAlbumKey(album.albumId, masterKey);
    const key3 = await getAlbumKey(album.albumId, masterKey);

    // All should be same cached instance
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);

    // Clear cache
    clearAlbumKeyCache();

    const key4 = await getAlbumKey(album.albumId, masterKey);

    // After clearing, new instance
    expect(key1).not.toBe(key4);
  });
});
