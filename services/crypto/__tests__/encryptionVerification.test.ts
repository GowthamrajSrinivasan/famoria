/**
 * Encryption Verification Tests
 *
 * These tests demonstrate that encryption is actually working by:
 * 1. Showing encrypted data is different from original
 * 2. Showing encrypted data appears random
 * 3. Showing decryption recovers original data
 * 4. Showing encrypted data can't be read without the key
 */

import { describe, it, expect } from 'vitest';
import {
  generateAESKey,
  encryptAES256GCM,
  decryptAES256GCM,
  exportKeyRaw,
  importDerivedKey,
} from '../core/cryptoCore';
import { encryptPhoto, decryptPhoto, stripEXIF } from '../photo/photoEncryption';
import { createFamilyAlbum, createPrivateAlbum, getAlbumKey } from '../album/albumKeys';
import { vi } from 'vitest';

// Mock Firebase
vi.mock('../../../lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-123',
      email: 'test@example.com',
    },
  },
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
}));

describe('Encryption Verification', () => {
  // ============================================================================
  // TEST 1: Encrypted data is different from original
  // ============================================================================

  it('should produce ciphertext different from plaintext', async () => {
    const originalText = 'This is sensitive user data that must be encrypted!';
    const plaintext = new TextEncoder().encode(originalText);

    const key = await generateAESKey(false);
    const encrypted = await encryptAES256GCM(plaintext, key);

    console.log('\n=== VERIFICATION TEST 1: Different from Original ===');
    console.log('Original text:', originalText);
    console.log('Original bytes:', Array.from(plaintext).slice(0, 20), '...');
    console.log('Encrypted bytes:', Array.from(encrypted.ciphertext).slice(0, 20), '...');
    console.log('Are they different?', !arraysEqual(plaintext, encrypted.ciphertext));

    // Verify encrypted data is completely different
    expect(encrypted.ciphertext).not.toEqual(plaintext);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // TEST 2: Encrypted data appears random
  // ============================================================================

  it('should produce ciphertext that looks random', async () => {
    const originalText = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // Repetitive pattern
    const plaintext = new TextEncoder().encode(originalText);

    const key = await generateAESKey(false);
    const encrypted = await encryptAES256GCM(plaintext, key);

    console.log('\n=== VERIFICATION TEST 2: Looks Random ===');
    console.log('Original (repetitive):', originalText);
    console.log('Encrypted (should be random-looking):',
      Array.from(encrypted.ciphertext).slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' ')
    );

    // Check that encrypted data doesn't have obvious patterns
    // (No byte appears more than 50% of the time - would indicate poor encryption)
    const byteCounts = new Array(256).fill(0);
    for (const byte of encrypted.ciphertext) {
      byteCounts[byte]++;
    }
    const maxCount = Math.max(...byteCounts);
    const percentageOfMax = (maxCount / encrypted.ciphertext.length) * 100;

    console.log('Most common byte appears:', percentageOfMax.toFixed(1) + '% of the time');
    console.log('(Should be < 10% for good randomness)');

    expect(percentageOfMax).toBeLessThan(20); // Good encryption should be well-distributed
  });

  // ============================================================================
  // TEST 3: Decryption recovers original data exactly
  // ============================================================================

  it('should decrypt ciphertext back to original plaintext', async () => {
    const originalText = 'Secret message: User password is secure123!';
    const plaintext = new TextEncoder().encode(originalText);

    const key = await generateAESKey(false);

    // Encrypt
    const encrypted = await encryptAES256GCM(plaintext, key);

    console.log('\n=== VERIFICATION TEST 3: Decryption Works ===');
    console.log('Original:', originalText);
    console.log('Encrypted length:', encrypted.ciphertext.length);

    // Decrypt
    const decrypted = await decryptAES256GCM(encrypted, key);
    const decryptedText = new TextDecoder().decode(decrypted);

    console.log('Decrypted:', decryptedText);
    console.log('Match?', originalText === decryptedText);

    expect(decryptedText).toBe(originalText);
    expect(decrypted).toEqual(plaintext);
  });

  // ============================================================================
  // TEST 4: Wrong key cannot decrypt
  // ============================================================================

  it('should fail to decrypt with wrong key', async () => {
    const originalText = 'Top secret data';
    const plaintext = new TextEncoder().encode(originalText);

    const correctKey = await generateAESKey(false);
    const wrongKey = await generateAESKey(false); // Different key

    // Encrypt with correct key
    const encrypted = await encryptAES256GCM(plaintext, correctKey);

    console.log('\n=== VERIFICATION TEST 4: Wrong Key Fails ===');
    console.log('Attempting to decrypt with wrong key...');

    // Try to decrypt with wrong key - should fail
    await expect(
      decryptAES256GCM(encrypted, wrongKey)
    ).rejects.toThrow();

    console.log('✓ Decryption failed as expected (authentication check)');
  });

  // ============================================================================
  // TEST 5: Same plaintext produces different ciphertext (due to random IV)
  // ============================================================================

  it('should produce different ciphertext for same plaintext (random IV)', async () => {
    const originalText = 'Same message encrypted twice';
    const plaintext = new TextEncoder().encode(originalText);

    const key = await generateAESKey(false);

    // Encrypt same message twice
    const encrypted1 = await encryptAES256GCM(plaintext, key);
    const encrypted2 = await encryptAES256GCM(plaintext, key);

    console.log('\n=== VERIFICATION TEST 5: Random IV ===');
    console.log('Original message:', originalText);
    console.log('First encryption IV:', Array.from(encrypted1.iv).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('Second encryption IV:', Array.from(encrypted2.iv).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('IVs are different?', !arraysEqual(encrypted1.iv, encrypted2.iv));
    console.log('Ciphertexts are different?', !arraysEqual(encrypted1.ciphertext, encrypted2.ciphertext));

    // IVs should be different (random)
    expect(encrypted1.iv).not.toEqual(encrypted2.iv);

    // Ciphertexts should be different (because of different IVs)
    expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);

    // But both should decrypt to same plaintext
    const decrypted1 = await decryptAES256GCM(encrypted1, key);
    const decrypted2 = await decryptAES256GCM(encrypted2, key);

    expect(new TextDecoder().decode(decrypted1)).toBe(originalText);
    expect(new TextDecoder().decode(decrypted2)).toBe(originalText);
  });

  // ============================================================================
  // TEST 6: Tampering with ciphertext is detected
  // ============================================================================

  it('should detect if ciphertext is tampered with', async () => {
    const originalText = 'Important data that must not be modified';
    const plaintext = new TextEncoder().encode(originalText);

    const key = await generateAESKey(false);
    const encrypted = await encryptAES256GCM(plaintext, key);

    console.log('\n=== VERIFICATION TEST 6: Tamper Detection ===');
    console.log('Original ciphertext length:', encrypted.ciphertext.length);

    // Tamper with the ciphertext (flip one bit)
    const tamperedCiphertext = new Uint8Array(encrypted.ciphertext);
    tamperedCiphertext[0] ^= 1; // Flip one bit

    console.log('Tampered byte 0: ', encrypted.ciphertext[0], '->', tamperedCiphertext[0]);
    console.log('Attempting to decrypt tampered data...');

    // Try to decrypt tampered data - should fail (GCM authentication)
    await expect(
      decryptAES256GCM(
        { ...encrypted, ciphertext: tamperedCiphertext },
        key
      )
    ).rejects.toThrow();

    console.log('✓ Tampering detected (GCM auth tag validation failed)');
  });

  // ============================================================================
  // TEST 7: Photo data is encrypted
  // ============================================================================

  it('should encrypt photo data so it cannot be read', async () => {
    // Create mock photo data (JPEG header)
    const jpegHeader = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
      0x49, 0x46, // "JFIF" in ASCII
    ]);

    const key = await generateAESKey(false);
    const encrypted = await encryptAES256GCM(jpegHeader, key);

    console.log('\n=== VERIFICATION TEST 7: Photo Encryption ===');
    console.log('Original JPEG header:', Array.from(jpegHeader).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    console.log('Encrypted version:', Array.from(encrypted.ciphertext).slice(0, 10).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

    // Verify JPEG magic bytes are NOT visible in encrypted data
    const encryptedHasJPEGMagic = (
      encrypted.ciphertext[0] === 0xFF &&
      encrypted.ciphertext[1] === 0xD8
    );

    console.log('JPEG magic bytes (0xFF 0xD8) visible in encrypted data?', encryptedHasJPEGMagic);
    console.log('(Should be false - encrypted data should hide file format)');

    expect(encryptedHasJPEGMagic).toBe(false);

    // But decryption should recover the JPEG header
    const decrypted = await decryptAES256GCM(encrypted, key);
    expect(decrypted).toEqual(jpegHeader);
  });

  // ============================================================================
  // TEST 8: HKDF derives different keys for different contexts
  // ============================================================================

  it('should derive different keys for different album IDs using HKDF', async () => {
    const masterKey = new Uint8Array(32);
    crypto.getRandomValues(masterKey);

    const albumId1 = 'album_123';
    const albumId2 = 'album_456';

    console.log('\n=== VERIFICATION TEST 8: HKDF Key Derivation ===');
    console.log('Master key (first 8 bytes):', Array.from(masterKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('Album 1 ID:', albumId1);
    console.log('Album 2 ID:', albumId2);

    // Derive keys using HKDF (same as private album key derivation)
    const { hkdf } = await import('@noble/hashes/hkdf.js');
    const { sha256 } = await import('@noble/hashes/sha2.js');

    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);

    const info1 = new TextEncoder().encode(`album:private:${albumId1}`);
    const info2 = new TextEncoder().encode(`album:private:${albumId2}`);

    const key1 = hkdf(sha256, masterKey, salt, info1, 32);
    const key2 = hkdf(sha256, masterKey, salt, info2, 32);

    console.log('Key 1 (first 8 bytes):', Array.from(key1.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('Key 2 (first 8 bytes):', Array.from(key2.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('Keys are different?', !arraysEqual(key1, key2));

    // Keys should be different (derived with different album IDs)
    expect(key1).not.toEqual(key2);

    // But deriving the same album ID twice should give same key
    const key1Again = hkdf(sha256, masterKey, salt, info1, 32);
    console.log('Deriving album 1 key again gives same result?', arraysEqual(key1, key1Again));
    expect(key1).toEqual(key1Again);
  });
});

// Helper function to compare arrays
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
