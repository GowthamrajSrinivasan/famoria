import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, Edit, Trash2, MoreVertical, Image as ImageIcon, Lock, KeyRound, Video, ChevronDown, ArrowUpDown, Filter, X, Users } from 'lucide-react';
import { Album, Post, Video as VideoType } from '../types';
import { PhotoCard } from './PhotoCard';
import { VideoCard } from './VideoCard';
import { photoService } from '../services/photoService';
import { videoService } from '../services/videoService';

import { Button } from './Button';
import { VideoLightbox } from './VideoLightbox';
import { userService } from '../services/userService';
import * as photoCrypto from '../lib/crypto/photoCrypto';
import * as photoKeyModule from '../lib/crypto/photoKey';
import { useAuth } from '../context/AuthContext';

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
    const { t } = useTranslation();


    const [posts, setPosts] = useState<Post[]>([]);
    const [videos, setVideos] = useState<VideoType[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
    const [filterMode, setFilterMode] = useState<'all' | 'photos' | 'videos'>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'liked' | 'commented'>('newest');
    const [loading, setLoading] = useState(true);
    const [showMenu, setShowMenu] = useState(false);
    const [showUploadMenu, setShowUploadMenu] = useState(false);

    // Filter state
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedUploaders, setSelectedUploaders] = useState<string[]>([]);
    const [availableUsers, setAvailableUsers] = useState<{ id: string, name: string }[]>([]);
    const [showFilters, setShowFilters] = useState(false);

    // Decrypted Album State
    const { user, familyKey } = useAuth();
    const [decryptedName, setDecryptedName] = useState(album.name);
    const [decryptedDescription, setDecryptedDescription] = useState(album.description || '');
    const [memberDetails, setMemberDetails] = useState<any[]>([]);

    useEffect(() => {
        const decryptAlbum = async () => {
            if (familyKey && album.encryptedName) {
                try {
                    const metadata = await photoCrypto.decryptMetadata({
                        encrypted: album.encryptedName,
                        iv: album.metadataIv!,
                        authTag: album.metadataAuthTag!
                    }, familyKey);
                    setDecryptedName(metadata.name);
                    setDecryptedDescription(metadata.description);
                } catch (err) {
                    console.error('[AlbumView] Failed to decrypt album metadata:', err);
                }
            } else {
                setDecryptedName(album.name);
                setDecryptedDescription(album.description || '');
            }
        };
        decryptAlbum();
    }, [album, familyKey]);

    useEffect(() => {
        const fetchMemberDetails = async () => {
            if (album.members && album.members.length > 0 && user?.familyId) {
                try {
                    const familyMembers = await userService.getFamilyMembers(user.familyId);
                    const filtered = familyMembers.filter(m => album.members.includes(m.id));
                    setMemberDetails(filtered);
                } catch (err) {
                    console.error('[AlbumView] Failed to fetch member details:', err);
                }
            }
        };
        fetchMemberDetails();
    }, [album.members, user?.familyId]);

    const isOwner = currentUserId === album.createdBy;

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
            unsubscribePosts = photoService.subscribeToAlbumPosts(album.id, async (fetchedPosts) => {
                if (isMounted) {
                    // Decrypt posts for filtering/display
                    const decrypted = await Promise.all(fetchedPosts.map(async (post) => {
                        if (familyKey && post.isEncrypted && (post as any).encryptedMetadata) {
                            try {
                                const postKey = await photoKeyModule.derivePhotoKey(familyKey, post.id);
                                const metadata = await photoCrypto.decryptMetadata({
                                    encrypted: (post as any).encryptedMetadata,
                                    iv: (post as any).metadataIv,
                                    authTag: (post as any).metadataAuthTag
                                }, postKey);
                                return {
                                    ...post,
                                    caption: metadata.caption || post.caption,
                                    tags: metadata.tags || post.tags,
                                    location: metadata.location || post.location
                                };
                            } catch (err) {
                                console.error(`[AlbumView] Failed to decrypt post ${post.id}:`, err);
                                return post;
                            }
                        }
                        return post;
                    }));

                    setPosts(decrypted);
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



    // Fetch users for filter
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const members = user?.familyId ? await userService.getFamilyMembers(user.familyId) : [];
                setAvailableUsers(members.map(u => ({ id: u.id, name: u.name })));
            } catch (error) {
                console.error('[AlbumView] Error fetching users:', error);
            }
        };
        fetchUsers();
    }, [user?.familyId]);



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

    // Extract unique tags from posts and videos
    const uniqueTags = Array.from(new Set([
        ...posts.flatMap(p => p.tags),
        ...videos.flatMap(v => v.tags)
    ]));

    // Count active filters
    const activeFilterCount = selectedTags.length + selectedUploaders.length;

    // Clear all filters
    const clearFilters = () => {
        setSelectedTags([]);
        setSelectedUploaders([]);
    };

    // Apply filters to posts
    const getFilteredPosts = () => {
        let result = posts;

        if (selectedTags.length > 0) {
            result = result.filter(p => selectedTags.some(tag => p.tags.includes(tag)));
        }

        if (selectedUploaders.length > 0) {
            result = result.filter(p => selectedUploaders.includes(p.authorId));
        }

        return result;
    };

    // Apply filters to videos
    const getFilteredVideos = () => {
        let result = videos;

        if (selectedTags.length > 0) {
            result = result.filter(v => selectedTags.some(tag => v.tags.includes(tag)));
        }

        if (selectedUploaders.length > 0) {
            result = result.filter(v => selectedUploaders.includes(v.uploadedBy));
        }

        return result;
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
                    <span>{t('back_to_albums')}</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between overflow-visible">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-stone-800 mb-2">{decryptedName}</h1>
                        {decryptedDescription && (
                            <p className="text-stone-600 mb-3">{decryptedDescription}</p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-stone-500 overflow-visible">
                            <span className="flex items-center gap-1.5">
                                <ImageIcon size={16} />
                                {posts.length + videos.length} {t('items')}
                            </span>
                            <span>•</span>
                            <span className="capitalize">{album.privacy}</span>
                            {album.members.length > 0 && (
                                <>
                                    <span>•</span>
                                    <div className="flex -space-x-2 overflow-visible">
                                        {memberDetails.length > 0 ? (
                                            memberDetails.map((member) => (
                                                <div
                                                    key={member.id}
                                                    className="w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-stone-100 ring-1 ring-stone-100"
                                                    title={member.name}
                                                >
                                                    <img
                                                        src={member.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${member.id}`}
                                                        alt={member.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-xs">{album.members.length} {t('members')}</span>
                                        )}
                                    </div>
                                    {memberDetails.length > 0 && (
                                        <span className="ml-1 text-xs">
                                            {memberDetails.length === 1 ? memberDetails[0].name : `${memberDetails.length} items`}
                                        </span>
                                    )}
                                </>
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
                                <span>{t('upload')}</span>
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
                                                <p className="font-medium">{t('upload_photos')}</p>
                                                <p className="text-xs text-stone-500">{t('upload_photos_desc')}</p>
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
                                                        <p className="font-medium">{t('upload_videos')}</p>
                                                        <p className="text-xs text-stone-500">{t('upload_videos_desc')}</p>
                                                    </div>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {isOwner && (
                            <div className="flex items-center gap-2">

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
                                                    <span className="font-medium">{t('edit_album')}</span>
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
                                                    <span className="font-medium">{t('delete_album')}</span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Buttons */}
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-2 bg-stone-100 p-1.5 rounded-xl">
                    <button
                        onClick={() => setFilterMode('all')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterMode === 'all'
                            ? 'bg-white text-stone-800 shadow-sm'
                            : 'text-stone-500 hover:text-stone-700'
                            }`}
                    >
                        {t('filter_all')}
                    </button>
                    <button
                        onClick={() => setFilterMode('photos')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterMode === 'photos'
                            ? 'bg-white text-stone-800 shadow-sm'
                            : 'text-stone-500 hover:text-stone-700'
                            }`}
                    >
                        {t('filter_photos')}
                    </button>
                    <button
                        onClick={() => setFilterMode('videos')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterMode === 'videos'
                            ? 'bg-white text-stone-800 shadow-sm'
                            : 'text-stone-500 hover:text-stone-700'
                            }`}
                    >
                        {t('filter_videos')}
                    </button>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-3">
                    <ArrowUpDown size={16} className="text-stone-400" />
                    <span className="text-sm font-medium text-stone-600">{t('sort_by')}</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all cursor-pointer hover:border-stone-300"
                    >
                        <option value="newest">{t('sort_newest')}</option>
                        <option value="oldest">{t('sort_oldest')}</option>
                        <option value="liked">{t('sort_liked')}</option>
                        <option value="commented">{t('sort_commented')}</option>
                    </select>
                </div>

                {/* Filter Button */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeFilterCount > 0
                            ? 'bg-orange-100 text-orange-700 border border-orange-200'
                            : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-300'
                            }`}
                    >
                        <Filter size={16} />
                        <span>{t('filters')}</span>
                        {activeFilterCount > 0 && (
                            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-stone-500 hover:text-stone-700 font-medium"
                        >
                            {t('clear_all')}
                        </button>
                    )}
                </div>
            </div>

            {/* Active Filter Chips */}
            {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2 items-center mb-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    <span className="text-sm font-medium text-stone-600">{t('active_filters')}</span>
                    {selectedTags.map(tag => {
                        const user = availableUsers.find(u => u.id === tag);
                        const displayName = user?.name || tag;
                        return (
                            <div key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm font-medium transition-all hover:bg-orange-200">
                                <span>{displayName}</span>
                                <button onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))} className="hover:text-orange-900 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                        );
                    })}
                    {selectedUploaders.map(uploaderId => {
                        const user = availableUsers.find(u => u.id === uploaderId);
                        return (
                            <div key={uploaderId} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium transition-all hover:bg-blue-200">
                                <span>{user?.name || uploaderId}</span>
                                <button onClick={() => setSelectedUploaders(selectedUploaders.filter(u => u !== uploaderId))} className="hover:text-blue-900 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Filter Panel */}
            {showFilters && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-lg shadow-stone-200/50 mb-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Tags Filter */}
                        <div>
                            <label className="block text-sm font-semibold text-stone-800 mb-3">
                                {t('filter_tagged_people')}
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {uniqueTags.length === 0 ? (
                                    <p className="text-sm text-stone-400">{t('no_tags')}</p>
                                ) : (
                                    uniqueTags.map(tag => {
                                        const user = availableUsers.find(u => u.id === tag);
                                        const displayName = user?.name || tag;
                                        const isSelected = selectedTags.includes(tag);
                                        return (
                                            <button
                                                key={tag}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedTags(selectedTags.filter(t => t !== tag));
                                                    } else {
                                                        setSelectedTags([...selectedTags, tag]);
                                                    }
                                                }}
                                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-in-out ${isSelected
                                                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30 hover:bg-orange-600'
                                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 hover:shadow-sm'
                                                    }`}
                                            >
                                                {displayName}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Uploader Filter */}
                        <div>
                            <label className="block text-sm font-semibold text-stone-800 mb-3">
                                {t('filter_uploaded_by')}
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {availableUsers.map(user => {
                                    const isSelected = selectedUploaders.includes(user.id);
                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedUploaders(selectedUploaders.filter(u => u !== user.id));
                                                } else {
                                                    setSelectedUploaders([...selectedUploaders, user.id]);
                                                }
                                            }}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-in-out ${isSelected
                                                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30 hover:bg-blue-600'
                                                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 hover:shadow-sm'
                                                }`}
                                        >
                                            {user.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="w-12 h-12 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
                </div>
            ) : posts.length === 0 && videos.length === 0 ? (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                        <ImageIcon size={40} className="text-stone-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-stone-700 mb-2">{t('no_content_yet')}</h3>
                    <p className="text-stone-500 mb-6">{t('no_content_desc')}</p>
                    <button
                        onClick={() => setShowUploadMenu(true)}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 inline-flex items-center gap-2 font-medium"
                    >
                        <Upload size={20} />
                        <span>{t('upload')}</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in-up">
                    {/* Render Photos */}
                    {(filterMode === 'all' || filterMode === 'photos') && (() => {
                        const filteredPosts = getFilteredPosts();
                        const sortedPosts = [...filteredPosts].sort((a, b) => {
                            switch (sortBy) {
                                case 'newest':
                                    return b.createdAt - a.createdAt;
                                case 'oldest':
                                    return a.createdAt - b.createdAt;
                                case 'liked':
                                    return (b.likes?.length || 0) - (a.likes?.length || 0);
                                case 'commented':
                                    return (b.commentsCount || 0) - (a.commentsCount || 0);
                                default:
                                    return 0;
                            }
                        });
                        return sortedPosts.map((post) => (
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
                        ));
                    })()}
                    {/* Render Videos */}
                    {(filterMode === 'all' || filterMode === 'videos') && (() => {
                        const filteredVideos = getFilteredVideos();
                        const sortedVideos = [...filteredVideos].sort((a, b) => {
                            switch (sortBy) {
                                case 'newest':
                                    return (b.createdAt?.toMillis?.() || b.uploadDate?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || a.uploadDate?.toMillis?.() || 0);
                                case 'oldest':
                                    return (a.createdAt?.toMillis?.() || a.uploadDate?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || b.uploadDate?.toMillis?.() || 0);
                                case 'liked':
                                    return (b.likes?.length || 0) - (a.likes?.length || 0);
                                case 'commented':
                                    return (b.commentsCount || 0) - (a.commentsCount || 0);
                                default:
                                    return 0;
                            }
                        });
                        return sortedVideos.map((video) => (
                            <VideoCard
                                key={video.id}
                                video={video}
                                currentUser={currentUser}
                                onClick={() => handleVideoClick(video)}
                                onDelete={handleVideoDelete}
                                onLike={handleVideoLike}
                            />
                        ));
                    })()}
                </div>
            )}



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
