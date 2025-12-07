/**
 * Privacy Event Logging Utilities
 *
 * Provides convenience functions for logging common privacy events
 * Required for GDPR compliance and audit trails.
 *
 * @module PrivacyLogger
 */

import { consentManager } from './consentManager';
import {
  PrivacyEventType,
  DataCategory,
  ProcessingPurpose,
  LegalBasis,
} from '../../../src/types/privacy';

// ============================================================================
// PRIVACY EVENT LOGGING HELPERS
// ============================================================================

/**
 * Log photo upload event
 *
 * @param albumId - Album where photo was uploaded
 * @param photoId - Uploaded photo ID
 * @param encrypted - Whether photo was encrypted
 */
export async function logPhotoUpload(
  albumId: string,
  photoId: string,
  encrypted: boolean
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'photo_uploaded',
    albumId,
    photoId,
    details: {
      action: 'photo_upload',
      outcome: 'success',
      metadata: { encrypted },
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
    processingPurpose: ProcessingPurpose.STORAGE,
  });
}

/**
 * Log photo deletion event
 *
 * @param albumId - Album where photo was deleted
 * @param photoId - Deleted photo ID
 */
export async function logPhotoDeletion(
  albumId: string,
  photoId: string
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'photo_deleted',
    albumId,
    photoId,
    details: {
      action: 'photo_deletion',
      outcome: 'success',
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
    processingPurpose: 'User requested photo deletion',
  });
}

/**
 * Log album creation event
 *
 * @param albumId - Created album ID
 * @param albumType - Type of album (family/private)
 */
export async function logAlbumCreation(
  albumId: string,
  albumType: 'family' | 'private'
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'album_created',
    albumId,
    details: {
      action: 'album_creation',
      outcome: 'success',
      metadata: { albumType },
    },
    legalBasis: LegalBasis.CONTRACT,
    dataCategories: [DataCategory.METADATA],
    processingPurpose: 'User created new album',
  });
}

/**
 * Log album deletion event
 *
 * @param albumId - Deleted album ID
 * @param photoCount - Number of photos deleted
 */
export async function logAlbumDeletion(
  albumId: string,
  photoCount: number
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'album_deleted',
    albumId,
    details: {
      action: 'album_deletion',
      outcome: 'success',
      metadata: { photoCount },
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
    processingPurpose: 'User requested album deletion',
  });
}

/**
 * Log AI processing event
 *
 * @param albumId - Album being processed
 * @param photoId - Photo being processed
 * @param featureType - Type of AI feature used
 * @param success - Whether processing succeeded
 */
export async function logAIProcessing(
  albumId: string,
  photoId: string,
  featureType: 'captioning' | 'face_detection' | 'tagging' | 'search',
  success: boolean
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'ai_processing',
    albumId,
    photoId,
    details: {
      action: `ai_${featureType}`,
      outcome: success ? 'success' : 'failure',
      metadata: { featureType },
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [
      DataCategory.PHOTOS,
      DataCategory.METADATA,
      featureType === 'face_detection' ? DataCategory.FACES : DataCategory.TAGS,
    ],
    processingPurpose: ProcessingPurpose.AI_ANALYSIS,
  });
}

/**
 * Log encryption key rotation event
 *
 * @param albumId - Album with rotated key
 * @param reason - Reason for rotation
 */
export async function logKeyRotation(
  albumId: string,
  reason: string
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'key_rotation',
    albumId,
    details: {
      action: 'key_rotation',
      outcome: 'success',
      metadata: { reason },
    },
    legalBasis: LegalBasis.LEGITIMATE_INTEREST,
    dataCategories: [DataCategory.ENCRYPTION_KEYS],
    processingPurpose: 'Security maintenance - key rotation',
  });
}

/**
 * Log data export request (GDPR)
 *
 * @param exportType - Type of data export
 */
export async function logDataExport(
  exportType: 'full' | 'photos' | 'metadata' | 'privacy_events'
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'data_export',
    details: {
      action: 'data_export_request',
      outcome: 'success',
      metadata: { exportType },
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [
      DataCategory.PHOTOS,
      DataCategory.METADATA,
      DataCategory.USER_PROFILE,
    ],
    processingPurpose: 'GDPR data portability request',
  });
}

/**
 * Log data deletion request (GDPR "Right to be Forgotten")
 *
 * @param scope - Scope of deletion
 */
export async function logDataDeletion(
  scope: 'all' | 'album' | 'photos',
  albumId?: string
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'data_deletion',
    albumId,
    details: {
      action: 'data_deletion_request',
      outcome: 'success',
      metadata: { scope },
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [
      DataCategory.PHOTOS,
      DataCategory.METADATA,
      DataCategory.ENCRYPTION_KEYS,
    ],
    processingPurpose: 'GDPR right to erasure request',
  });
}

// ============================================================================
// BATCH LOGGING
// ============================================================================

/**
 * Log multiple photo uploads in batch
 *
 * More efficient than individual logs for bulk operations.
 *
 * @param uploads - Array of upload details
 */
export async function logBatchPhotoUploads(
  uploads: Array<{
    albumId: string;
    photoId: string;
    encrypted: boolean;
  }>
): Promise<void> {
  // Log summary event
  await consentManager.logPrivacyEvent({
    eventType: 'photo_uploaded',
    details: {
      action: 'batch_photo_upload',
      outcome: 'success',
      metadata: {
        count: uploads.length,
        encrypted: uploads.every(u => u.encrypted),
      },
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
    processingPurpose: ProcessingPurpose.STORAGE,
  });
}

/**
 * Log multiple photo deletions in batch
 *
 * @param deletions - Array of deletion details
 */
export async function logBatchPhotoDeletions(
  deletions: Array<{
    albumId: string;
    photoId: string;
  }>
): Promise<void> {
  await consentManager.logPrivacyEvent({
    eventType: 'photo_deleted',
    details: {
      action: 'batch_photo_deletion',
      outcome: 'success',
      metadata: { count: deletions.length },
    },
    legalBasis: LegalBasis.CONSENT,
    dataCategories: [DataCategory.PHOTOS, DataCategory.METADATA],
    processingPurpose: 'User requested batch photo deletion',
  });
}

// ============================================================================
// PRIVACY EVENT QUERIES
// ============================================================================

/**
 * Get recent privacy events for user
 *
 * Useful for Privacy Dashboard.
 *
 * @param limitCount - Maximum events to return
 * @returns Recent privacy events
 */
export async function getRecentPrivacyEvents(limitCount: number = 50) {
  return consentManager.getPrivacyEvents(undefined, limitCount);
}

/**
 * Get AI processing events for user
 *
 * Shows history of AI feature usage.
 *
 * @param limitCount - Maximum events to return
 * @returns AI processing events
 */
export async function getAIProcessingEvents(limitCount: number = 50) {
  return consentManager.getPrivacyEvents('ai_processing', limitCount);
}

/**
 * Get consent history for user
 *
 * Shows all consent given/revoked events.
 *
 * @param limitCount - Maximum events to return
 * @returns Consent events
 */
export async function getConsentHistory(limitCount: number = 50) {
  const given = await consentManager.getPrivacyEvents('consent_given', limitCount);
  const revoked = await consentManager.getPrivacyEvents('consent_revoked', limitCount);

  // Merge and sort by timestamp
  return [...given, ...revoked].sort((a, b) => b.timestamp - a.timestamp);
}
