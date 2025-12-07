/**
 * Album Type Selector Component
 *
 * Allows users to choose between Family and Private albums during creation.
 *
 * Two-Tier Model:
 * - Family Albums: Hybrid encryption, AI features available with consent
 * - Private Albums: True E2EE, no AI, maximum privacy
 *
 * @module Components/Albums/AlbumTypeSelector
 */

import React, { useState } from 'react';
import { AlbumPrivacyType } from '../../types/privacy';

// ============================================================================
// TYPES
// ============================================================================

export interface AlbumTypeSelectorProps {
  /** Callback when album type is selected */
  onSelect: (type: AlbumPrivacyType) => void;

  /** Default selected type (optional) */
  defaultType?: AlbumPrivacyType;

  /** Show as modal (vs inline) */
  isModal?: boolean;

  /** Callback to close modal */
  onClose?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AlbumTypeSelector: React.FC<AlbumTypeSelectorProps> = ({
  onSelect,
  defaultType = AlbumPrivacyType.FAMILY,
  isModal = false,
  onClose,
}) => {
  const [selectedType, setSelectedType] = useState<AlbumPrivacyType>(defaultType);

  const handleSelect = (type: AlbumPrivacyType) => {
    setSelectedType(type);
  };

  const handleContinue = () => {
    onSelect(selectedType);
    onClose?.();
  };

  const content = (
    <div className="w-full max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Choose Album Type
        </h2>
        <p className="text-gray-600">
          Select the privacy level that best fits your needs.
        </p>
      </div>

      {/* Album Type Options */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">

        {/* Family Album Option */}
        <div
          onClick={() => handleSelect(AlbumPrivacyType.FAMILY)}
          className={`
            relative p-6 border-2 rounded-lg cursor-pointer transition-all
            ${selectedType === AlbumPrivacyType.FAMILY
              ? 'border-blue-500 bg-blue-50 shadow-lg'
              : 'border-gray-300 bg-white hover:border-blue-300 hover:shadow-md'
            }
          `}
        >
          {/* Radio Button */}
          <div className="flex items-start mb-4">
            <input
              type="radio"
              id="family"
              name="albumType"
              checked={selectedType === AlbumPrivacyType.FAMILY}
              onChange={() => handleSelect(AlbumPrivacyType.FAMILY)}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="family"
              className="ml-3 flex-1 cursor-pointer"
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-2 flex items-center">
                <span className="mr-2">📸</span>
                Family Album
                <span className="ml-2 text-sm font-normal text-blue-600">
                  (Recommended)
                </span>
              </h3>
            </label>
          </div>

          {/* Features List */}
          <ul className="space-y-2 mb-4 ml-7">
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>AI-powered captions & tagging</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>Face detection & grouping</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>Smart search across photos</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>Easy sharing with family</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>Encrypted storage</span>
            </li>
          </ul>

          {/* Privacy Note */}
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded ml-7">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">⚠️ Note:</span> AI features temporarily
              process photos on Google's servers (with your consent). Storage remains
              zero-knowledge encrypted.
            </p>
          </div>
        </div>

        {/* Private Album Option */}
        <div
          onClick={() => handleSelect(AlbumPrivacyType.PRIVATE)}
          className={`
            relative p-6 border-2 rounded-lg cursor-pointer transition-all
            ${selectedType === AlbumPrivacyType.PRIVATE
              ? 'border-green-500 bg-green-50 shadow-lg'
              : 'border-gray-300 bg-white hover:border-green-300 hover:shadow-md'
            }
          `}
        >
          {/* Radio Button */}
          <div className="flex items-start mb-4">
            <input
              type="radio"
              id="private"
              name="albumType"
              checked={selectedType === AlbumPrivacyType.PRIVATE}
              onChange={() => handleSelect(AlbumPrivacyType.PRIVATE)}
              className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500"
            />
            <label
              htmlFor="private"
              className="ml-3 flex-1 cursor-pointer"
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-2 flex items-center">
                <span className="mr-2">🔒</span>
                Private Album
                <span className="ml-2 text-sm font-normal text-green-600">
                  (Maximum Privacy)
                </span>
              </h3>
            </label>
          </div>

          {/* Features List */}
          <ul className="space-y-2 mb-4 ml-7">
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>True end-to-end encryption</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>No cloud AI processing</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>Keys never leave your device</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>Complete privacy guarantee</span>
            </li>
            <li className="flex items-start text-gray-700">
              <span className="text-green-600 mr-2">✓</span>
              <span>Maximum security</span>
            </li>
          </ul>

          {/* Privacy Note */}
          <div className="p-3 bg-red-50 border border-red-200 rounded ml-7">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">⚠️ Warning:</span> No AI features
              available. If you lose your passphrase, photos cannot be recovered.
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Table (Optional) */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold text-gray-900 mb-3">Quick Comparison:</h4>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="font-medium text-gray-700">Feature</div>
          <div className="font-medium text-blue-700 text-center">Family</div>
          <div className="font-medium text-green-700 text-center">Private</div>

          <div className="text-gray-600">AI Features</div>
          <div className="text-center">✓</div>
          <div className="text-center">✗</div>

          <div className="text-gray-600">Cloud Processing</div>
          <div className="text-center">Optional</div>
          <div className="text-center">Never</div>

          <div className="text-gray-600">Sharing</div>
          <div className="text-center">Easy</div>
          <div className="text-center">Limited</div>

          <div className="text-gray-600">Privacy Level</div>
          <div className="text-center">High</div>
          <div className="text-center">Maximum</div>
        </div>
      </div>

      {/* Continue Button */}
      <div className="flex justify-end">
        {isModal && (
          <button
            onClick={onClose}
            className="mr-3 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleContinue}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          Continue with {selectedType === AlbumPrivacyType.FAMILY ? 'Family' : 'Private'} Album
        </button>
      </div>
    </div>
  );

  // Return as modal or inline
  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto p-8">
          {content}
        </div>
      </div>
    );
  }

  return <div className="p-6">{content}</div>;
};

export default AlbumTypeSelector;
