import React, { useState, useEffect } from 'react';
import { Lock, X, Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { useAuth } from '../context/AuthContext';
import { fetchDriveBlob } from '../services/driveService';
import { generateAndStoreDeviceKey, wrapMasterKeyForDevice } from '@/lib/crypto/deviceKey';
import { uploadDriveAppDataFile } from '@/services/driveService'; // For re-wrapping

// V4 Logic:
// 1. Check IDB? (AuthContext likely already did this and failed if we are here)
// 2. Prompt for Recovery Key
// 3. User pastes Recovery Key (Base64 Master Key)
// 4. We Generate NEW Device Key
// 5. Wrap Master Key with NEW Device Key
// 6. Save Device Key to IDB
// 7. Save NEW Blob to Drive
// 8. Unlock

interface VaultUnlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUnlock: (key: Uint8Array) => void;
    albumId: string;
    albumName?: string;
}

export const VaultUnlockModal: React.FC<VaultUnlockModalProps> = ({
    isOpen,
    onClose,
    onUnlock,
    albumId,
    albumName
}) => {
    const { googleAccessToken, refreshDriveToken } = useAuth();
    const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setRecoveryKeyInput('');
            setError('');
        }
    }, [isOpen]);

    const handleRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsUnlocking(true);

        try {
            // 1. Validate Input (Base64)
            const cleanedInput = recoveryKeyInput.trim();
            if (!cleanedInput) throw new Error("Please enter the Recovery Key.");

            let masterKeyBytes: Uint8Array;
            try {
                masterKeyBytes = Uint8Array.from(atob(cleanedInput), c => c.charCodeAt(0));
                if (masterKeyBytes.length !== 32) throw new Error("Invalid key length.");
            } catch (e) {
                throw new Error("Invalid Recovery Key format. Make sure you copied it correctly.");
            }

            // 2. Ensure Drive Token (to save new binding)
            let token = googleAccessToken;
            if (!token) {
                token = await refreshDriveToken();
                if (!token) throw new Error("Google Drive access required to re-bind device.");
            }

            // 3. Generate NEW Device Key & Store in IDB
            // This effectively "Authorizes" this new device
            const deviceKey = await generateAndStoreDeviceKey(albumId);

            // 4. Wrap Master Key with NEW Device Key (for auto-unlock)
            const { encryptedMasterKey, iv, authTag } = await wrapMasterKeyForDevice(masterKeyBytes, deviceKey);

            // 5. Create Drive Blob with DUAL layers (Option A):
            // - recoveryKey: plain MK for future recovery
            // - encryptedMasterKey: wrapped MK for auto-unlock
            const toBase64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
            const blob = {
                version: 4,
                masterKeyId: albumId,
                recoveryKey: toBase64(masterKeyBytes), // Plain MK (recovery layer)
                encryptedMasterKey, // Device-wrapped MK (auto-unlock layer)
                iv,
                authTag,
                createdAt: Date.now()
            };

            // 6. Upload to Drive (overwrites existing - device migration pattern)
            const filename = `famoria_album_${albumId}.key`;
            await uploadDriveAppDataFile(filename, JSON.stringify(blob), token!);

            // 6. Unlock
            onUnlock(masterKeyBytes);
            onClose();

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to recover vault.");
        } finally {
            setIsUnlocking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-fade-in-up overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50">
                    <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                        <Lock size={18} className="text-stone-500" />
                        Unlock {albumName || 'Album'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                        <X size={18} className="text-stone-500" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="text-center mb-6">
                        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                            <KeyRound className="text-red-500" size={28} />
                        </div>
                        <h3 className="font-semibold text-stone-800">New Device Detected</h3>
                        <p className="text-stone-500 text-sm mt-1">
                            Use your <strong>Recovery Key</strong> to authorize this device.
                        </p>
                    </div>

                    <form onSubmit={handleRecovery} className="space-y-4">
                        <div>
                            <textarea
                                value={recoveryKeyInput}
                                onChange={(e) => setRecoveryKeyInput(e.target.value)}
                                placeholder="Paste your Recovery Key here..."
                                className="w-full h-24 p-3 text-sm font-mono border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-200 outline-none resize-none bg-stone-50"
                            />
                        </div>

                        {error && (
                            <p className="text-red-500 text-xs text-center font-medium bg-red-50 p-2 rounded-lg">
                                {error}
                            </p>
                        )}

                        <Button
                            type="submit"
                            className="w-full py-3"
                            disabled={isUnlocking || !recoveryKeyInput.trim()}
                            isLoading={isUnlocking}
                        >
                            Authorize Device & Unlock
                        </Button>
                    </form>

                    <div className="mt-4 pt-4 border-t border-stone-100 text-center">
                        <p className="text-xs text-stone-400">
                            Don't have your key? Ask the album owner to re-invite you.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
