/**
 * AI Consent Modal Component
 *
 * GDPR-compliant consent UI for AI features on Family Albums.
 *
 * Key Features:
 * - Clear disclosure of cloud processing
 * - Granular feature selection
 * - Explicit checkboxes for understanding
 * - Alternative privacy option (Private Albums)
 * - Legal compliance notices
 *
 * @module Components/Privacy/AIConsentModal
 */

import React, { useState } from 'react';
import { AIConsent } from '../../types/privacy';

// ============================================================================
// TYPES
// ============================================================================

export interface AIConsentModalProps {
  /** Album ID requesting consent */
  albumId: string;

  /** Display name of the album */
  albumName: string;

  /** AI features being requested */
  requestedFeatures: {
    aiCaptioning?: boolean;
    aiFaceDetection?: boolean;
    aiTagging?: boolean;
    aiSearchIndexing?: boolean;
  };

  /** Callback when user consents */
  onConsent: () => void;

  /** Callback when user denies */
  onDeny: () => void;

  /** Callback to close modal */
  onClose?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AIConsentModal: React.FC<AIConsentModalProps> = ({
  albumId,
  albumName,
  requestedFeatures,
  onConsent,
  onDeny,
  onClose,
}) => {
  // Track user acknowledgment of disclosures
  const [understood, setUnderstood] = useState({
    cloudProcessing: false,
    temporary: false,
    noTraining: false,
  });

  // All disclosures must be checked to enable consent
  const allUnderstood = Object.values(understood).every(v => v);

  const handleConsent = () => {
    if (!allUnderstood) {
      return;
    }
    onConsent();
    onClose?.();
  };

  const handleDeny = () => {
    onDeny();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Enable AI Features for "{albumName}"?
            </h2>
            <p className="text-gray-600">
              Please review the information below before enabling AI features.
            </p>
          </div>

          {/* Primary Message */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-gray-800">
              To provide AI-powered features, your photos will be temporarily processed
              by Google's AI service over a secure, encrypted connection.
            </p>
          </div>

          {/* Requested Features */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Requested Features:
            </h3>
            <ul className="space-y-2">
              {requestedFeatures.aiCaptioning && (
                <li className="flex items-center text-gray-700">
                  <span className="mr-2">✨</span>
                  AI-generated captions for your photos
                </li>
              )}
              {requestedFeatures.aiFaceDetection && (
                <li className="flex items-center text-gray-700">
                  <span className="mr-2">👤</span>
                  Face detection and automatic grouping
                </li>
              )}
              {requestedFeatures.aiTagging && (
                <li className="flex items-center text-gray-700">
                  <span className="mr-2">🏷️</span>
                  Automatic photo tagging and categorization
                </li>
              )}
              {requestedFeatures.aiSearchIndexing && (
                <li className="flex items-center text-gray-700">
                  <span className="mr-2">🔍</span>
                  Smart search across your photos
                </li>
              )}
            </ul>
          </div>

          {/* Disclosures */}
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Important Information:
            </h3>

            {/* Disclosure 1: Cloud Processing */}
            <label className="flex items-start space-x-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={understood.cloudProcessing}
                onChange={(e) =>
                  setUnderstood({ ...understood, cloudProcessing: e.target.checked })
                }
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                <strong className="font-semibold">
                  I understand that my photos will be temporarily sent to Google's servers
                </strong>{' '}
                for AI processing. Your photos remain encrypted in storage, but must be
                decrypted on your device before processing.
              </span>
            </label>

            {/* Disclosure 2: Temporary Processing */}
            <label className="flex items-start space-x-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={understood.temporary}
                onChange={(e) =>
                  setUnderstood({ ...understood, temporary: e.target.checked })
                }
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                <strong className="font-semibold">Processing is temporary.</strong>{' '}
                Photos are processed in real-time and deleted from Google's servers
                after results are returned.
              </span>
            </label>

            {/* Disclosure 3: No Training */}
            <label className="flex items-start space-x-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={understood.noTraining}
                onChange={(e) =>
                  setUnderstood({ ...understood, noTraining: e.target.checked })
                }
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                <strong className="font-semibold">
                  Your photos are not used for AI training.
                </strong>{' '}
                Google's AI processes your photos but does not store them for model
                training purposes.
              </span>
            </label>
          </div>

          {/* Privacy Alternative */}
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-md font-semibold text-gray-900 mb-2">
              Want Maximum Privacy?
            </h3>
            <p className="text-sm text-gray-700">
              Create a <strong>Private Album</strong> instead. Private Albums use
              end-to-end encryption and never send photos to any server, but AI
              features are not available.
            </p>
          </div>

          {/* Legal Notice */}
          <div className="mb-6 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              By enabling AI features, you consent to temporary processing of your
              photos as described. You can revoke this consent at any time in Privacy
              Settings. For users in the EU: Some processing may occur outside the EU.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleDeny}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
            >
              No, Keep AI Disabled
            </button>
            <button
              onClick={handleConsent}
              disabled={!allUnderstood}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                allUnderstood
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Yes, Enable AI Features
            </button>
          </div>

          {/* Help Text */}
          {!allUnderstood && (
            <p className="mt-3 text-sm text-center text-gray-500">
              Please check all boxes above to enable AI features
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIConsentModal;
