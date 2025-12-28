import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Edit, Trash2, MoreVertical, Image as ImageIcon, Lock, KeyRound, Video, ChevronDown } from 'lucide-react';
import { Album, Post, Video as VideoType } from '../types';
import { PhotoCard } from './PhotoCard';
import { VideoCard } from './VideoCard';
import { photoService } from '../services/photoService';
import { videoService } from '../services/videoService';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';
import { VaultUnlockModal } from './VaultUnlockModal';
import { VideoLightbox } from './VideoLightbox';

interface AlbumViewProps {
    album: Album;
    currentUserId?: string;
    currentUser?: any;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onUpload: () => void;
    onUploadVideo?: () => void;
    onPhotoClick: (photo: Post) => void;
}

export const AlbumView: React.FC<AlbumViewProps> = ({
    album,
    currentUserId,
    currentUser,
    onBack,
    onEdit,
    onDelete,
    onUpload,
    onUploadVideo,
    onPhotoClick
}) => {
    const { getAlbumKey, unlockAlbum, autoUnlockAlbum } = useAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [videos, setVideos] = useState<VideoType[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
    const [filterMode, setFilterMode] = useState<'all' | 'photos' | 'videos'>('all');
    const [loading, setLoading] = useState(true);
    const [showMenu, setShowMenu] = useState(false);
    const [showUploadMenu, setShowUploadMenu] = useState(false);
    const [showUnlock, setShowUnlock] = useState(false);
    const [checkingVault, setCheckingVault] = useState(false);
    const hasAttemptedUnlock = React.useRef(false);

    const isOwner = currentUserId === album.createdBy;
    const albumKey = getAlbumKey(album.id);

    // Subscribe to posts and videos in this album
    useEffect(() => {
        setLoading(true);
        let postsLoaded = false;
        let videosLoaded = false;
        let isMounted = true;

        const checkLoadingComplete = () => {
            if (isMounted && postsLoaded && videosLoaded) {
                setLoading(false);
            }
        };

        let unsubscribePosts: (() => void) | null = null;
        let unsubscribeVideos: (() => void) | null = null;

        try {
            unsubscribePosts = photoService.subscribeToAlbumPosts(album.id, (fetchedPosts) => {
                if (isMounted) {
                    setPosts(fetchedPosts);
                    postsLoaded = true;
                    checkLoadingComplete();
                }
            });

            unsubscribeVideos = videoService.subscribeToVideos((fetchedVideos) => {
                if (isMounted) {
                    setVideos(fetchedVideos);
                    videosLoaded = true;
                    checkLoadingComplete();
                }
            }, album.id);
        } catch (error) {
            console.error('[AlbumView] Error setting up subscriptions:', error);
            if (isMounted) {
                setLoading(false);
            }
        }

        return () => {
            isMounted = false;
            if (unsubscribePosts) {
                try {
                    unsubscribePosts();
                } catch (error) {
                    console.error('[AlbumView] Error unsubscribing from posts:', error);
                }
            }
            if (unsubscribeVideos) {
                try {
                    unsubscribeVideos();
                } catch (error) {
                    console.error('[AlbumView] Error unsubscribing from videos:', error);
                }
            }
        };
    }, [album.id]);

    // Auto-unlock on mount if locked
    useEffect(() => {
        if (!albumKey && !hasAttemptedUnlock.current && !checkingVault) {
            hasAttemptedUnlock.current = true;

            const attemptUnlock = async () => {
                console.log(`[AlbumView] Attempting auto-unlock for album: ${album.id}`);
                setCheckingVault(true);
                const success = await autoUnlockAlbum(album.id);
                setCheckingVault(false);
            };
            attemptUnlock();
        }
    }, [albumKey, album.id]);

    const handleUnlockSuccess = (key: Uint8Array) => {
        unlockAlbum(album.id, key);
        // Effect will trigger decryption
    };

    const handleVideoClick = (video: VideoType) => {
        setSelectedVideo(video);
        videoService.incrementViews(video.id);
    };

    const handleVideoDelete = async (videoId: string) => {
        if (!currentUser) return;

        try {
            await videoService.deleteVideo(videoId, currentUser.id);
            if (selectedVideo?.id === videoId) {
                setSelectedVideo(null);
            }
        } catch (error) {
            console.error('Failed to delete video:', error);
            alert('Failed to delete video. Please try again.');
        }
    };

    const handleVideoLike = async (videoId: string) => {
        if (!currentUser) return;

        try {
            await videoService.toggleLike(videoId, currentUser.id);
        } catch (error) {
            console.error('Failed to toggle like:', error);
        }
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8 overflow-visible">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-stone-600 hover:text-stone-800 mb-4 group"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Albums</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between overflow-visible">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-stone-800 mb-2">{album.name}</h1>
                        {album.description && (
                            <p className="text-stone-600 mb-3">{album.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-stone-500 overflow-visible">
                            <span className="flex items-center gap-1.5">
                                <ImageIcon size={16} />
                                {posts.length + videos.length} {posts.length + videos.length === 1 ? 'item' : 'items'}
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

                    <div className="flex items-center gap-3 overflow-visible">
                        {/* Upload Menu Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowUploadMenu(!showUploadMenu)}
                                className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                            >
                                <Upload size={20} />
                                <span>Upload</span>
                                <ChevronDown size={16} className={`transition-transform ${showUploadMenu ? 'rotate-180' : ''}`} />
                            </button>

                            {showUploadMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setShowUploadMenu(false)}
                                    />
                                    <div className="absolute left-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-stone-200 py-2 w-56 z-50">
                                        <button
                                            onClick={() => {
                                                setShowUploadMenu(false);
                                                onUpload();
                                            }}
                                            className="w-full px-4 py-3 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-3 transition-colors"
                                        >
                                            <ImageIcon size={18} className="text-orange-500" />
                                            <div>
                                                <p className="font-medium">Upload Photos</p>
                                                <p className="text-xs text-stone-500">Add images to album</p>
                                            </div>
                                        </button>
                                        {onUploadVideo && (
                                            <>
                                                <div className="h-px bg-stone-200 mx-2" />
                                                <button
                                                    onClick={() => {
                                                        setShowUploadMenu(false);
                                                        onUploadVideo();
                                                    }}
                                                    className="w-full px-4 py-3 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-3 transition-colors"
                                                >
                                                    <Video size={18} className="text-orange-500" />
                                                    <div>
                                                        <p className="font-medium">Upload Videos</p>
                                                        <p className="text-xs text-stone-500">Add videos to album</p>
                                                    </div>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

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
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowMenu(false)}
                                        />

                                        <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-stone-200 py-2 w-48 z-50 max-h-[300px] overflow-y-auto">
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    onEdit();
                                                }}
                                                className="w-full px-4 py-3 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-3 transition-colors"
                                            >
                                                <Edit size={16} />
                                                <span className="font-medium">Edit Album</span>
                                            </button>
                                            <div className="h-px bg-stone-200 mx-2" />
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    onDelete();
                                                }}
                                                className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                                <span className="font-medium">Delete Album</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Buttons */}
            <div className="mb-6 flex items-center gap-2 bg-stone-100 p-1.5 rounded-xl w-fit">
                <button
                    onClick={() => setFilterMode('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterMode === 'all'
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                        }`}
                >
                    All
                </button>
                <button
                    onClick={() => setFilterMode('photos')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterMode === 'photos'
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                        }`}
                >
                    Photos
                </button>
                <button
                    onClick={() => setFilterMode('videos')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterMode === 'videos'
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                        }`}
                >
                    Videos
                </button>
            </div>

            {/* Content Grid */}
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
            ) : posts.length === 0 && videos.length === 0 ? (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                        <ImageIcon size={40} className="text-stone-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-stone-700 mb-2">No content yet</h3>
                    <p className="text-stone-500 mb-6">Start adding photos or videos to this album</p>
                    <button
                        onClick={() => setShowUploadMenu(true)}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 inline-flex items-center gap-2 font-medium"
                    >
                        <Upload size={20} />
                        <span>Upload</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in-up">
                    {/* Render Photos */}
                    {(filterMode === 'all' || filterMode === 'photos') && posts.map((post) => (
                        <PhotoCard
                            key={post.id}
                            photo={post}
                            onClick={() => onPhotoClick(post)}
                            currentUser={currentUser}
                            onDelete={async (photoId) => {
                                await photoService.deletePhoto(photoId);
                            }}
                            onSetCover={async (photoUrl) => {
                                // Set cover logic would go here
                                console.log('Set cover:', photoUrl);
                            }}
                            showCoverOption={isOwner}
                        />
                    ))}
                    {/* Render Videos */}
                    {(filterMode === 'all' || filterMode === 'videos') && videos.map((video) => (
                        <VideoCard
                            key={video.id}
                            video={video}
                            currentUser={currentUser}
                            onClick={() => handleVideoClick(video)}
                            onDelete={handleVideoDelete}
                            onLike={handleVideoLike}
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

            {/* Video Lightbox with Comments & Likes */}
            {selectedVideo && (
                <VideoLightbox
                    video={selectedVideo}
                    currentUser={currentUser}
                    onClose={() => setSelectedVideo(null)}
                />
            )}
        </div>
    );
};
