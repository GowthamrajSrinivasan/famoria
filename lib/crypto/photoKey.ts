export async function derivePhotoKey(masterKey: Uint8Array, photoId: string): Promise<Uint8Array> {
    // HKDF-SHA256
    const masterKeyCrypto = await crypto.subtle.importKey(
        'raw',
        masterKey as unknown as BufferSource,
        { name: 'HKDF' },
        false,
        ['deriveKey', 'deriveBits']
    );

    const salt = new TextEncoder().encode('famoria-photo-v1'); // Fixed salt context
    const info = new TextEncoder().encode(photoId);

    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt as unknown as BufferSource,
            info: info as unknown as BufferSource
        },
        masterKeyCrypto,
        { name: 'AES-GCM', length: 256 },
        true, // extractable? Maybe
        ['encrypt', 'decrypt']
    );

    // Export to raw bytes for our crypto functions which usually take Uint8Array
    // Or we could return CryptoKey. My crypto functions expect CryptoKey?
    // Let's check photoCrypto.ts -> encryptFile calls...
    // My previous photoCrypto implementation took CryptoKey or bytes?
    // Let's standardize on internal functions taking CryptoKey, but public APIs taking bytes is easier for storage?
    // No, easier to keep it as CryptoKey if performant.
    // BUT my `derivePhotoKey` signature says `Promise<Uint8Array>`.

    const raw = await crypto.subtle.exportKey('raw', derivedKey);
    return new Uint8Array(raw);
}
