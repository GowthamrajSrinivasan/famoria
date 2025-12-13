import { saveDeviceKey, getDeviceKey } from './keyStore';

// Helper for Base64 conversion
function toBase64(u8: Uint8Array): string {
    return btoa(String.fromCharCode(...u8));
}

function fromBase64(s: string): Uint8Array {
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

/**
 * Generates a new hardware-bound Device Key.
 * This key is NON-EXTRACTABLE and stored only in IndexedDB.
 */
export async function generateAndStoreDeviceKey(albumId: string): Promise<CryptoKey> {
    const deviceKey = await crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        false, // CRITICAL: Extractable = false means JS cannot read the key bits
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );

    await saveDeviceKey(albumId, deviceKey);
    return deviceKey;
}

/**
 * Wraps the Master Key using the Device Key.
 * Used during Album Creation or Recovery/Migration.
 */
export async function wrapMasterKeyForDevice(masterKey: CryptoKey | Uint8Array, deviceKey: CryptoKey): Promise<{ encryptedMasterKey: string, iv: string, authTag: string }> {
    // Use wrapKey to encrypt the MasterKey handle
    // Wait, MasterKey might be raw bytes if we generated it via getRandomValues for V4...
    // The V4 spec said: MasterKey = crypto.getRandomValues(32 bytes)
    // So it is raw bytes initially.
    // Actually, subtle.encrypt works on CryptoKey or data.
    // If MasterKey is just a Uint8Array, we can just use `encrypt`.

    // Let's assume MasterKey is passed as a CryptoKey handle (extractable) or Raw Bytes?
    // V4 spec says: `MasterKey = crypto.getRandomValues(32 bytes)` -> Raw Bytes.

    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Need to import raw master key bytes as CryptoKey first to WRAP it?
    // Or just encrypt the bytes?
    // V4 Spec says: EncryptedMasterKey = AES-GCM-Encrypt(MasterKey, key=DeviceKey)
    // We can just encrypt the buffer.

    // NOTE: If MasterKey is a Uint8Array
    let masterKeyBytes: BufferSource;
    if ('type' in masterKey) {
        const exported = await crypto.subtle.exportKey('raw', masterKey as CryptoKey);
        masterKeyBytes = exported;
    } else {
        masterKeyBytes = masterKey as unknown as BufferSource;
    }

    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        deviceKey,
        masterKeyBytes
    );

    const encryptedArray = new Uint8Array(encrypted);
    // Slice off tag (WebCrypto usually appends it? AES-GCM in WebCrypto Output = Ciphertext + Tag)
    // Yes, WebCrypto AES-GCM 'encrypt' returns Ciphertext + Tag concatenated.
    // But our previous V3 format split them.
    // Let's stick to split for consistency with our Schema.

    const tagLength = 16;
    const ciphertext = encryptedArray.slice(0, -tagLength);
    const authTag = encryptedArray.slice(-tagLength);

    return {
        encryptedMasterKey: toBase64(ciphertext),
        iv: toBase64(iv),
        authTag: toBase64(authTag)
    };
}

/**
 * Unwraps (Decrypts) the Master Key using the Device Key from IDB.
 * Returns the Master Key as a CryptoKey (for HKDF derivation).
 */
export async function unwrapMasterKeyWithDevice(
    albumId: string,
    encryptedMasterKeyB64: string,
    ivB64: string,
    authTagB64: string
): Promise<Uint8Array | null> {

    const deviceKey = await getDeviceKey(albumId);
    if (!deviceKey) return null; // Logic needs to handle "New Device" flow upstream

    try {
        const iv = fromBase64(ivB64);
        const encrypted = fromBase64(encryptedMasterKeyB64);
        const tag = fromBase64(authTagB64);

        // Reconstruct WebCrypto format: Ciphertext + Tag
        const combined = new Uint8Array(encrypted.length + tag.length);
        combined.set(encrypted);
        combined.set(tag, encrypted.length);

        const decrypted = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            deviceKey,
            combined
        );

        return new Uint8Array(decrypted);
    } catch (e) {
        console.error("Failed to decrypt Master Key with Device Key", e);
        return null;
    }
}
