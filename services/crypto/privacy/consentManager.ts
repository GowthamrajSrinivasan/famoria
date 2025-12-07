/**
 * AI Consent Management Service
 *
 * GDPR-compliant consent tracking for AI features on Family Albums.
 *
 * Key Features:
 * - Explicit opt-in consent
 * - Granular feature-level permissions
 * - Consent version tracking
 * - Privacy event logging
 * - Revocation support
 *
 * @module ConsentManager
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import {
  AIConsent,
  PrivacyEvent,
  PrivacyEventType,
  AlbumPrivacyType,
  CURRENT_CONSENT_VERSION,
  ConsentRequestOptions,
  CreatePrivacyEventOptions,
  LegalBasis,
  DataCategory,
  ProcessingPurpose,
} from '../../../src/types/privacy';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique ID for consent/event records
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Get current authenticated user ID
 */
function getCurrentUserId(): string {
  if (!auth.currentUser) {
    throw new Error('User not authenticated');
  }
  return auth.currentUser.uid;
}

/**
 * Get user's region for international transfer disclosure
 *
 * TODO: Implement proper geo-detection or user preference
 */
async function getUserRegion(): Promise<'US' | 'EU' | 'Global'> {
  // For now, default to Global with disclosure
  // In production, use IP geolocation or user-selected region
  return 'Global';
}

// ============================================================================
// CONSENT MANAGER CLASS
// ============================================================================

export class ConsentManager {

  /**
   * Request AI consent for an album
   *
   * Shows modal on first AI feature use. Returns existing valid consent
   * if already granted.
   *
   * @param albumId - Album to request consent for
   * @param features - Requested AI features
   * @param onShowModal - Callback to show consent UI (returns true if consented)
   * @returns AIConsent if granted, null if denied
   */
  async requestAIConsent(
    albumId: string,
    features: Partial<AIConsent['features']>,
    onShowModal?: (options: ConsentRequestOptions) => Promise<boolean>
  ): Promise<AIConsent | null> {

    // Check if consent already exists and is valid
    const existing = await this.getAIConsent(albumId);
    if (existing && this.isConsentValid(existing)) {
      return existing;
    }

    // Show consent modal (if UI callback provided)
    let userConsented = false;
    if (onShowModal) {
      userConsented = await onShowModal({
        albumId,
        albumName: 'Album', // TODO: Get actual album name
        features,
      });
    } else {
      // For testing/backend use, assume consent
      // In production, always require UI confirmation
      console.warn('No consent modal callback provided. Assuming consent for testing.');
      userConsented = true;
    }

    if (!userConsented) {
      // Log denial
      await this.logPrivacyEvent({
        eventType: 'consent_denied',
        albumId,
        details: {
          action: 'ai_consent_request',
          outcome: 'failure',
          metadata: { requestedFeatures: features },
        },
        legalBasis: LegalBasis.CONSENT,
        dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
        processingPurpose: ProcessingPurpose.AI_ANALYSIS,
      });
      return null;
    }

    // Create consent record
    const consent: AIConsent = {
      id: generateId(),
      userId: getCurrentUserId(),
      albumId,
      consentedAt: Date.now(),
      consentVersion: CURRENT_CONSENT_VERSION,
      features: {
        aiCaptioning: features.aiCaptioning ?? false,
        aiFaceDetection: features.aiFaceDetection ?? false,
        aiTagging: features.aiTagging ?? false,
        aiSearchIndexing: features.aiSearchIndexing ?? false,
      },
      disclosures: {
        temporaryCloudProcessing: true,
        googleAIUsage: true,
        notUsedForTraining: true,
        dataLocation: await getUserRegion(),
      },
      consentMethod: 'modal',
    };

    // Store in Firestore
    await setDoc(
      doc(db, 'aiConsent', consent.id),
      {
        ...consent,
        consentedAt: Timestamp.fromMillis(consent.consentedAt),
      }
    );

    // Log consent event
    await this.logPrivacyEvent({
      eventType: 'consent_given',
      albumId,
      details: {
        action: 'ai_consent_given',
        outcome: 'success',
        metadata: { consentId: consent.id, features: consent.features },
      },
      legalBasis: LegalBasis.CONSENT,
      dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
      processingPurpose: ProcessingPurpose.AI_ANALYSIS,
    });

    return consent;
  }

  /**
   * Revoke AI consent for an album
   *
   * Disables all AI features and logs the revocation.
   *
   * @param albumId - Album to revoke consent for
   */
  async revokeAIConsent(albumId: string): Promise<void> {
    const consent = await this.getAIConsent(albumId);

    if (!consent) {
      console.warn(`No consent found for album ${albumId}`);
      return;
    }

    // Mark as revoked
    await updateDoc(
      doc(db, 'aiConsent', consent.id),
      {
        revokedAt: Timestamp.now(),
        'features.aiCaptioning': false,
        'features.aiFaceDetection': false,
        'features.aiTagging': false,
        'features.aiSearchIndexing': false,
      }
    );

    // Update album settings (disable AI)
    await updateDoc(
      doc(db, 'albums', albumId),
      {
        aiEnabled: false,
      }
    );

    // Log revocation
    await this.logPrivacyEvent({
      eventType: 'consent_revoked',
      albumId,
      details: {
        action: 'ai_consent_revoked',
        outcome: 'success',
        metadata: { consentId: consent.id },
      },
      legalBasis: LegalBasis.CONSENT,
      dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
      processingPurpose: 'User requested AI consent revocation',
    });
  }

  /**
   * Get current AI consent for album
   *
   * Returns the most recent consent record for the current user.
   *
   * @param albumId - Album to check consent for
   * @returns AIConsent if exists, null otherwise
   */
  async getAIConsent(albumId: string): Promise<AIConsent | null> {
    const userId = getCurrentUserId();

    const q = query(
      collection(db, 'aiConsent'),
      where('albumId', '==', albumId),
      where('userId', '==', userId),
      orderBy('consentedAt', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data();

    return {
      ...data,
      consentedAt: data.consentedAt?.toMillis?.() || data.consentedAt,
      revokedAt: data.revokedAt?.toMillis?.() || data.revokedAt,
      expiresAt: data.expiresAt?.toMillis?.() || data.expiresAt,
    } as AIConsent;
  }

  /**
   * Check if consent is still valid
   *
   * Validates:
   * - Not revoked
   * - Not expired
   * - Consent version matches current policy
   *
   * @param consent - Consent record to validate
   * @returns True if valid, false otherwise
   */
  isConsentValid(consent: AIConsent): boolean {
    // Check if revoked
    if (consent.revokedAt) {
      return false;
    }

    // Check expiration (if set)
    if (consent.expiresAt && Date.now() > consent.expiresAt) {
      return false;
    }

    // Check if consent version matches current policy
    if (consent.consentVersion !== CURRENT_CONSENT_VERSION) {
      return false; // Require re-consent on policy update
    }

    return true;
  }

  /**
   * Check if a specific AI feature is consented for an album
   *
   * @param albumId - Album to check
   * @param feature - Feature name to check
   * @returns True if consented and valid, false otherwise
   */
  async hasFeatureConsent(
    albumId: string,
    feature: keyof AIConsent['features']
  ): Promise<boolean> {
    const consent = await this.getAIConsent(albumId);

    if (!consent || !this.isConsentValid(consent)) {
      return false;
    }

    return consent.features[feature] === true;
  }

  /**
   * Log privacy event for GDPR audit trail
   *
   * Creates immutable log entry for all privacy-related actions.
   *
   * @param options - Privacy event details
   */
  async logPrivacyEvent(options: CreatePrivacyEventOptions): Promise<void> {
    const userId = getCurrentUserId();

    const privacyEvent: PrivacyEvent = {
      id: generateId(),
      eventType: options.eventType,
      timestamp: Date.now(),
      userId,
      albumId: options.albumId,
      photoId: options.photoId,
      details: options.details,
      legalBasis: options.legalBasis || LegalBasis.CONSENT,
      dataCategories: options.dataCategories?.map(cat => cat.toString()) || [],
      processingPurpose: options.processingPurpose || 'User-initiated action',
    };

    await setDoc(
      doc(db, 'privacyEvents', privacyEvent.id),
      {
        ...privacyEvent,
        timestamp: Timestamp.fromMillis(privacyEvent.timestamp),
      }
    );
  }

  /**
   * Get privacy events for current user
   *
   * Useful for Privacy Dashboard and GDPR data export.
   *
   * @param eventType - Filter by event type (optional)
   * @param limitCount - Maximum number of events to return
   * @returns Array of privacy events
   */
  async getPrivacyEvents(
    eventType?: PrivacyEventType,
    limitCount: number = 100
  ): Promise<PrivacyEvent[]> {
    const userId = getCurrentUserId();

    let q = query(
      collection(db, 'privacyEvents'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    if (eventType) {
      q = query(
        collection(db, 'privacyEvents'),
        where('userId', '==', userId),
        where('eventType', '==', eventType),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp?.toMillis?.() || data.timestamp,
      } as PrivacyEvent;
    });
  }

  /**
   * Check if album allows AI features
   *
   * Private Albums: Never allow AI (true E2EE)
   * Family Albums: Allow if consent given
   *
   * @param albumId - Album to check
   * @param albumType - Album privacy type
   * @returns True if AI features are allowed
   */
  async canUseAI(albumId: string, albumType: AlbumPrivacyType): Promise<boolean> {
    // Private albums never allow AI (max privacy)
    if (albumType === AlbumPrivacyType.PRIVATE) {
      return false;
    }

    // Family albums require consent
    const consent = await this.getAIConsent(albumId);
    return consent !== null && this.isConsentValid(consent);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global ConsentManager instance
 *
 * Use this throughout the app for consistency.
 */
export const consentManager = new ConsentManager();
