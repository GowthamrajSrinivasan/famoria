/**
 * Recovery System Test Suite
 *
 * Tests Shamir's Secret Sharing, BIP39 recovery codes, and master key management.
 *
 * @module Tests/Recovery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  splitSecret,
  reconstructSecret,
  verifyShare,
  verifySharesCompatible,
  getSharesInfo,
  serializeShare,
  deserializeShare,
} from '../shamir';
import {
  generateRecoveryCode,
  validateRecoveryCode,
  deriveKeyFromRecoveryCode,
  formatMnemonic,
  normalizeMnemonic,
  getWordCount,
  is24Words,
} from '../recoveryCode';
import { secureRandomBytes } from '../../core/cryptoCore';

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

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
}));

// ============================================================================
// SHAMIR'S SECRET SHARING TESTS
// ============================================================================

describe('Shamir Secret Sharing', () => {
  describe('splitSecret', () => {
    it('should split secret into shares', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      expect(shares.length).toBe(5);
      expect(shares[0].threshold).toBe(3);
      expect(shares[0].totalShares).toBe(5);
    });

    it('should assign unique share IDs', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      const shareIds = shares.map(s => s.shareId);
      const uniqueIds = new Set(shareIds);

      expect(uniqueIds.size).toBe(5);
      expect(Math.min(...shareIds)).toBe(1);
      expect(Math.max(...shareIds)).toBe(5);
    });

    it('should throw on invalid threshold', () => {
      const secret = secureRandomBytes(32);

      expect(() => splitSecret(secret, 1, 5)).toThrow('Threshold must be at least');
      expect(() => splitSecret(secret, 6, 5)).toThrow('Threshold cannot exceed');
    });

    it('should throw on invalid total shares', () => {
      const secret = secureRandomBytes(32);

      expect(() => splitSecret(secret, 3, 20)).toThrow('Total shares cannot exceed');
    });

    it('should include purpose in shares', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5, 'master-key-backup');

      expect(shares[0].purpose).toBe('master-key-backup');
    });
  });

  describe('reconstructSecret', () => {
    it('should reconstruct secret from threshold shares', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Use first 3 shares
      const reconstructed = reconstructSecret(shares.slice(0, 3));

      expect(reconstructed).toEqual(secret);
    });

    it('should reconstruct from any combination of threshold shares', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Test different combinations
      const combo1 = reconstructSecret([shares[0], shares[1], shares[2]]);
      const combo2 = reconstructSecret([shares[1], shares[3], shares[4]]);
      const combo3 = reconstructSecret([shares[0], shares[2], shares[4]]);

      expect(combo1).toEqual(secret);
      expect(combo2).toEqual(secret);
      expect(combo3).toEqual(secret);
    });

    it('should throw with insufficient shares', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Only 2 shares (need 3)
      expect(() => reconstructSecret(shares.slice(0, 2))).toThrow(
        'Need at least 3 shares'
      );
    });

    it('should throw with incompatible shares', () => {
      const secret1 = secureRandomBytes(32);
      const secret2 = secureRandomBytes(32);

      const shares1 = splitSecret(secret1, 3, 5);
      const shares2 = splitSecret(secret2, 3, 5);

      // Mix shares from different secrets
      const mixed = [shares1[0], shares1[1], shares2[2]];

      // Reconstruction with mixed shares produces wrong result
      const reconstructed = reconstructSecret(mixed);

      // Should not match either original secret
      expect(reconstructed).not.toEqual(secret1);
      expect(reconstructed).not.toEqual(secret2);
    });
  });

  describe('verifyShare', () => {
    it('should validate correct share', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      expect(verifyShare(shares[0])).toBe(true);
    });

    it('should reject invalid share ID', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      const invalidShare = { ...shares[0], shareId: 0 };
      expect(verifyShare(invalidShare)).toBe(false);
    });

    it('should reject invalid threshold', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      const invalidShare = { ...shares[0], threshold: 1 };
      expect(verifyShare(invalidShare)).toBe(false);
    });
  });

  describe('verifySharesCompatible', () => {
    it('should accept compatible shares', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      expect(verifySharesCompatible(shares.slice(0, 3))).toBe(true);
    });

    it('should reject shares with different parameters', () => {
      const secret = secureRandomBytes(32);
      const shares1 = splitSecret(secret, 3, 5);
      const shares2 = splitSecret(secret, 2, 4);

      expect(verifySharesCompatible([shares1[0], shares2[0]])).toBe(false);
    });

    it('should reject duplicate shares', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      // Use same share twice
      expect(verifySharesCompatible([shares[0], shares[0], shares[1]])).toBe(false);
    });
  });

  describe('getSharesInfo', () => {
    it('should return correct share info', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5, 'test');

      const info = getSharesInfo(shares);

      expect(info.count).toBe(5);
      expect(info.threshold).toBe(3);
      expect(info.total).toBe(5);
      expect(info.canReconstruct).toBe(true);
      expect(info.purpose).toBe('test');
    });

    it('should indicate when cannot reconstruct', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      const info = getSharesInfo(shares.slice(0, 2)); // Only 2 shares

      expect(info.canReconstruct).toBe(false);
    });
  });

  describe('serializeShare', () => {
    it('should serialize and deserialize share', () => {
      const secret = secureRandomBytes(32);
      const shares = splitSecret(secret, 3, 5);

      const serialized = serializeShare(shares[0]);
      const deserialized = deserializeShare(serialized);

      expect(deserialized.shareId).toBe(shares[0].shareId);
      expect(deserialized.data).toEqual(shares[0].data);
      expect(deserialized.threshold).toBe(shares[0].threshold);
    });

    it('should throw on invalid serialized data', () => {
      expect(() => deserializeShare('invalid-data')).toThrow();
    });
  });
});

// ============================================================================
// BIP39 RECOVERY CODE TESTS
// ============================================================================

describe('BIP39 Recovery Codes', () => {
  describe('generateRecoveryCode', () => {
    it('should generate 24-word mnemonic', () => {
      const recovery = generateRecoveryCode();

      expect(recovery.mnemonic).toBeDefined();
      expect(is24Words(recovery.mnemonic)).toBe(true);
      expect(recovery.checksum).toBeDefined();
      expect(recovery.checksum.length).toBe(8); // 8 hex characters
    });

    it('should generate unique mnemonics', () => {
      const recovery1 = generateRecoveryCode();
      const recovery2 = generateRecoveryCode();

      expect(recovery1.mnemonic).not.toBe(recovery2.mnemonic);
    });

    it('should generate valid BIP39 mnemonics', () => {
      const recovery = generateRecoveryCode();

      expect(validateRecoveryCode(recovery.mnemonic)).toBe(true);
    });
  });

  describe('validateRecoveryCode', () => {
    it('should validate correct mnemonic', () => {
      const recovery = generateRecoveryCode();

      expect(validateRecoveryCode(recovery.mnemonic)).toBe(true);
    });

    it('should reject invalid mnemonic', () => {
      expect(validateRecoveryCode('invalid word mnemonic')).toBe(false);
    });

    it('should reject mnemonic with wrong checksum', () => {
      // Generate valid mnemonic and change last word to invalidate checksum
      const recovery = generateRecoveryCode();
      const words = recovery.mnemonic.split(' ');
      words[23] = 'invalid'; // Replace last word with invalid word

      expect(validateRecoveryCode(words.join(' '))).toBe(false);
    });
  });

  describe('deriveKeyFromRecoveryCode', () => {
    it('should derive key from mnemonic', () => {
      const recovery = generateRecoveryCode();
      const key = deriveKeyFromRecoveryCode(recovery.mnemonic);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32); // 256 bits
    });

    it('should derive same key from same mnemonic', () => {
      const recovery = generateRecoveryCode();

      const key1 = deriveKeyFromRecoveryCode(recovery.mnemonic);
      const key2 = deriveKeyFromRecoveryCode(recovery.mnemonic);

      expect(key1).toEqual(key2);
    });

    it('should derive different keys from different mnemonics', () => {
      const recovery1 = generateRecoveryCode();
      const recovery2 = generateRecoveryCode();

      const key1 = deriveKeyFromRecoveryCode(recovery1.mnemonic);
      const key2 = deriveKeyFromRecoveryCode(recovery2.mnemonic);

      expect(key1).not.toEqual(key2);
    });

    it('should throw on invalid mnemonic', () => {
      expect(() => deriveKeyFromRecoveryCode('invalid mnemonic')).toThrow(
        'Invalid recovery code'
      );
    });
  });

  describe('formatMnemonic', () => {
    it('should format mnemonic into groups', () => {
      const recovery = generateRecoveryCode();
      const formatted = formatMnemonic(recovery.mnemonic, 4);

      const lines = formatted.split('\n');
      expect(lines.length).toBe(6); // 24 words / 4 = 6 lines
    });
  });

  describe('normalizeMnemonic', () => {
    it('should normalize mnemonic', () => {
      const input = '  WORD1   word2  Word3 ';
      const normalized = normalizeMnemonic(input);

      expect(normalized).toBe('word1 word2 word3');
    });

    it('should handle multiple spaces', () => {
      const input = 'word1    word2     word3';
      const normalized = normalizeMnemonic(input);

      expect(normalized).toBe('word1 word2 word3');
    });
  });

  describe('getWordCount', () => {
    it('should count words correctly', () => {
      const recovery = generateRecoveryCode();

      expect(getWordCount(recovery.mnemonic)).toBe(24);
    });

    it('should handle extra spaces', () => {
      const input = '  word1  word2   word3  ';

      expect(getWordCount(input)).toBe(3);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Shamir + Recovery Code', () => {
  it('should split and reconstruct recovery-derived key', () => {
    // Generate recovery code
    const recovery = generateRecoveryCode();

    // Derive key from recovery code
    const masterKey = deriveKeyFromRecoveryCode(recovery.mnemonic);

    // Split key using Shamir
    const shares = splitSecret(masterKey, 3, 5, 'recovery-backup');

    // Reconstruct from 3 shares
    const reconstructed = reconstructSecret(shares.slice(0, 3));

    expect(reconstructed).toEqual(masterKey);
  });

  it('should work with serialized shares', () => {
    const secret = secureRandomBytes(32);
    const shares = splitSecret(secret, 3, 5);

    // Serialize shares (for storage/transmission)
    const serialized = shares.map(s => serializeShare(s));

    // Deserialize shares
    const deserialized = serialized.map(s => deserializeShare(s));

    // Reconstruct
    const reconstructed = reconstructSecret(deserialized.slice(0, 3));

    expect(reconstructed).toEqual(secret);
  });
});
