/**
 * Consent Manager Test Suite
 *
 * Tests GDPR compliance, consent tracking, and privacy event logging.
 *
 * @module Tests/ConsentManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsentManager } from '../consentManager';
import {
  AIConsent,
  AlbumPrivacyType,
  CURRENT_CONSENT_VERSION,
  LegalBasis,
  DataCategory,
} from '../../../../src/types/privacy';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firebase
vi.mock('../../../../lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'test-user-123',
    },
  },
}));

// Mock Firestore functions
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  Timestamp: {
    now: vi.fn(() => ({ toMillis: () => Date.now() })),
    fromMillis: vi.fn((ms) => ({ toMillis: () => ms })),
  },
}));

// ============================================================================
// TEST SETUP
// ============================================================================

describe('ConsentManager', () => {
  let consentManager: ConsentManager;

  beforeEach(() => {
    consentManager = new ConsentManager();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // CONSENT REQUEST TESTS
  // ==========================================================================

  describe('requestAIConsent', () => {
    it('should create consent with all required fields', async () => {
      const mockShowModal = vi.fn(() => Promise.resolve(true));

      const consent = await consentManager.requestAIConsent(
        'album_1',
        { aiCaptioning: true },
        mockShowModal
      );

      expect(consent).toBeTruthy();
      expect(consent).toMatchObject({
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: expect.any(Number),
        consentVersion: CURRENT_CONSENT_VERSION,
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: expect.stringMatching(/US|EU|Global/),
        },
        consentMethod: 'modal',
      });
    });

    it('should return null when user denies consent', async () => {
      const mockShowModal = vi.fn(() => Promise.resolve(false));

      const consent = await consentManager.requestAIConsent(
        'album_1',
        { aiCaptioning: true },
        mockShowModal
      );

      expect(consent).toBeNull();
    });

    it('should enable multiple features when requested', async () => {
      const mockShowModal = vi.fn(() => Promise.resolve(true));

      const consent = await consentManager.requestAIConsent(
        'album_1',
        {
          aiCaptioning: true,
          aiFaceDetection: true,
          aiTagging: true,
        },
        mockShowModal
      );

      expect(consent?.features).toMatchObject({
        aiCaptioning: true,
        aiFaceDetection: true,
        aiTagging: true,
        aiSearchIndexing: false,
      });
    });

    it('should generate unique consent IDs', async () => {
      const mockShowModal = vi.fn(() => Promise.resolve(true));

      const consent1 = await consentManager.requestAIConsent(
        'album_1',
        { aiCaptioning: true },
        mockShowModal
      );

      const consent2 = await consentManager.requestAIConsent(
        'album_2',
        { aiCaptioning: true },
        mockShowModal
      );

      expect(consent1?.id).toBeTruthy();
      expect(consent2?.id).toBeTruthy();
      expect(consent1?.id).not.toBe(consent2?.id);
    });
  });

  // ==========================================================================
  // CONSENT VALIDATION TESTS
  // ==========================================================================

  describe('isConsentValid', () => {
    it('should return true for valid consent', () => {
      const consent: AIConsent = {
        id: 'consent_1',
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: Date.now(),
        consentVersion: CURRENT_CONSENT_VERSION,
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: 'Global',
        },
        consentMethod: 'modal',
      };

      expect(consentManager.isConsentValid(consent)).toBe(true);
    });

    it('should return false for revoked consent', () => {
      const consent: AIConsent = {
        id: 'consent_1',
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: Date.now(),
        consentVersion: CURRENT_CONSENT_VERSION,
        revokedAt: Date.now(),
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: 'Global',
        },
        consentMethod: 'modal',
      };

      expect(consentManager.isConsentValid(consent)).toBe(false);
    });

    it('should return false for expired consent', () => {
      const consent: AIConsent = {
        id: 'consent_1',
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: Date.now() - 1000 * 60 * 60 * 24 * 365, // 1 year ago
        consentVersion: CURRENT_CONSENT_VERSION,
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: 'Global',
        },
        consentMethod: 'modal',
      };

      expect(consentManager.isConsentValid(consent)).toBe(false);
    });

    it('should return false for outdated consent version', () => {
      const consent: AIConsent = {
        id: 'consent_1',
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: Date.now(),
        consentVersion: '0.9.0', // Old version
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: 'Global',
        },
        consentMethod: 'modal',
      };

      expect(consentManager.isConsentValid(consent)).toBe(false);
    });
  });

  // ==========================================================================
  // FEATURE CONSENT TESTS
  // ==========================================================================

  describe('hasFeatureConsent', () => {
    it('should return true for consented feature', async () => {
      // Mock existing consent
      const mockConsent: AIConsent = {
        id: 'consent_1',
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: Date.now(),
        consentVersion: CURRENT_CONSENT_VERSION,
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: 'Global',
        },
        consentMethod: 'modal',
      };

      vi.spyOn(consentManager, 'getAIConsent').mockResolvedValue(mockConsent);

      const hasConsent = await consentManager.hasFeatureConsent('album_1', 'aiCaptioning');
      expect(hasConsent).toBe(true);
    });

    it('should return false for non-consented feature', async () => {
      const mockConsent: AIConsent = {
        id: 'consent_1',
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: Date.now(),
        consentVersion: CURRENT_CONSENT_VERSION,
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: 'Global',
        },
        consentMethod: 'modal',
      };

      vi.spyOn(consentManager, 'getAIConsent').mockResolvedValue(mockConsent);

      const hasConsent = await consentManager.hasFeatureConsent('album_1', 'aiFaceDetection');
      expect(hasConsent).toBe(false);
    });

    it('should return false when no consent exists', async () => {
      vi.spyOn(consentManager, 'getAIConsent').mockResolvedValue(null);

      const hasConsent = await consentManager.hasFeatureConsent('album_1', 'aiCaptioning');
      expect(hasConsent).toBe(false);
    });
  });

  // ==========================================================================
  // ALBUM TYPE TESTS
  // ==========================================================================

  describe('canUseAI', () => {
    it('should return false for private albums', async () => {
      const canUse = await consentManager.canUseAI('album_1', AlbumPrivacyType.PRIVATE);
      expect(canUse).toBe(false);
    });

    it('should return true for family albums with consent', async () => {
      const mockConsent: AIConsent = {
        id: 'consent_1',
        userId: 'test-user-123',
        albumId: 'album_1',
        consentedAt: Date.now(),
        consentVersion: CURRENT_CONSENT_VERSION,
        features: {
          aiCaptioning: true,
          aiFaceDetection: false,
          aiTagging: false,
          aiSearchIndexing: false,
        },
        disclosures: {
          temporaryCloudProcessing: true,
          googleAIUsage: true,
          notUsedForTraining: true,
          dataLocation: 'Global',
        },
        consentMethod: 'modal',
      };

      vi.spyOn(consentManager, 'getAIConsent').mockResolvedValue(mockConsent);

      const canUse = await consentManager.canUseAI('album_1', AlbumPrivacyType.FAMILY);
      expect(canUse).toBe(true);
    });

    it('should return false for family albums without consent', async () => {
      vi.spyOn(consentManager, 'getAIConsent').mockResolvedValue(null);

      const canUse = await consentManager.canUseAI('album_1', AlbumPrivacyType.FAMILY);
      expect(canUse).toBe(false);
    });
  });

  // ==========================================================================
  // PRIVACY EVENT LOGGING TESTS
  // ==========================================================================

  describe('logPrivacyEvent', () => {
    it('should create privacy event with required fields', async () => {
      await consentManager.logPrivacyEvent({
        eventType: 'consent_given',
        albumId: 'album_1',
        details: {
          action: 'ai_consent_given',
          outcome: 'success',
        },
        legalBasis: LegalBasis.CONSENT,
        dataCategories: [DataCategory.PHOTOS],
        processingPurpose: 'AI analysis',
      });

      // Verify setDoc was called (mocked)
      const { setDoc } = await import('firebase/firestore');
      expect(setDoc).toHaveBeenCalled();
    });

    it('should use default values when optional fields omitted', async () => {
      await consentManager.logPrivacyEvent({
        eventType: 'photo_uploaded',
        details: {
          action: 'photo_upload',
          outcome: 'success',
        },
      });

      // Should use defaults: LegalBasis.CONSENT, empty dataCategories, default purpose
      const { setDoc } = await import('firebase/firestore');
      expect(setDoc).toHaveBeenCalled();
    });
  });
});
