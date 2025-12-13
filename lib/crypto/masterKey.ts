export function toBase64(u8: Uint8Array): string {
    return btoa(String.fromCharCode(...u8));
}

export function fromBase64(str: string): Uint8Array {
    return new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));
}

export function generateMasterKey(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32)); // 256-bit key
}

export async function importWrapKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        'raw',
        keyBytes as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

export async function wrapKey(keyToWrap: Uint8Array, wrappingKey: CryptoKey): Promise<{ encrypted: Uint8Array, iv: Uint8Array, authTag: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // We can't directly wrap a raw Uint8Array with wrapKey in WebCrypto easily without importing it first.
    // So we just encrypt the raw bytes of the keyToWrap.
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        wrappingKey,
        keyToWrap as unknown as BufferSource
    );

    const encryptedArr = new Uint8Array(encryptedBuffer);
    // Split AuthTag (last 16 bytes)? No, WebCrypto AES-GCM appends tag at end usually.
    // Wait, typical WebCrypto output is Ciphertext + Tag.
    // Let's assume standard behavior: split last 16 bytes as tag.

    const tagLength = 16;
    const bodyLength = encryptedArr.length - tagLength;
    const encryptedBody = encryptedArr.slice(0, bodyLength);
    const authTag = encryptedArr.slice(bodyLength);

    return { encrypted: encryptedBody, iv, authTag };
}

export async function unwrapKey(
    encrypted: Uint8Array,
    iv: Uint8Array,
    authTag: Uint8Array,
    unwrappingKey: CryptoKey
): Promise<Uint8Array> {
    // Reconstruct buffer: ciphertext + tag
    const combined = new Uint8Array(encrypted.length + authTag.length);
    combined.set(encrypted);
    combined.set(authTag, encrypted.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        unwrappingKey,
        combined as unknown as BufferSource
    );

    return new Uint8Array(decryptedBuffer);
}
