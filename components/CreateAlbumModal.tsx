import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
    const { googleAccessToken, refreshDriveToken, unlockAlbum, familyKey } = useAuth();
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
        if (!name.trim()) return setError(t('error_album_name_req'));

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
                    privacy,
                    members: [currentUserId, ...selectedMembers],
                    selectedGroups
                };

                // Only update cover if changed
                if (coverFile) {
                    updates.coverPhoto = coverPhotoURL;
                }

                await updateAlbum(editAlbum.id, updates, familyKey || undefined);

                onSuccess(editAlbum.id);
                onClose();
            } else {
                // V4: Simplified Creation (Family Key Model)
                const albumId = await createAlbum(
                    name.trim(),
                    currentUserId,
                    description.trim(),
                    privacy,
                    selectedMembers,
                    selectedGroups,
                    coverPhotoURL,
                    familyKey || undefined
                );

                onSuccess(albumId);
                onClose();
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to create album');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFinish = () => {
        if (!hasDownloaded) {
            setError(t('download_required_error'));
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
                        {step === 'DETAILS' ? (editAlbum ? t('edit_album_modal_title') : t('create_album_modal_title')) :
                            step === 'PROCESSING' ? t('securing_vault') : t('emergency_backup')}
                    </h2>
                    {step !== 'RECOVERY' && (
                        <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                            <X size={20} className="text-stone-500" />
                        </button>
                    )}
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {/* STEP 1: Details */}
                    <form onSubmit={handleDetailsSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-stone-700 mb-2">{t('album_name_label')}</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('album_name_placeholder')}
                                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-200 outline-none transition-all"
                                autoFocus
                            />
                        </div>

                        {/* Cover Image Upload */}
                        <div>
                            <label className="block text-sm font-semibold text-stone-700 mb-2">{t('cover_image_label')}</label>
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
                                        {coverPreview ? t('change_cover') : t('upload_cover')}
                                    </span>
                                    <span className="text-xs text-stone-400 mt-1">{t('cover_formats')}</span>
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
                            <label className="block text-sm font-semibold text-stone-700 mb-3">{t('access_permission_label')}</label>

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
                                    {t('tab_groups')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAccessTab('members')}
                                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${accessTab === 'members'
                                        ? 'bg-white text-stone-800 shadow-sm'
                                        : 'text-stone-500 hover:text-stone-700'
                                        }`}
                                >
                                    {t('tab_members')}
                                </button>
                            </div>

                            {/* Groups Content */}
                            {accessTab === 'groups' && (
                                <div className="bg-stone-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                                    <p className="text-xs text-stone-500 mb-3">
                                        {t('select_groups_count', { count: selectedGroups.length })}
                                    </p>
                                    <div className="bg-yellow-100 p-2 mb-3 text-xs hidden">
                                        DEBUG: selectedGroups = {JSON.stringify(selectedGroups)}
                                    </div>
                                    {groups.length === 0 ? (
                                        <p className="text-sm text-stone-400 text-center py-4">{t('no_groups_avail')}</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {groups.map((group) => {
                                                const isChecked = selectedGroups.includes(group.id);
                                                return (
                                                    <label
                                                        key={group.id}
                                                        className="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-stone-100 cursor-pointer transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
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
                                                                <div className="text-xs text-stone-500">{t('members_count', { count: group.members.length })}</div>
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
                                        {t('select_members_count', { count: selectedMembers.length })}
                                    </p>
                                    {users.length === 0 ? (
                                        <p className="text-sm text-stone-400 text-center py-4">{t('no_users_avail')}</p>
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

                        <Button type="submit" className="w-full py-3 mt-4" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                            ) : (
                                editAlbum ? t('save_changes') : t('create_secure_album')
                            )}
                        </Button>
                    </form>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">{error}</div>
                    )}
                </div>
            </div>
        </div >
    );
};
