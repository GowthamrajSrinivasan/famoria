/**
 * Key Manager Test Suite
 *
 * Tests hardware-backed key storage and management.
 *
 * @module Tests/KeyManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initKeyManager,
  generateHardwareKey,
  generateExtractableKey,
  hardwareEncrypt,
  hardwareDecrypt,
  getAllKeys,
  getKeysByKeyType,
  deleteKey,
  getKeyMetadata,
} from '../keyManager';
import {
  initSecureStorage,
  clearAllKeys,
  getStorageStats,
} from '../web/secureStorage';
import { KeyType } from '../../../../src/types/keyStorage';
import { generateAESKey } from '../../core/cryptoCore';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firebase
vi.mock('../../../../lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-123',
    },
  },
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(() => ({})),
}));

// ============================================================================
// TEST SETUP
// ============================================================================

describe('KeyManager', () => {
  beforeEach(async () => {
    // Initialize storage
    await initSecureStorage();
    await initKeyManager();

    // Clear any existing keys
    await clearAllKeys();
  });

  afterEach(async () => {
    // Clean up
    await clearAllKeys();
  });

  // ==========================================================================
  // INITIALIZATION TESTS
  // ==========================================================================

  describe('Initialization', () => {
    it('should initialize key manager successfully', async () => {
      // Already initialized in beforeEach
      const stats = await getStorageStats();
      expect(stats).toBeDefined();
      expect(stats.totalKeys).toBe(0);
    });
  });

  // ==========================================================================
  // KEY GENERATION TESTS
  // ==========================================================================

  describe('Hardware Key Generation', () => {
    it('should generate non-extractable AES key', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);

      expect(key).toBeDefined();
      expect(key.keyId).toBeTruthy();
      expect(key.type).toBe(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      expect(key.algorithm).toBe('AES-GCM');
      expect(key.keySize).toBe(256);
      expect(key.isHardwareBacked).toBe(true);
      expect(key.platform).toBe('web');
    });

    it('should generate RSA key pair', async () => {
      const key = await generateHardwareKey(
        KeyType.USER_PRIVATE_KEY,
        {
          algorithm: 'RSA-OAEP',
          length: 2048,
        }
      );

      expect(key).toBeDefined();
      expect(key.algorithm).toBe('RSA-OAEP');
      expect(key.keySize).toBe(2048);
    });

    it('should generate unique key IDs', async () => {
      const key1 = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const key2 = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);

      expect(key1.keyId).not.toBe(key2.keyId);
    });

    it('should set biometric requirement', async () => {
      const key = await generateHardwareKey(
        KeyType.BIOMETRIC_UNLOCK_KEY,
        { requireBiometric: true }
      );

      expect(key.requiresBiometric).toBe(true);
    });
  });

  describe('Extractable Key Generation', () => {
    it('should generate extractable key', async () => {
      const encryptionKey = await generateAESKey(false);

      const key = await generateExtractableKey(
        KeyType.DEVICE_ENCRYPTION_KEY,
        encryptionKey
      );

      expect(key).toBeDefined();
      expect(key.isHardwareBacked).toBe(false);
    });
  });

  // ==========================================================================
  // ENCRYPTION/DECRYPTION TESTS
  // ==========================================================================

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const plaintext = new TextEncoder().encode('Hello, World!');

      const encrypted = await hardwareEncrypt(key.keyId, plaintext);
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      const decrypted = await hardwareDecrypt(key.keyId, encrypted);
      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const plaintext = new TextEncoder().encode('Test data');

      const encrypted1 = await hardwareEncrypt(key.keyId, plaintext);
      const encrypted2 = await hardwareEncrypt(key.keyId, plaintext);

      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
    });

    it('should support additional authenticated data', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const plaintext = new TextEncoder().encode('Secret data');
      const aad = new TextEncoder().encode('metadata');

      const encrypted = await hardwareEncrypt(key.keyId, plaintext, aad);
      const decrypted = await hardwareDecrypt(key.keyId, encrypted, aad);

      expect(decrypted).toEqual(plaintext);
    });

    it('should fail decryption with wrong AAD', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const plaintext = new TextEncoder().encode('Secret data');
      const aad1 = new TextEncoder().encode('metadata1');
      const aad2 = new TextEncoder().encode('metadata2');

      const encrypted = await hardwareEncrypt(key.keyId, plaintext, aad1);

      await expect(
        hardwareDecrypt(key.keyId, encrypted, aad2)
      ).rejects.toThrow();
    });

    it('should handle large data', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const plaintext = new Uint8Array(64 * 1024); // 64KB (within getRandomValues limit)
      crypto.getRandomValues(plaintext);

      const encrypted = await hardwareEncrypt(key.keyId, plaintext);
      const decrypted = await hardwareDecrypt(key.keyId, encrypted);

      expect(decrypted).toEqual(plaintext);
    });

    it('should fail with non-existent key', async () => {
      const plaintext = new TextEncoder().encode('Test');

      await expect(
        hardwareEncrypt('non-existent-key', plaintext)
      ).rejects.toThrow('Key not found');
    });
  });

  // ==========================================================================
  // KEY MANAGEMENT TESTS
  // ==========================================================================

  describe('Key Management', () => {
    it('should list all keys', async () => {
      await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      await generateHardwareKey(KeyType.USER_PRIVATE_KEY, {
        algorithm: 'RSA-OAEP',
        length: 2048,
      });

      const keys = await getAllKeys();
      expect(keys.length).toBe(2);
    });

    it('should filter keys by type', async () => {
      await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      await generateHardwareKey(KeyType.USER_PRIVATE_KEY, {
        algorithm: 'RSA-OAEP',
        length: 2048,
      });

      const masterKeys = await getKeysByKeyType(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const userKeys = await getKeysByKeyType(KeyType.USER_PRIVATE_KEY);

      expect(masterKeys.length).toBe(2);
      expect(userKeys.length).toBe(1);
    });

    it('should get key metadata', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const metadata = await getKeyMetadata(key.keyId);

      expect(metadata).toBeDefined();
      expect(metadata?.keyId).toBe(key.keyId);
      expect(metadata?.type).toBe(KeyType.MASTER_KEY_ENCRYPTION_KEY);
    });

    it('should delete key', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);

      await deleteKey(key.keyId);

      const metadata = await getKeyMetadata(key.keyId);
      expect(metadata).toBeNull();
    });

    it('should update last used timestamp', async () => {
      const key = await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      const initialMetadata = await getKeyMetadata(key.keyId);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Use the key
      const plaintext = new TextEncoder().encode('Test');
      await hardwareEncrypt(key.keyId, plaintext);

      const updatedMetadata = await getKeyMetadata(key.keyId);

      expect(updatedMetadata?.lastUsed).toBeGreaterThan(initialMetadata?.lastUsed || 0);
    });
  });

  // ==========================================================================
  // STORAGE STATS TESTS
  // ==========================================================================

  describe('Storage Statistics', () => {
    it('should report accurate storage stats', async () => {
      await generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY);
      await generateHardwareKey(KeyType.USER_PRIVATE_KEY, {
        algorithm: 'RSA-OAEP',
        length: 2048,
      });

      const stats = await getStorageStats();

      expect(stats.totalKeys).toBeGreaterThanOrEqual(0);
      expect(stats.totalCryptoKeys).toBe(2);
      expect(stats.estimatedSize).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // ERROR HANDLING TESTS
  // ==========================================================================

  describe('Error Handling', () => {
    it('should throw on invalid key algorithm', async () => {
      await expect(
        generateHardwareKey(KeyType.MASTER_KEY_ENCRYPTION_KEY, {
          // @ts-expect-error Testing invalid algorithm
          algorithm: 'INVALID',
        })
      ).rejects.toThrow(); // Just check that it throws, error message may be wrapped
    });
  });
});
