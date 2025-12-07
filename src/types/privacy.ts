/**
 * Privacy and AI Consent Type Definitions
 *
 * Implements GDPR-compliant consent tracking and privacy event logging.
 *
 * @module Types/Privacy
 */

// ============================================================================
// AI CONSENT TYPES
// ============================================================================

/**
 * AI Consent Record
 *
 * Tracks user consent for AI features on Family Albums.
 * Required for GDPR compliance and App Store transparency.
 */
export interface AIConsent {
  id: string;
  userId: string;
  albumId: string;
  consentedAt: number;
  consentVersion: string; // Track policy changes
  expiresAt?: number; // Optional expiration
  revokedAt?: number; // If consent was revoked

  // Granular feature consent
  features: {
    aiCaptioning: boolean;
    aiFaceDetection: boolean;
    aiTagging: boolean;
    aiSearchIndexing: boolean;
  };

  // User acknowledged disclosures
  disclosures: {
    temporaryCloudProcessing: boolean;
    googleAIUsage: boolean;
    notUsedForTraining: boolean;
    dataLocation: 'US' | 'EU' | 'Global'; // For international transfers
  };

  // Audit trail
  ipAddress?: string;
  userAgent?: string;
  consentMethod: 'modal' | 'settings' | 'onboarding';
}

/**
 * Privacy Event Type
 *
 * For GDPR audit trail - immutable log of all privacy-related actions.
 */
export type PrivacyEventType =
  | 'ai_processing'
  | 'consent_given'
  | 'consent_revoked'
  | 'consent_denied'
  | 'key_rotation'
  | 'data_export'
  | 'data_deletion'
  | 'photo_uploaded'
  | 'photo_deleted'
  | 'album_created'
  | 'album_deleted';

/**
 * Privacy Event Record
 *
 * Immutable audit log entry for GDPR compliance.
 */
export interface PrivacyEvent {
  id: string;
  eventType: PrivacyEventType;
  timestamp: number;
  userId: string;
  albumId?: string;
  photoId?: string;

  details: {
    action: string;
    outcome: 'success' | 'failure';
    metadata?: Record<string, any>;
  };

  // GDPR requirements
  legalBasis: 'consent' | 'contract' | 'legitimate_interest';
  dataCategories: string[]; // e.g., ['photos', 'metadata']
  processingPurpose: string;
}

// ============================================================================
// ALBUM PRIVACY TYPES
// ============================================================================

/**
 * Album Privacy Type
 *
 * Two-tier model:
 * - FAMILY: Hybrid encryption, AI allowed with consent
 * - PRIVATE: True E2EE, no AI, maximum privacy
 */
export enum AlbumPrivacyType {
  FAMILY = 'family',   // Hybrid: AI allowed with consent
  PRIVATE = 'private', // E2EE: No AI, max privacy
}

/**
 * Album Privacy Settings
 *
 * Privacy configuration for an album.
 */
export interface AlbumPrivacySettings {
  type: AlbumPrivacyType;

  // Family Albums only
  aiEnabled?: boolean;
  aiConsentId?: string;

  // Private Albums: metadata is encrypted
  encryptedMetadata?: {
    name: string; // Encrypted
    description: string; // Encrypted
    ciphertext: string;
    iv: string;
  };
}

// ============================================================================
// CONSENT CONSTANTS
// ============================================================================

/**
 * Current consent policy version
 *
 * Increment when privacy policy changes to require re-consent.
 */
export const CURRENT_CONSENT_VERSION = '1.0.0';

/**
 * Consent validity period (in milliseconds)
 *
 * Optional: Set to undefined for perpetual consent until revoked.
 */
export const CONSENT_VALIDITY_PERIOD: number | undefined = undefined;

// ============================================================================
// DATA CATEGORIES
// ============================================================================

/**
 * GDPR Data Categories
 *
 * Used in privacy events to track what type of data is being processed.
 */
export enum DataCategory {
  PHOTOS = 'photos',
  METADATA = 'metadata',
  LOCATION = 'location',
  FACES = 'faces',
  TAGS = 'tags',
  CAPTIONS = 'captions',
  ENCRYPTION_KEYS = 'encryption_keys',
  USER_PROFILE = 'user_profile',
}

/**
 * Processing Purpose
 *
 * GDPR requires documenting the purpose of data processing.
 */
export enum ProcessingPurpose {
  AI_ANALYSIS = 'AI analysis for captioning and tagging',
  STORAGE = 'Encrypted storage of user photos',
  SHARING = 'Sharing photos with family members',
  SEARCH = 'Photo search and organization',
  BACKUP = 'Backup and recovery',
  ENCRYPTION = 'End-to-end encryption',
}

/**
 * Legal Basis for Processing
 *
 * GDPR requires identifying the legal basis for each processing activity.
 */
export enum LegalBasis {
  CONSENT = 'consent',
  CONTRACT = 'contract',
  LEGITIMATE_INTEREST = 'legitimate_interest',
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Consent Request Options
 *
 * Options when requesting AI consent from user.
 */
export interface ConsentRequestOptions {
  albumId: string;
  albumName: string;
  features: Partial<AIConsent['features']>;
}

/**
 * Privacy Event Creation Options
 *
 * Simplified interface for creating privacy events.
 */
export interface CreatePrivacyEventOptions {
  eventType: PrivacyEventType;
  albumId?: string;
  photoId?: string;
  details: {
    action: string;
    outcome: 'success' | 'failure';
    metadata?: Record<string, any>;
  };
  legalBasis?: LegalBasis;
  dataCategories?: DataCategory[];
  processingPurpose?: ProcessingPurpose | string;
}
