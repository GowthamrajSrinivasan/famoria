import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Lock, Users, Globe, Key, AlertTriangle, Download, Check, Loader2, Upload } from 'lucide-react';
import { Album, Group, User } from '../types';
import { createAlbum, updateAlbum } from '../services/albumService';
import { Button } from './Button';
import { useAuth } from '../context/AuthContext';
import { generateAndStoreDeviceKey, wrapMasterKeyForDevice } from '../lib/crypto/deviceKey';
import { uploadDriveAppDataFile } from '../services/driveService';
import * as imageUtils from '../lib/imageUtils';
import { db, storage } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, updateDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAllGroups } from '../services/groupService';
import { userService } from '../services/userService';

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

    // Access Permission State
    const [accessTab, setAccessTab] = useState<'groups' | 'members'>('groups');
    const [groups, setGroups] = useState<Group[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

    // Crypto State
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [hasDownloaded, setHasDownloaded] = useState(false);

    // Fetch groups and users
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [groupsData, usersData] = await Promise.all([
                    getAllGroups(),
                    userService.getAllUsers()
                ]);
                console.log('[CreateAlbumModal] Fetched groups:', groupsData);
                console.log('[CreateAlbumModal] Fetched users:', usersData);
                setGroups(groupsData);
                setUsers(usersData.filter(u => u.id !== currentUserId));
            } catch (err: any) {
                // Always log the error to help debug
                console.error('[CreateAlbumModal] Failed to fetch groups/users:', err);
                console.error('[CreateAlbumModal] Error code:', err?.code);
                console.error('[CreateAlbumModal] Error message:', err?.message);
                // Set empty arrays if fetch fails
                setGroups([]);
                setUsers([]);
            }
        };
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, currentUserId]);

    useEffect(() => {
        if (editAlbum) {
            setName(editAlbum.name);
            setDescription(editAlbum.description || '');
            setPrivacy(editAlbum.privacy);
            setCoverPreview(editAlbum.coverPhoto || null);
            setCoverFile(null);

            // Set access permissions - support both selectedGroups (new) and groups (old) for backward compatibility
            const groupIds = editAlbum.selectedGroups || (editAlbum as any).groups || [];
            const memberIds = editAlbum.members?.filter((id: string) => id !== currentUserId) || [];

            console.log('[CreateAlbumModal] ====== EDITING ALBUM ======');
            console.log('[CreateAlbumModal] Album ID:', editAlbum.id);
            console.log('[CreateAlbumModal] Album selectedGroups from DB:', editAlbum.selectedGroups);
            console.log('[CreateAlbumModal] Album groups (legacy) from DB:', (editAlbum as any).groups);
            console.log('[CreateAlbumModal] Final groupIds to set:', groupIds);
            console.log('[CreateAlbumModal] Setting selectedGroups to:', groupIds);
            console.log('[CreateAlbumModal] Album members from DB:', editAlbum.members);
            console.log('[CreateAlbumModal] Setting selectedMembers to:', memberIds);

            setSelectedGroups(groupIds);
            setSelectedMembers(memberIds);

            // Verify state was set (async might need next tick)
            setTimeout(() => {
                console.log('[CreateAlbumModal] VERIFY - selectedGroups state:', groupIds);
                console.log('[CreateAlbumModal] VERIFY - selectedMembers state:', memberIds);
            }, 100);
        } else {
            setName('');
            setDescription('');
            setPrivacy('family');
            setRecoveryKey(null);
            setHasDownloaded(false);
            setStep('DETAILS');
            setCoverFile(null);
            setCoverPreview(null);
            setSelectedGroups([]);
            setSelectedMembers([]);
            console.log('[CreateAlbumModal] ====== CREATING NEW ALBUM ======');
        }
        setError('');
    }, [editAlbum, isOpen, currentUserId]);

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

                // Update groups and members directly in Firestore
                const albumRef = doc(db, 'albums', editAlbum.id);
                const firestoreUpdates: any = {};

                // Add cover photo if changed
                if (coverFile && coverPhotoURL) {
                    firestoreUpdates.coverPhoto = coverPhotoURL;
                }

                // Always update selectedGroups and members
                firestoreUpdates.selectedGroups = selectedGroups;
                firestoreUpdates.members = [currentUserId, ...selectedMembers];

                console.log('[CreateAlbumModal] Updating album with:', firestoreUpdates);
                await updateDoc(albumRef, firestoreUpdates);

                onSuccess(editAlbum.id);
                onClose();
            } else {
                // V4 Creation: Hardware Bound
                // 1. Ensure Drive Token
                let token = googleAccessToken;
                if (!token) {
                    try {
                        token = await refreshDriveToken();
                        if (!token) {
                            throw new Error("Please sign in to Google Drive first. Go to Settings to connect your account.");
                        }
                    } catch (err: any) {
                        // Handle popup blocker
                        if (err?.message?.includes('popup-blocked') || err?.code === 'auth/popup-blocked') {
                            throw new Error("Popup blocked! Please allow popups for this site, or go to Settings to manually sign in to Google Drive.");
                        }
                        throw new Error("Please sign in to Google Drive first. Go to Settings to connect your account.");
                    }
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

                // 7. Create Album in Firestore with groups and members
                const albumId = masterKeyId;

                // Combine creator + selected members
                const allMembers = [currentUserId, ...selectedMembers];

                await setDoc(doc(db, 'albums', albumId), {
                    id: albumId,
                    name: name.trim(),
                    description: description.trim(),
                    privacy,
                    createdBy: currentUserId,
                    userId: currentUserId,
                    members: allMembers,
                    accessType: 'groups',
                    selectedGroups: selectedGroups, // Store selected groups with correct field name
                    masterKeyId: masterKeyId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    coverPhoto: coverPhotoURL,
                    photoCount: 0,
                    videoCount: 0
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
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] shadow-2xl animate-fade-in-up overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-stone-100 bg-stone-50 flex-shrink-0">
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

                <div className="p-6 overflow-y-auto flex-1">
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

                            {/* Access Permission Section */}
                            <div>
                                <label className="block text-sm font-semibold text-stone-700 mb-3">Access Permission</label>

                                {/* Groups/Members Tabs */}
                                <div className="flex gap-2 mb-4 bg-stone-100 p-1 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setAccessTab('groups')}
                                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${accessTab === 'groups'
                                            ? 'bg-white text-stone-800 shadow-sm'
                                            : 'text-stone-500 hover:text-stone-700'
                                            }`}
                                    >
                                        Groups
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAccessTab('members')}
                                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${accessTab === 'members'
                                            ? 'bg-white text-stone-800 shadow-sm'
                                            : 'text-stone-500 hover:text-stone-700'
                                            }`}
                                    >
                                        Members
                                    </button>
                                </div>

                                {/* Groups Content */}
                                {accessTab === 'groups' && (
                                    <div className="bg-stone-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                                        <p className="text-xs text-stone-500 mb-3">
                                            Select groups ({selectedGroups.length} selected)
                                        </p>
                                        {/* DEBUG INFO - REMOVED FOR PRODUCTION
                                        <div className="bg-yellow-100 p-2 mb-3 text-xs">
                                            DEBUG: selectedGroups = {JSON.stringify(selectedGroups)}
                                        </div>
                                        */}
                                        {groups.length === 0 ? (
                                            <p className="text-sm text-stone-400 text-center py-4">No groups available</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {groups.map((group) => {
                                                    const isChecked = selectedGroups.includes(group.id);
                                                    console.log(`[Checkbox Render] Group: ${group.name}, ID: ${group.id}, isChecked: ${isChecked}, selectedGroups:`, selectedGroups);
                                                    return (
                                                        <label
                                                            key={group.id}
                                                            className="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-stone-100 cursor-pointer transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    console.log(`[Checkbox Change] Group: ${group.name}, checked: ${e.target.checked}`);
                                                                    if (e.target.checked) {
                                                                        setSelectedGroups([...selectedGroups, group.id]);
                                                                    } else {
                                                                        setSelectedGroups(selectedGroups.filter(id => id !== group.id));
                                                                    }
                                                                }}
                                                                className="w-5 h-5 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500 focus:ring-2 accent-orange-600 cursor-pointer"
                                                            />
                                                            <div className="flex items-center gap-2 flex-1">
                                                                <div
                                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                                                    style={{ backgroundColor: group.color || '#f97316' }}
                                                                >
                                                                    {group.icon || '👥'}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-medium text-stone-700">{group.name}</div>
                                                                    <div className="text-xs text-stone-500">{group.members.length} members</div>
                                                                </div>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Members Content */}
                                {accessTab === 'members' && (
                                    <div className="bg-stone-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                                        <p className="text-xs text-stone-500 mb-3">
                                            Select members ({selectedMembers.length} selected)
                                        </p>
                                        {users.length === 0 ? (
                                            <p className="text-sm text-stone-400 text-center py-4">No other users available</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {users.map((user) => (
                                                    <label
                                                        key={user.id}
                                                        className="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-stone-100 cursor-pointer transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedMembers.includes(user.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedMembers([...selectedMembers, user.id]);
                                                                } else {
                                                                    setSelectedMembers(selectedMembers.filter(id => id !== user.id));
                                                                }
                                                            }}
                                                            className="w-5 h-5 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500 focus:ring-2 accent-orange-600 cursor-pointer"
                                                        />
                                                        <div className="flex items-center gap-2 flex-1">
                                                            <img
                                                                src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=f97316&color=fff`}
                                                                alt={user.name}
                                                                className="w-8 h-8 rounded-full object-cover"
                                                            />
                                                            <div>
                                                                <div className="text-sm font-medium text-stone-700">{user.name}</div>
                                                                <div className="text-xs text-stone-500">{user.email}</div>
                                                            </div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
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
        </div >
    );
};
