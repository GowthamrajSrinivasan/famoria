import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Edit, Trash2, MoreVertical, Image as ImageIcon, Lock, KeyRound } from 'lucide-react';
import { Album, Photo } from '../types';
import { PhotoCard } from './PhotoCard';
import { photoService } from '../services/photoService';
import { storageService } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';
import { VaultUnlockModal } from './VaultUnlockModal';

interface AlbumViewProps {
    album: Album;
    currentUserId?: string;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onUpload: () => void;
    onPhotoClick: (photo: Photo) => void;
}

export const AlbumView: React.FC<AlbumViewProps> = ({
    album,
    currentUserId,
    onBack,
    onEdit,
    onDelete,
    onUpload,
    onPhotoClick
}) => {
    const { getAlbumKey, unlockAlbum, autoUnlockAlbum } = useAuth();
    const [rawPhotos, setRawPhotos] = useState<any[]>([]); // Encrypted docs
    const [photos, setPhotos] = useState<Photo[]>([]); // Decrypted photos
    const [loading, setLoading] = useState(true);
    const [showMenu, setShowMenu] = useState(false);
    const [showUnlock, setShowUnlock] = useState(false);
    const [decrypting, setDecrypting] = useState(false);
    const [checkingVault, setCheckingVault] = useState(false);
    const hasAttemptedUnlock = React.useRef(false);

    const isOwner = currentUserId === album.createdBy;
    const albumKey = getAlbumKey(album.id);

    // 1. Fetch Raw Encrypted Data
    useEffect(() => {
        setLoading(true);
        const unsubscribe = photoService.subscribeToAlbum(album.id, (docs) => {
            setRawPhotos(docs);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [album.id]);

    // 2. Auto-Unlock & Decryption Pipeline
    useEffect(() => {
        // A. If Locked, Try Auto-Unlock (V4 Hardware Key)
        if (!albumKey) {
            setPhotos([]); // Clear photos if locked

            // Only attempt unlock ONCE per mount
            if (!hasAttemptedUnlock.current && !checkingVault) {
                hasAttemptedUnlock.current = true; // Set BEFORE async call

                const attemptUnlock = async () => {
                    console.log(`[V4 Auto-Unlock] Attempting auto-unlock for album: ${album.id}`);
                    setCheckingVault(true);
                    const success = await autoUnlockAlbum(album.id);
                    if (!success) {
                        console.log(`[V4 Auto-Unlock] Failed - no DeviceKey in IndexedDB or Drive blob missing`);
                    } else {
                        console.log(`[V4 Auto-Unlock] Success - album unlocked`);
                    }
                    setCheckingVault(false);
                };
                attemptUnlock();
            }
            return;
        }

        // B. If Unlocked, Decrypt Photos
        const decryptPhotos = async () => {
            setDecrypting(true);
            try {
                // Dynamically import crypto modules to avoid bloating main bundle
                const photoKeyModule = await import('../lib/crypto/photoKey');
                const photoCryptoModule = await import('../lib/crypto/photoCrypto');

                const decrypted = await Promise.all(rawPhotos.map(async (doc) => {
                    try {
                        const photoId = doc.id;

                        // A. Derive Key
                        const photoKey = await photoKeyModule.derivePhotoKey(albumKey, photoId);

                        // B. Decrypt Metadata
                        const metadata = await photoCryptoModule.decryptMetadata(
                            {
                                encrypted: doc.encryptedMetadata,
                                iv: doc.metadataIv,
                                authTag: doc.metadataAuthTag,
                                photoIv: doc.photoIv // unused for meta but passed
                            },
                            photoKey
                        );

                        // C. Decrypt Image Blob
                        // Check if we have a valid path
                        if (!doc.encryptedPath) throw new Error("Missing file path");

                        // We fetch the blob from storage
                        const encryptedBlob = await storageService.downloadBlob(doc.encryptedPath);

                        // Decrypt file
                        const imageBlob = await photoCryptoModule.decryptFile(encryptedBlob, photoKey);
                        const imageUrl = URL.createObjectURL(imageBlob);

                        return {
                            id: photoId,
                            url: imageUrl,
                            caption: metadata.caption,
                            tags: metadata.tags || [],
                            date: new Date(metadata.date).toLocaleDateString(),
                            author: metadata.author,
                            authorId: metadata.authorId,
                            isEncrypted: true,
                            likes: doc.likes || [],
                            commentsCount: doc.commentsCount || 0
                        } as Photo;
                    } catch (err) {
                        console.error(`Failed to decrypt photo ${doc.id}:`, err);
                        return null;
                    }
                }));

                setPhotos(decrypted.filter(p => p !== null) as Photo[]);
            } catch (err) {
                console.error("Critical decryption failure:", err);
            } finally {
                setDecrypting(false);
            }
        };

        if (rawPhotos.length > 0) {
            decryptPhotos();
        } else {
            // Even if empty, we are unlocked
        }

    }, [rawPhotos, albumKey]); // Re-run if data changes or key changes

    const handleUnlockSuccess = (key: Uint8Array) => {
        unlockAlbum(album.id, key);
        // Effect will trigger decryption
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-stone-600 hover:text-stone-800 mb-4 group"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Albums</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-stone-800 mb-2">{album.name}</h1>
                        {album.description && (
                            <p className="text-stone-600 mb-3">{album.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-stone-500">
                            <span className="flex items-center gap-1.5">
                                <ImageIcon size={16} />
                                {photos.length} photos
                            </span>
                            <span>•</span>
                            <span className="capitalize">{album.privacy}</span>
                            {album.members.length > 1 && (
                                <>
                                    <span>•</span>
                                    <span>{album.members.length} members</span>
                                </>
                            )}

                            {!albumKey && (
                                <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full text-xs font-bold">
                                    <Lock size={12} /> Vault Locked
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onUpload}
                            className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                        >
                            <Upload size={20} />
                            <span>Upload Photos</span>
                        </button>

                        {isOwner && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    className="p-3 hover:bg-stone-100 rounded-xl transition-colors"
                                >
                                    <MoreVertical size={20} className="text-stone-600" />
                                </button>

                                {showMenu && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={() => setShowMenu(false)}
                                        />

                                        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-stone-100 py-1 min-w-[160px] z-20 animate-fade-in-up">
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    onEdit();
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
                                            >
                                                <Edit size={14} />
                                                <span>Edit Album</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    onDelete();
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Trash2 size={14} />
                                                <span>Delete Album</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Photos Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="w-12 h-12 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
                </div>
            ) : !albumKey ? (
                // Locked State (Check if we are auto-unlocking)
                checkingVault ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <div className="w-12 h-12 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin mb-4" />
                        <p className="text-stone-500 font-medium animate-pulse">Unlocking Vault...</p>
                    </div>
                ) : (
                    <div className="text-center py-20 bg-stone-50 rounded-3xl border-2 border-dashed border-stone-200">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-6">
                            <Lock size={40} className="text-stone-300" />
                        </div>
                        <h3 className="text-xl font-semibold text-stone-700 mb-2">Encrypted Album</h3>
                        <p className="text-stone-500 mb-8 max-w-sm mx-auto">This album is locked on this device. Use your Recovery Key to access it.</p>
                        <Button onClick={() => setShowUnlock(true)} className="px-8 py-3">
                            <KeyRound size={20} className="mr-2" />
                            Unlock Gallery
                        </Button>
                    </div>
                )
            ) : decrypting ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="w-12 h-12 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin mb-4" />
                    <p className="text-stone-500 font-medium animate-pulse">Decrypting memories...</p>
                </div>
            ) : photos.length === 0 ? (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                        <ImageIcon size={40} className="text-stone-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-stone-700 mb-2">No photos yet</h3>
                    <p className="text-stone-500 mb-6">Start adding photos to this album</p>
                    <button
                        onClick={onUpload}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 inline-flex items-center gap-2 font-medium"
                    >
                        <Upload size={20} />
                        <span>Upload Photos</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in-up">
                    {photos.map((photo) => (
                        <PhotoCard
                            key={photo.id}
                            photo={photo}
                            onClick={() => onPhotoClick(photo)}
                            currentUser={currentUserId ? { id: currentUserId } as any : null}
                        />
                    ))}
                </div>
            )}

            <VaultUnlockModal
                isOpen={showUnlock}
                onClose={() => setShowUnlock(false)}
                onUnlock={handleUnlockSuccess}
                albumId={album.id}
                albumName={album.name}
            />
        </div>
    );
};
