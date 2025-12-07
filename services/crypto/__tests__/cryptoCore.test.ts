/**
 * Comprehensive Test Suite for Core Cryptography
 *
 * Tests all cryptographic primitives for:
 * - Correctness
 * - Security properties
 * - Edge cases
 * - Error handling
 */

import {
  encryptAES256GCM,
  decryptAES256GCM,
  generateAESKey,
  deriveKeyArgon2id,
  importDerivedKey,
  generateRSAKeyPair,
  encryptRSA,
  decryptRSA,
  hashSHA256,
  hmacSHA256,
  wipeMemory,
  constantTimeEqual,
  secureRandomBytes,
  exportKeyRaw,
  exportRSAPublicKey,
  exportRSAPrivateKey,
  importRSAPublicKey,
  importRSAPrivateKey,
  serializeKey,
  deserializeKey,
  CryptoError,
} from '../core/cryptoCore';

describe('CryptoCore - AES-256-GCM', () => {
  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt correctly', async () => {
      const plaintext = new TextEncoder().encode('Hello, World!');
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);
      const decrypted = await decryptAES256GCM(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should produce ciphertext different from plaintext', async () => {
      const plaintext = new TextEncoder().encode('secret message');
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);

      expect(encrypted.ciphertext).not.toEqual(plaintext);
    });

    it('should generate unique IVs for each encryption', async () => {
      const plaintext = new TextEncoder().encode('test');
      const key = await generateAESKey();

      const encrypted1 = await encryptAES256GCM(plaintext, key);
      const encrypted2 = await encryptAES256GCM(plaintext, key);

      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
    });

    it('should produce different ciphertext with different IVs', async () => {
      const plaintext = new TextEncoder().encode('test');
      const key = await generateAESKey();

      const encrypted1 = await encryptAES256GCM(plaintext, key);
      const encrypted2 = await encryptAES256GCM(plaintext, key);

      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
    });

    it('should have 12-byte IV', async () => {
      const plaintext = new TextEncoder().encode('test');
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);

      expect(encrypted.iv.length).toBe(12);
    });

    it('should have 16-byte auth tag', async () => {
      const plaintext = new TextEncoder().encode('test');
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);

      expect(encrypted.authTag.length).toBe(16);
    });
  });

  describe('Authenticated Encryption (AEAD)', () => {
    it('should detect tampering with ciphertext', async () => {
      const plaintext = new TextEncoder().encode('secret data');
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);

      // Tamper with ciphertext
      encrypted.ciphertext[0] ^= 0xFF;

      await expect(
        decryptAES256GCM(encrypted, key)
      ).rejects.toThrow(CryptoError);
    });

    it('should detect tampering with IV', async () => {
      const plaintext = new TextEncoder().encode('secret data');
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);

      // Tamper with IV
      encrypted.iv[0] ^= 0xFF;

      await expect(
        decryptAES256GCM(encrypted, key)
      ).rejects.toThrow();
    });

    it('should detect tampering with auth tag', async () => {
      const plaintext = new TextEncoder().encode('secret data');
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);

      // Tamper with auth tag
      encrypted.authTag[0] ^= 0xFF;

      await expect(
        decryptAES256GCM(encrypted, key)
      ).rejects.toThrow(CryptoError);
    });

    it('should support additional authenticated data (AAD)', async () => {
      const plaintext = new TextEncoder().encode('message');
      const key = await generateAESKey();
      const aad = new TextEncoder().encode('metadata');

      const encrypted = await encryptAES256GCM(plaintext, key, aad);
      const decrypted = await decryptAES256GCM(encrypted, key, aad);

      expect(decrypted).toEqual(plaintext);
    });

    it('should fail if AAD mismatch', async () => {
      const plaintext = new TextEncoder().encode('message');
      const key = await generateAESKey();
      const aad1 = new TextEncoder().encode('metadata1');
      const aad2 = new TextEncoder().encode('metadata2');

      const encrypted = await encryptAES256GCM(plaintext, key, aad1);

      await expect(
        decryptAES256GCM(encrypted, key, aad2)
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty plaintext', async () => {
      const plaintext = new Uint8Array(0);
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);
      const decrypted = await decryptAES256GCM(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should handle large plaintext', async () => {
      const plaintext = new Uint8Array(1024 * 1024); // 1 MB
      const key = await generateAESKey();

      const encrypted = await encryptAES256GCM(plaintext, key);
      const decrypted = await decryptAES256GCM(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });
  });
});

describe('CryptoCore - Argon2id', () => {
  describe('Key Derivation', () => {
    it('should derive consistent keys', async () => {
      const password = 'my-secure-password';
      const salt = secureRandomBytes(16);

      const key1 = await deriveKeyArgon2id({
        password,
        salt,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      const key2 = await deriveKeyArgon2id({
        password,
        salt,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      expect(key1).toEqual(key2);
    });

    it('should produce different keys with different salts', async () => {
      const password = 'my-secure-password';
      const salt1 = secureRandomBytes(16);
      const salt2 = secureRandomBytes(16);

      const key1 = await deriveKeyArgon2id({
        password,
        salt: salt1,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      const key2 = await deriveKeyArgon2id({
        password,
        salt: salt2,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      expect(key1).not.toEqual(key2);
    });

    it('should produce different keys with different passwords', async () => {
      const salt = secureRandomBytes(16);

      const key1 = await deriveKeyArgon2id({
        password: 'password1',
        salt,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      const key2 = await deriveKeyArgon2id({
        password: 'password2',
        salt,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      expect(key1).not.toEqual(key2);
    });

    it('should derive key of correct length', async () => {
      const password = 'test-password';
      const salt = secureRandomBytes(16);

      const key = await deriveKeyArgon2id({
        password,
        salt,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      expect(key.length).toBe(32);
    });

    it('should reject low memory parameter', async () => {
      const password = 'test-password';
      const salt = secureRandomBytes(16);

      await expect(
        deriveKeyArgon2id({
          password,
          salt,
          memory: 1024, // Too low
          iterations: 3,
          parallelism: 4,
          keyLength: 32,
        })
      ).rejects.toThrow(CryptoError);
    });
  });

  describe('Derived Key Usage', () => {
    it('should import derived key for encryption', async () => {
      const password = 'encryption-password';
      const salt = secureRandomBytes(16);

      const derivedKeyBytes = await deriveKeyArgon2id({
        password,
        salt,
        memory: 65536,
        iterations: 3,
        parallelism: 4,
        keyLength: 32,
      });

      const key = await importDerivedKey(derivedKeyBytes);

      // Use key for encryption
      const plaintext = new TextEncoder().encode('test message');
      const encrypted = await encryptAES256GCM(plaintext, key);
      const decrypted = await decryptAES256GCM(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });
  });
});

describe('CryptoCore - RSA-OAEP', () => {
  describe('Key Generation', () => {
    it('should generate valid key pair', async () => {
      const keyPair = await generateRSAKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.type).toBe('public');
      expect(keyPair.privateKey.type).toBe('private');
    });

    it('should generate different key pairs', async () => {
      const keyPair1 = await generateRSAKeyPair();
      const keyPair2 = await generateRSAKeyPair();

      const pub1 = await exportRSAPublicKey(keyPair1.publicKey);
      const pub2 = await exportRSAPublicKey(keyPair2.publicKey);

      expect(pub1).not.toEqual(pub2);
    });
  });

  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt small data', async () => {
      const plaintext = new TextEncoder().encode('RSA Test Message');
      const keyPair = await generateRSAKeyPair();

      const encrypted = await encryptRSA(plaintext, keyPair.publicKey);
      const decrypted = await decryptRSA(encrypted, keyPair.privateKey);

      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertext each time', async () => {
      const plaintext = new TextEncoder().encode('test');
      const keyPair = await generateRSAKeyPair();

      const encrypted1 = await encryptRSA(plaintext, keyPair.publicKey);
      const encrypted2 = await encryptRSA(plaintext, keyPair.publicKey);

      // OAEP padding includes randomness
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should reject plaintext that is too large', async () => {
      const plaintext = new Uint8Array(1000); // Too large for RSA
      const keyPair = await generateRSAKeyPair();

      await expect(
        encryptRSA(plaintext, keyPair.publicKey)
      ).rejects.toThrow(CryptoError);
    });

    it('should fail decryption with wrong private key', async () => {
      const plaintext = new TextEncoder().encode('secret');
      const keyPair1 = await generateRSAKeyPair();
      const keyPair2 = await generateRSAKeyPair();

      const encrypted = await encryptRSA(plaintext, keyPair1.publicKey);

      await expect(
        decryptRSA(encrypted, keyPair2.privateKey)
      ).rejects.toThrow();
    });
  });

  describe('Key Import/Export', () => {
    it('should export and import public key', async () => {
      const keyPair = await generateRSAKeyPair();

      const exported = await exportRSAPublicKey(keyPair.publicKey);
      const imported = await importRSAPublicKey(exported);

      // Test imported key works
      const plaintext = new TextEncoder().encode('test');
      const encrypted = await encryptRSA(plaintext, imported);
      const decrypted = await decryptRSA(encrypted, keyPair.privateKey);

      expect(decrypted).toEqual(plaintext);
    });

    it('should export and import private key', async () => {
      const keyPair = await generateRSAKeyPair();

      const exported = await exportRSAPrivateKey(keyPair.privateKey);
      const imported = await importRSAPrivateKey(exported);

      // Test imported key works
      const plaintext = new TextEncoder().encode('test');
      const encrypted = await encryptRSA(plaintext, keyPair.publicKey);
      const decrypted = await decryptRSA(encrypted, imported);

      expect(decrypted).toEqual(plaintext);
    });
  });
});

describe('CryptoCore - Utility Functions', () => {
  describe('Memory Wiping', () => {
    it('should wipe memory to zeros', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      wipeMemory(data);

      expect(data).toEqual(new Uint8Array([0, 0, 0, 0, 0]));
    });

    it('should handle empty array', () => {
      const data = new Uint8Array(0);
      expect(() => wipeMemory(data)).not.toThrow();
    });
  });

  describe('Constant-Time Comparison', () => {
    it('should return true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 4]);

      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 5]);

      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);

      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should handle empty arrays', () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array(0);

      expect(constantTimeEqual(a, b)).toBe(true);
    });
  });

  describe('Secure Random Bytes', () => {
    it('should generate requested number of bytes', () => {
      const bytes = secureRandomBytes(32);
      expect(bytes.length).toBe(32);
    });

    it('should generate different values each time', () => {
      const bytes1 = secureRandomBytes(16);
      const bytes2 = secureRandomBytes(16);

      expect(bytes1).not.toEqual(bytes2);
    });

    it('should not be all zeros', () => {
      const bytes = secureRandomBytes(32);
      const allZeros = new Uint8Array(32);

      expect(bytes).not.toEqual(allZeros);
    });
  });

  describe('Key Serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original = secureRandomBytes(32);
      const serialized = serializeKey(original);
      const deserialized = deserializeKey(serialized);

      expect(deserialized).toEqual(original);
    });

    it('should produce base64 string', () => {
      const key = secureRandomBytes(32);
      const serialized = serializeKey(key);

      // Base64 regex
      expect(serialized).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    });
  });

  describe('Hashing', () => {
    it('should produce consistent hashes', () => {
      const data = new TextEncoder().encode('test data');

      const hash1 = hashSHA256(data);
      const hash2 = hashSHA256(data);

      expect(hash1).toEqual(hash2);
    });

    it('should produce 32-byte hash', () => {
      const data = new TextEncoder().encode('test');
      const hash = hashSHA256(data);

      expect(hash.length).toBe(32);
    });

    it('should produce different hashes for different data', () => {
      const data1 = new TextEncoder().encode('data1');
      const data2 = new TextEncoder().encode('data2');

      const hash1 = hashSHA256(data1);
      const hash2 = hashSHA256(data2);

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('HMAC', () => {
    it('should produce consistent MACs', () => {
      const key = secureRandomBytes(32);
      const data = new TextEncoder().encode('message');

      const mac1 = hmacSHA256(key, data);
      const mac2 = hmacSHA256(key, data);

      expect(mac1).toEqual(mac2);
    });

    it('should produce different MACs with different keys', () => {
      const key1 = secureRandomBytes(32);
      const key2 = secureRandomBytes(32);
      const data = new TextEncoder().encode('message');

      const mac1 = hmacSHA256(key1, data);
      const mac2 = hmacSHA256(key2, data);

      expect(mac1).not.toEqual(mac2);
    });

    it('should produce 32-byte MAC', () => {
      const key = secureRandomBytes(32);
      const data = new TextEncoder().encode('test');

      const mac = hmacSHA256(key, data);

      expect(mac.length).toBe(32);
    });
  });
});

describe('CryptoCore - Integration Tests', () => {
  it('should support hybrid encryption (RSA + AES)', async () => {
    // Simulate hybrid encryption: Use RSA to encrypt AES key
    const rsaKeyPair = await generateRSAKeyPair();
    const aesKey = await generateAESKey(true); // extractable

    // Export AES key
    const aesKeyBytes = await exportKeyRaw(aesKey);

    // Encrypt AES key with RSA
    const encryptedAESKey = await encryptRSA(aesKeyBytes, rsaKeyPair.publicKey);

    // Encrypt data with AES
    const plaintext = new TextEncoder().encode('Large amount of data...');
    const encryptedData = await encryptAES256GCM(plaintext, aesKey);

    // Decrypt AES key with RSA
    const decryptedAESKeyBytes = await decryptRSA(
      encryptedAESKey,
      rsaKeyPair.privateKey
    );

    // Import decrypted AES key
    const decryptedAESKey = await importDerivedKey(
      decryptedAESKeyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Decrypt data with AES
    const decryptedData = await decryptAES256GCM(encryptedData, decryptedAESKey);

    expect(decryptedData).toEqual(plaintext);
  });

  it('should support password-based encryption', async () => {
    const password = 'user-password-123';
    const salt = secureRandomBytes(16);

    // Derive key from password
    const derivedKeyBytes = await deriveKeyArgon2id({
      password,
      salt,
      memory: 65536,
      iterations: 3,
      parallelism: 4,
      keyLength: 32,
    });

    const key = await importDerivedKey(derivedKeyBytes);

    // Encrypt with derived key
    const plaintext = new TextEncoder().encode('secret data');
    const encrypted = await encryptAES256GCM(plaintext, key);

    // Later: derive same key and decrypt
    const derivedKeyBytes2 = await deriveKeyArgon2id({
      password,
      salt,
      memory: 65536,
      iterations: 3,
      parallelism: 4,
      keyLength: 32,
    });

    const key2 = await importDerivedKey(derivedKeyBytes2);
    const decrypted = await decryptAES256GCM(encrypted, key2);

    expect(decrypted).toEqual(plaintext);
  });
});
