export const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';


export async function uploadDriveAppDataFile(
    filename: string,
    content: string,
    accessToken: string
): Promise<string> {
    // 1. Check if exists
    const existing = await findDriveFile(filename, accessToken);
    if (existing) {
        // If it exists, we might want to update it or return existing ID.
        // For KeyBlob, let's assume we are okay overwriting or just return existing if we don't support versioning yet.
        // But for safety, let's delete undefined behavior and just create new or return error?
        // Actually, let's just create a new one for now to avoid complexity, or update.
        // Google Drive allows multiple files with same name.
        // We generally don't want that for keys.
    }

    const metadata = {
        name: filename,
        parents: ['appDataFolder']
    };

    const boundary = 'foo_bar_baz';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        closeDelimiter;

    // Correct URL for upload is www.googleapis.com/upload/drive/v3/files
    const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Drive Upload Failed: ${txt}`);
    }

    const json = await res.json();
    return json.id;
}

export async function findDriveFile(filename: string, accessToken: string): Promise<string | null> {
    const params = new URLSearchParams({
        q: `name='${filename}' and 'appDataFolder' in parents and trashed=false`,
        spaces: 'appDataFolder',
        fields: 'files(id, name)'
    });

    const res = await fetch(`${DRIVE_API_URL}/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.files && json.files.length > 0) {
        return json.files[0].id;
    }
    return null;
}

export async function fetchDriveBlob(filename: string, accessToken: string): Promise<any | null> {
    const fileId = await findDriveFile(filename, accessToken);
    if (!fileId) return null;

    const res = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) return null;
    return await res.json();
}
