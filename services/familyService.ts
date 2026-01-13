import { saveFamilyKey, getFamilyKey } from '../lib/crypto/keyStore';
import { uploadDriveAppDataFile, fetchDriveBlob } from './driveService';
import { toBase64, fromBase64 } from '../lib/crypto/masterKey';

const FAMILY_KEY_FILENAME = 'family_master_key.json';

export const familyService = {
    /**
     * Generate a new Family Master Key and save it locally and to Drive.
     * Use this when creating a new Family.
     */
    createFamilyKey: async (accessToken: string): Promise<Uint8Array> => {
        // 1. Generate 32-byte key
        const key = crypto.getRandomValues(new Uint8Array(32));

        // 2. Save locally
        await saveFamilyKey(key);

        // 3. Backup to Drive
        await familyService.backupKeyToDrive(key, accessToken);

        return key;
    },

    /**
     * Backup existing key to Drive (e.g. after resolving sync issues)
     */
    backupKeyToDrive: async (key: Uint8Array, accessToken: string): Promise<void> => {
        const keyBase64 = toBase64(key);
        const content = JSON.stringify({
            version: 1,
            key: keyBase64,
            createdAt: new Date().toISOString()
        });

        await uploadDriveAppDataFile(FAMILY_KEY_FILENAME, content, accessToken);
        console.log('[FamilyService] Backed up Family Key to Drive');
    },

    /**
     * Try to fetch Family Key from Drive.
     * Use this on "New Device" login.
     */
    restoreKeyFromDrive: async (accessToken: string): Promise<Uint8Array | null> => {
        try {
            const data = await fetchDriveBlob(FAMILY_KEY_FILENAME, accessToken);
            if (data && data.key) {
                const key = fromBase64(data.key);
                await saveFamilyKey(key);
                console.log('[FamilyService] Restored Family Key from Drive');
                return key;
            }
        } catch (error) {
            console.error('[FamilyService] Failed to restore key from Drive', error);
        }
        return null;
    },

    /**
     * Save a shared key (from Invite Link) to local IDB and backup to Drive.
     */
    acceptFamilyInvite: async (keyBase64: string, accessToken?: string): Promise<void> => {
        const key = fromBase64(keyBase64);
        await saveFamilyKey(key);

        if (accessToken) {
            await familyService.backupKeyToDrive(key, accessToken);
        }
    },

    /**
     * Check if we have the key locally.
     */
    hasLocalKey: async (): Promise<boolean> => {
        const key = await getFamilyKey();
        return !!key;
    }
};
