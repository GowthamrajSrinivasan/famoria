import { toBase64, fromBase64 } from './masterKey';

// Re-import wrapper to avoid rewriting duplicative logic, or use AES directly.
// Since we want specific per-file IVs, let's implement directly.

async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        'raw',
        keyBytes as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptFile(file: File, keyBytes: Uint8Array): Promise<Blob> {
    const key = await importKey(keyBytes);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const content = await file.arrayBuffer();

    const encryptedContent = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        content as unknown as BufferSource
    );

    const encryptedArr = new Uint8Array(encryptedContent);
    // Concatenate IV + AuthTag(implicit at end) + Ciphertext?
    // Standard GCM output includes tag.
    // Format: IV (12) + CiphertextWithTag

    // Wait, typical Encrypt returns Ciphertext+Tag.
    // So blob = IV + EncryptedContent
    const combined = new Uint8Array(iv.length + encryptedArr.length);
    combined.set(iv);
    combined.set(encryptedArr, iv.length);

    return new Blob([combined], { type: 'application/octet-stream' });
}

export async function decryptFile(
    encryptedBlob: Blob,
    keyBytes: Uint8Array
): Promise<Blob> {
    const key = await importKey(keyBytes);
    const arrayBuffer = await encryptedBlob.arrayBuffer();
    const combined = new Uint8Array(arrayBuffer);

    // IV is first 12 bytes
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        data as unknown as BufferSource
    );

    return new Blob([decrypted]); // Type unknown?
}

// For Metadata, we might store IV/Tag separate to keep JSON clean?
export async function encryptMetadata(metadata: any, keyBytes: Uint8Array): Promise<{
    encrypted: string,
    iv: string,
    authTag: string,
    photoIv?: string // To matching definition in Uploader
}> {
    const key = await importKey(keyBytes);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const data = enc.encode(JSON.stringify(metadata));

    const encryptedContent = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        data as unknown as BufferSource
    );

    const encArr = new Uint8Array(encryptedContent);
    // Split tag
    const tagLen = 16;
    const bodyLen = encArr.length - tagLen;
    const body = encArr.slice(0, bodyLen);
    const tag = encArr.slice(bodyLen);

    return {
        encrypted: toBase64(body),
        iv: toBase64(iv),
        authTag: toBase64(tag),
        photoIv: "" // unused for metadata
    };
}

export async function decryptMetadata(
    data: {
        encrypted: string,
        iv: string,
        authTag: string,
        photoIv?: string
    },
    keyBytes: Uint8Array
): Promise<any> {
    const { encrypted: encryptedB64, iv: ivB64, authTag: authTagB64 } = data;
    const key = await importKey(keyBytes);
    const iv = fromBase64(ivB64);
    const body = fromBase64(encryptedB64);
    const tag = fromBase64(authTagB64);

    const combined = new Uint8Array(body.length + tag.length);
    combined.set(body);
    combined.set(tag, body.length);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        combined as unknown as BufferSource
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
}
