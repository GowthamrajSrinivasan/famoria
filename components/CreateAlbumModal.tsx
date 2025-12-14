import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Lock, Users, Globe, Key, AlertTriangle, Download, Check, Loader2, Upload } from 'lucide-react';
import { Album } from '../types';
import { createAlbum, updateAlbum } from '../services/albumService';
import { Button } from './Button';
import { useAuth } from '../context/AuthContext';
import { generateAndStoreDeviceKey, wrapMasterKeyForDevice } from '@/lib/crypto/deviceKey';
import { uploadDriveAppDataFile } from '@/services/driveService';
import { db, storage } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface CreateAlbumModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (albumId: string) => void;
    currentUserId: string;
    editAlbum?: Album | null;
}

type Step = 'DETAILS' | 'PROCESSING' | 'RECOVERY';

export const CreateAlbumModal: React.FC<CreateAlbumModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    currentUserId,
    editAlbum
}) => {
    const { googleAccessToken, refreshDriveToken, unlockAlbum } = useAuth();
    const [step, setStep] = useState<Step>('DETAILS');

    // Details State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [privacy, setPrivacy] = useState<'private' | 'family' | 'public'>('family');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

    // Crypto State
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [hasDownloaded, setHasDownloaded] = useState(false);

    useEffect(() => {
        if (editAlbum) {
            setName(editAlbum.name);
            setDescription(editAlbum.description || '');
            setPrivacy(editAlbum.privacy);
            setCoverPreview(editAlbum.coverPhoto || null);
            setCoverFile(null);
        } else {
            setName('');
            setDescription('');
            setPrivacy('family');
            setRecoveryKey(null);
            setHasDownloaded(false);
            setStep('DETAILS');
            setCoverFile(null);
            setCoverPreview(null);
        }
        setError('');
    }, [editAlbum, isOpen]);

    const handleDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return setError('Album name is required');

        if (editAlbum) {
            // Editing doesn't change encryption keys for now
            handleSubmitData();
        } else {
            // New V4 Flow: Details -> PROCESSING (Gen Key) -> RECOVERY
            // Skip PIN step entirely.
            setStep('PROCESSING');
            handleSubmitData();
        }
    };

    // Handle cover image file selection
    const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('Please select an image file');
            return;
        }

        // Validate file size (max 5MB for original)
        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be less than 5MB');
            return;
        }

        setCoverFile(file);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setCoverPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
        setError('');
    };

    // Upload cover image thumbnail to Storage
    const uploadCoverImage = async (): Promise<string | null> => {
        if (!coverFile) return null;

        try {
            // Generate thumbnail
            const imageUtils = await import('../lib/imageUtils');
            const thumbnailBlob = await imageUtils.generateThumbnail(coverFile, 400);

            // Upload to Storage
            const filename = `album_cover_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const storageRef = ref(storage, `albums/covers/${filename}`);
            await uploadBytes(storageRef, thumbnailBlob);

            // Get download URL
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (err) {
            console.error('Failed to upload cover image:', err);
            throw new Error('Failed to upload cover image');
        }
    };

    const handleSubmitData = async () => {
        setIsSubmitting(true);
        setError('');

        try {
            // Upload cover image if changed
            let coverPhotoURL = editAlbum?.coverPhoto || null;
            if (coverFile) {
                coverPhotoURL = await uploadCoverImage();
            }

            if (editAlbum) {
                const updates: any = {
                    name: name.trim(),
                    description: description.trim(),
                    privacy
                };

                // Only update cover if changed
                if (coverFile) {
                    updates.coverPhoto = coverPhotoURL;
                }

                await updateAlbum(editAlbum.id, updates);

                // Also update coverPhoto in Firestore directly if needed
                if (coverFile && coverPhotoURL) {
                    const albumRef = doc(db, 'albums', editAlbum.id);
                    await updateDoc(albumRef, { coverPhoto: coverPhotoURL });
                }

                onSuccess(editAlbum.id);
                onClose();
            } else {
                // V4 Creation: Hardware Bound
                // 1. Ensure Drive Token
                let token = googleAccessToken;
                if (!token) {
                    token = await refreshDriveToken();
                    if (!token) throw new Error("Google Drive access required for secure storage.");
                }

                // 2. Generate Master Key (Raw Bytes) - 32 bytes CSPRNG
                const masterKey = crypto.getRandomValues(new Uint8Array(32));
                const masterKeyId = crypto.randomUUID();

                // Helper: Convert to Base64
                const toBase64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));

                // 3. Generate Hardware DeviceKey & Store in IndexedDB
                // This creates the LOCAL security layer (non-extractable, hardware-bound)
                const deviceKey = await generateAndStoreDeviceKey(masterKeyId);

                // 4. Create TWO versions of MK for Drive (Option A):
                // Version 1: Plain MK (for recovery/new device)
                const plainMasterKeyB64 = toBase64(masterKey);

                // Version 2: Device-Wrapped MK (for auto-unlock)
                const { encryptedMasterKey, iv, authTag } = await wrapMasterKeyForDevice(masterKey, deviceKey);

                // 5. Construct Drive Blob (V4 Format with BOTH layers)
                const driveBlob = {
                    version: 4,
                    masterKeyId,
                    // Recovery Layer (explicit, for new devices)
                    recoveryKey: plainMasterKeyB64,
                    // Auto-Unlock Layer (device-specific, zero friction)
                    encryptedMasterKey,
                    iv,
                    authTag,
                    createdAt: Date.now()
                };

                // 6. Upload to Drive (single file, dual protection)
                const filename = `famoria_album_${masterKeyId}.key`;
                await uploadDriveAppDataFile(filename, JSON.stringify(driveBlob), token!);
                // 7. Create Album in Firestore
                const albumId = masterKeyId;
                await setDoc(doc(db, 'albums', albumId), {
                    id: albumId,
                    name: name.trim(),
                    description: description.trim(),
                    privacy,
                    createdBy: currentUserId,
                    userId: currentUserId,
                    members: [currentUserId],
                    masterKeyId: masterKeyId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    coverPhoto: coverPhotoURL,
                    photoCount: 0
                });

                // 8. Unlock locally (Add to Keyring)
                unlockAlbum(albumId, masterKey);

                // 9. Prepare Recovery Kit
                // Convert masterKey to Base64 for user to save
                const mkBase64 = btoa(String.fromCharCode(...masterKey));
                setRecoveryKey(mkBase64);

                setStep('RECOVERY');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to create album');
            if (step === 'PROCESSING') setStep('DETAILS');
        } finally {
            setIsSubmitting(false);
        }
    };

    const downloadRecoveryKit = () => {
        if (!recoveryKey) return;
        const text = `FAMORIA RECOVERY KIT (V4)\n\nALBUM: ${name}\nRECOVERY KEY: ${recoveryKey}\n\nIMPORTANT: Keep this key safe. It is the ONLY way to access your photos on a new device.`;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `famoria_recovery_${name.replace(/\s+/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setHasDownloaded(true);
    };

    const handleFinish = () => {
        if (!hasDownloaded) {
            setError("You must download the Recovery Kit to continue.");
            return;
        }
        onSuccess(name);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-stone-100 bg-stone-50">
                    <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                        {step === 'DETAILS' ? (editAlbum ? 'Edit Album' : 'Create New Album') :
                            step === 'PROCESSING' ? 'Securing Vault...' : 'Emergency Backup'}
                    </h2>
                    {step !== 'RECOVERY' && (
                        <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                            <X size={20} className="text-stone-500" />
                        </button>
                    )}
                </div>

                <div className="p-6">
                    {/* STEP 1: Details */}
                    {step === 'DETAILS' && (
                        <form onSubmit={handleDetailsSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-stone-700 mb-2">Album Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Summer Vacation"
                                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-200 outline-none transition-all"
                                    autoFocus
                                />
                            </div>

                            {/* Cover Image Upload */}
                            <div>
                                <label className="block text-sm font-semibold text-stone-700 mb-2">Cover Image (Optional)</label>
                                <div className="space-y-3">
                                    {coverPreview && (
                                        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-stone-100">
                                            <img
                                                src={coverPreview}
                                                alt="Cover preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCoverFile(null);
                                                    setCoverPreview(editAlbum?.coverPhoto || null);
                                                }}
                                                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    )}
                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-stone-200 rounded-xl hover:border-orange-300 hover:bg-orange-50/50 transition-all cursor-pointer">
                                        <Upload size={24} className="text-stone-400 mb-2" />
                                        <span className="text-sm text-stone-500">
                                            {coverPreview ? 'Change cover image' : 'Upload cover image'}
                                        </span>
                                        <span className="text-xs text-stone-400 mt-1">JPG, PNG up to 5MB</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleCoverFileChange}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-stone-700 mb-2">Privacy</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { value: 'private', label: 'Private', icon: Lock },
                                        { value: 'family', label: 'Family', icon: Users },
                                        { value: 'public', label: 'Public', icon: Globe }
                                    ].map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setPrivacy(opt.value as any)}
                                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${privacy === opt.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-stone-100 hover:border-stone-200 text-stone-600'
                                                }`}
                                        >
                                            <opt.icon size={20} className="mb-1" />
                                            <span className="text-xs font-semibold">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <Button type="submit" className="w-full py-3 mt-4">
                                {editAlbum ? 'Save Changes' : 'Create Secure Album'}
                            </Button>
                        </form>
                    )}

                    {/* STEP 2: Processing (Replacing PIN) */}
                    {step === 'PROCESSING' && (
                        <div className="py-12 text-center space-y-4">
                            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto" />
                            <h3 className="text-lg font-medium text-stone-700">Generating Secure Keys...</h3>
                            <p className="text-sm text-stone-400">Binding encryption to this device</p>
                        </div>
                    )}

                    {/* STEP 3: Recovery (Mandatory) */}
                    {step === 'RECOVERY' && (
                        <div className="space-y-6">
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800 text-sm">
                                <AlertTriangle className="shrink-0" />
                                <div>
                                    <p className="font-bold mb-1">Backup Required</p>
                                    <p>Since we eliminated the PIN, this Recovery Key is the <strong>ONLY</strong> way to access your photos on a new device.</p>
                                </div>
                            </div>

                            <div className="bg-stone-900 text-stone-200 p-4 rounded-xl font-mono text-xs break-all text-center selection:bg-orange-500 relative group">
                                {recoveryKey}
                            </div>

                            <div className="space-y-3">
                                <Button
                                    onClick={downloadRecoveryKit}
                                    variant="secondary"
                                    className={`w-full py-4 text-base ${hasDownloaded ? 'border-green-500 text-green-700 bg-green-50' : ''}`}
                                >
                                    {hasDownloaded ? (
                                        <><Check size={20} className="mr-2" /> Downloaded</>
                                    ) : (
                                        <><Download size={20} className="mr-2" /> Download Recovery Kit</>
                                    )}
                                </Button>

                                <Button
                                    onClick={handleFinish}
                                    disabled={!hasDownloaded}
                                    className="w-full py-4 text-base"
                                >
                                    Finish Setup
                                </Button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">{error}</div>
                    )}
                </div>
            </div>
        </div>
    );
};
