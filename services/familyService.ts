import { saveFamilyKey, getFamilyKey } from '../lib/crypto/keyStore';
import { uploadDriveAppDataFile, fetchDriveBlob } from './driveService';
import { toBase64, fromBase64 } from '../lib/crypto/masterKey';

const getFamilyKeyFilename = (familyId: string) => `family_key_${familyId}.json`;

export const familyService = {
    /**
     * Generate a new Family Master Key and save it locally and to Drive.
     * Use this when creating a new Family.
     */
    createFamilyKey: async (accessToken: string, familyId?: string): Promise<Uint8Array> => {
        // 1. Generate 32-byte key
        const key = crypto.getRandomValues(new Uint8Array(32));

        // 2. Save locally (Note: if familyId is missing, it uses legacy fallback in keyStore)
        await saveFamilyKey(key, familyId);

        // 3. Backup to Drive
        if (familyId) {
            await familyService.backupKeyToDrive(key, accessToken, familyId);
        }

        return key;
    },

    /**
     * Backup existing key to Drive
     */
    backupKeyToDrive: async (key: Uint8Array, accessToken: string, familyId: string): Promise<void> => {
        const keyBase64 = toBase64(key);
        const content = JSON.stringify({
            version: 1,
            familyId,
            key: keyBase64,
            createdAt: new Date().toISOString()
        });

        await uploadDriveAppDataFile(getFamilyKeyFilename(familyId), content, accessToken);
        console.log(`[FamilyService] Backed up Family Key to Drive for FID: ${familyId}`);
    },

    /**
     * Try to fetch Family Key from Drive for a specific family.
     */
    restoreKeyFromDrive: async (accessToken: string, familyId: string): Promise<Uint8Array | null> => {
        try {
            const data = await fetchDriveBlob(getFamilyKeyFilename(familyId), accessToken);
            if (data && data.key) {
                const key = fromBase64(data.key);
                await saveFamilyKey(key, familyId);
                console.log(`[FamilyService] Restored Family Key from Drive for FID: ${familyId}`);
                return key;
            }
        } catch (error) {
            console.error(`[FamilyService] Failed to restore key from Drive for FID: ${familyId}`, error);
        }
        return null;
    },

    /**
     * Save a shared key (from Invite Link) to local IDB and backup to Drive.
     */
    acceptFamilyInvite: async (keyBase64: string, familyId: string, accessToken?: string): Promise<void> => {
        const key = fromBase64(keyBase64);
        await saveFamilyKey(key, familyId);

        if (accessToken) {
            await familyService.backupKeyToDrive(key, accessToken, familyId);
        }
    },

    /**
     * Check if we have the key locally.
     */
    hasLocalKey: async (familyId?: string): Promise<boolean> => {
        const key = await getFamilyKey(familyId);
        return !!key;
    }
};
