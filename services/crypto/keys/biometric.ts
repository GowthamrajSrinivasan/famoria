/**
 * Biometric Authentication
 *
 * WebAuthn-based biometric authentication for web platform.
 *
 * Supported Authenticators:
 * - Platform authenticators (TouchID, FaceID, Windows Hello)
 * - Security keys (Yubikey, etc.)
 *
 * @module Biometric
 */

import {
  BiometricAvailability,
  BiometricAuthResult,
  WebAuthnCredential,
  KeyStorageError,
  KeyStorageErrorCode,
} from '../../../src/types/keyStorage';

// ============================================================================
// WEBAUTHN CONFIGURATION
// ============================================================================

const RP_NAME = 'Famoria';
const RP_ID = window.location.hostname;

/**
 * Base64 URL encode
 */
function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64URLDecode(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================================
// AVAILABILITY CHECK
// ============================================================================

/**
 * Check if biometric authentication is available
 *
 * @returns Biometric availability information
 */
export async function isBiometricAvailable(): Promise<BiometricAvailability> {
  // Check if WebAuthn is supported
  if (!window.PublicKeyCredential) {
    return {
      available: false,
      biometryType: null,
      platform: 'web',
    };
  }

  try {
    // Check if platform authenticator is available
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

    return {
      available,
      biometryType: available ? 'webauthn' : null,
      platform: 'web',
    };
  } catch (error) {
    return {
      available: false,
      biometryType: null,
      platform: 'web',
    };
  }
}

// ============================================================================
// CREDENTIAL REGISTRATION
// ============================================================================

/**
 * Register biometric credential
 *
 * Creates a new WebAuthn credential for biometric authentication.
 *
 * @param userId - User identifier
 * @param userName - User name (email)
 * @returns WebAuthn credential
 */
export async function registerBiometric(
  userId: string,
  userName: string
): Promise<WebAuthnCredential> {
  const availability = await isBiometricAvailable();

  if (!availability.available) {
    throw new KeyStorageError(
      'Biometric authentication not available',
      KeyStorageErrorCode.BIOMETRIC_NOT_AVAILABLE
    );
  }

  try {
    // Generate challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBuffer = new TextEncoder().encode(userId);

    // Create credential options
    const options: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: RP_NAME,
        id: RP_ID,
      },
      user: {
        id: userIdBuffer,
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Use platform authenticator
        userVerification: 'required',
        requireResidentKey: false,
      },
      timeout: 60000,
      attestation: 'none',
    };

    // Create credential
    const credential = await navigator.credentials.create({
      publicKey: options,
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Failed to create credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    return {
      id: credential.id,
      rawId: credential.rawId,
      publicKey: response.getPublicKey()!,
      type: 'public-key',
      createdAt: Date.now(),
    };
  } catch (error) {
    throw new KeyStorageError(
      'Failed to register biometric',
      KeyStorageErrorCode.BIOMETRIC_AUTH_FAILED,
      error
    );
  }
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Authenticate with biometric
 *
 * Prompts user for biometric authentication.
 *
 * @param credentialId - Credential ID from registration
 * @param promptMessage - Message to display (not used in WebAuthn)
 * @returns Authentication result
 */
export async function authenticateWithBiometric(
  credentialId: string,
  promptMessage: string = 'Authenticate to access your photos'
): Promise<BiometricAuthResult> {
  const availability = await isBiometricAvailable();

  if (!availability.available) {
    return {
      success: false,
      error: 'Biometric authentication not available',
    };
  }

  try {
    // Generate challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    // Create authentication options
    const options: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      rpId: RP_ID,
      userVerification: 'required',
      allowCredentials: [
        {
          id: base64URLDecode(credentialId),
          type: 'public-key',
          transports: ['internal'],
        },
      ],
    };

    // Get assertion
    const credential = await navigator.credentials.get({
      publicKey: options,
    }) as PublicKeyCredential;

    if (!credential) {
      return {
        success: false,
        error: 'Authentication failed',
      };
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    return {
      success: true,
      signature: response.signature,
      credentialId: base64URLEncode(credential.rawId),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

/**
 * Create biometric signature
 *
 * Signs payload with biometric credential.
 *
 * @param credentialId - Credential ID
 * @param payload - Data to sign
 * @returns Signature and success status
 */
export async function createBiometricSignature(
  credentialId: string,
  payload: string
): Promise<{ success: boolean; signature: string }> {
  try {
    // Convert payload to challenge
    const challenge = new TextEncoder().encode(payload);

    const options: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      rpId: RP_ID,
      userVerification: 'required',
      allowCredentials: [
        {
          id: base64URLDecode(credentialId),
          type: 'public-key',
          transports: ['internal'],
        },
      ],
    };

    const credential = await navigator.credentials.get({
      publicKey: options,
    }) as PublicKeyCredential;

    if (!credential) {
      return {
        success: false,
        signature: '',
      };
    }

    const response = credential.response as AuthenticatorAssertionResponse;
    const signature = base64URLEncode(response.signature);

    return {
      success: true,
      signature,
    };
  } catch (error) {
    return {
      success: false,
      signature: '',
    };
  }
}

// ============================================================================
// CREDENTIAL MANAGEMENT
// ============================================================================

/**
 * Delete biometric credential
 *
 * Note: WebAuthn doesn't provide a way to delete credentials programmatically.
 * Users must delete credentials through their browser settings.
 *
 * @param credentialId - Credential ID
 */
export async function deleteBiometricCredential(
  credentialId: string
): Promise<void> {
  console.warn(
    'WebAuthn credentials cannot be deleted programmatically. ' +
    'Users must delete credentials through browser settings.'
  );
}

/**
 * Check if credential exists
 *
 * Attempts to authenticate to verify credential exists.
 *
 * @param credentialId - Credential ID
 * @returns True if credential exists
 */
export async function credentialExists(credentialId: string): Promise<boolean> {
  try {
    const result = await authenticateWithBiometric(
      credentialId,
      'Verifying credential'
    );
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Get platform authenticator info
 *
 * @returns Platform authenticator information
 */
export async function getPlatformAuthenticatorInfo(): Promise<{
  available: boolean;
  platform: string;
  type: string;
}> {
  const availability = await isBiometricAvailable();

  let platform = 'Unknown';
  let type = 'None';

  if (availability.available) {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('mac')) {
      platform = 'macOS';
      type = 'Touch ID / Face ID';
    } else if (userAgent.includes('win')) {
      platform = 'Windows';
      type = 'Windows Hello';
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
      platform = 'iOS';
      type = 'Touch ID / Face ID';
    } else if (userAgent.includes('android')) {
      platform = 'Android';
      type = 'Fingerprint / Face';
    } else if (userAgent.includes('linux')) {
      platform = 'Linux';
      type = 'Platform Authenticator';
    }
  }

  return {
    available: availability.available,
    platform,
    type,
  };
}
