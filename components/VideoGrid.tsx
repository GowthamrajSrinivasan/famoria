import React, { useEffect, useState } from 'react';
import { VideoCard } from './VideoCard';
import { VideoLightbox } from './VideoLightbox';
import { VideoUploader } from './VideoUploader';
import { videoService } from '../services/videoService';
import { Video, User, Album } from '../types';
import { Film, Plus, ArrowUpDown, Filter, X } from 'lucide-react';
import { userService } from '../services/userService';
import { subscribeToAlbums } from '../services/albumService';

interface VideoGridProps {
    currentUser: User | null;
    albumId?: string;
}

export const VideoGrid: React.FC<VideoGridProps> = ({ currentUser, albumId }) => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'liked' | 'viewed'>('newest');
    const [loading, setLoading] = useState(true);
    const [showUploader, setShowUploader] = useState(false);

    // Filter state
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedUploaders, setSelectedUploaders] = useState<string[]>([]);
    const [selectedAlbums, setSelectedAlbums] = useState<string[]>([]);
    const [availableUsers, setAvailableUsers] = useState<{ id: string, name: string }[]>([]);
    const [availableAlbums, setAvailableAlbums] = useState<Album[]>([]);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        const unsubscribe = videoService.subscribeToVideos((fetchedVideos) => {
            setVideos(fetchedVideos);
            setLoading(false);
        }, albumId);

        return () => unsubscribe();
    }, [albumId]);

    // Fetch users and albums for filters (only when not in album view)
    useEffect(() => {
        if (!currentUser) return;

        const fetchFilterData = async () => {
            try {
                const users = await userService.getAllUsers();
                setAvailableUsers(users.map(u => ({ id: u.id, name: u.name })));
            } catch (error) {
                console.error('[VideoGrid] Error fetching users:', error);
            }
        };

        let unsubscribeAlbums: (() => void) | null = null;
        if (!albumId) {
            // Only show album filter when not in album view
            unsubscribeAlbums = subscribeToAlbums(currentUser.id, (albums) => {
                setAvailableAlbums(albums);
            });
        }

        fetchFilterData();

        return () => {
            if (unsubscribeAlbums) {
                unsubscribeAlbums();
            }
        };
    }, [currentUser, albumId]);

    const handleVideoClick = (video: Video) => {
        setSelectedVideo(video);
        videoService.incrementViews(video.id);
    };

    const handleDelete = async (videoId: string) => {
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

    const handleLike = async (videoId: string) => {
        if (!currentUser) return;

        try {
            await videoService.toggleLike(videoId, currentUser.id);
        } catch (error) {
            console.error('Failed to toggle like:', error);
        }
    };

    const handleUploadComplete = (videoId: string) => {
        setShowUploader(false);
        // Videos will auto-update via subscription
    };

    // Extract unique tags from videos
    const uniqueTags = Array.from(new Set(videos.flatMap(v => v.tags)));

    // Count active filters
    const activeFilterCount = selectedTags.length + selectedUploaders.length + selectedAlbums.length;

    // Clear all filters
    const clearFilters = () => {
        setSelectedTags([]);
        setSelectedUploaders([]);
        setSelectedAlbums([]);
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

        if (selectedAlbums.length > 0) {
            result = result.filter(v => v.albumId && selectedAlbums.includes(v.albumId));
        }

        return result;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-stone-500">Loading videos...</p>
            </div>
        );
    }

    return (
        <>
            {/* Header with Upload Button and Sort */}
            <div className="flex flex-col gap-4 mb-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-stone-800 mb-2 font-serif">Videos</h1>
                        <p className="text-stone-500">
                            {videos.length === 0 ? 'No videos yet' : `${videos.length} video${videos.length === 1 ? '' : 's'}`}
                        </p>
                    </div>
                    {currentUser && (
                        <button
                            onClick={() => setShowUploader(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <Plus size={20} />
                            Upload Video
                        </button>
                    )}
                </div>

                {/* Sort Dropdown */}
                {videos.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-3">
                            <ArrowUpDown size={16} className="text-stone-400" />
                            <span className="text-sm font-medium text-stone-600">Sort by:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all cursor-pointer hover:border-stone-300"
                            >
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                                <option value="liked">Most Liked</option>
                                <option value="viewed">Most Viewed</option>
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
                                <span>Filters</span>
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
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm mb-8">
                    <div className={`grid grid-cols-1 ${albumId ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
                        {/* Tags Filter */}
                        <div>
                            <label className="block text-sm font-medium text-stone-700 mb-2">
                                Tagged People
                            </label>
                            <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1">
                                {uniqueTags.length === 0 ? (
                                    <p className="text-sm text-stone-400 p-2">No tags available</p>
                                ) : (
                                    uniqueTags.map(tag => {
                                        const user = availableUsers.find(u => u.id === tag);
                                        const displayName = user?.name || tag;
                                        return (
                                            <label key={tag} className="flex items-center gap-2 p-2 hover:bg-stone-50 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTags.includes(tag)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedTags([...selectedTags, tag]);
                                                        } else {
                                                            setSelectedTags(selectedTags.filter(t => t !== tag));
                                                        }
                                                    }}
                                                    className="rounded border-stone-300 text-orange-500 focus:ring-orange-500"
                                                />
                                                <span className="text-sm text-stone-700">{displayName}</span>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Uploader Filter */}
                        <div>
                            <label className="block text-sm font-medium text-stone-700 mb-2">
                                Uploaded By
                            </label>
                            <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1">
                                {availableUsers.map(user => (
                                    <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-stone-50 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedUploaders.includes(user.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedUploaders([...selectedUploaders, user.id]);
                                                } else {
                                                    setSelectedUploaders(selectedUploaders.filter(u => u !== user.id));
                                                }
                                            }}
                                            className="rounded border-stone-300 text-orange-500 focus:ring-orange-500"
                                        />
                                        <span className="text-sm text-stone-700">{user.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Albums Filter - only show when not in album view */}
                        {!albumId && (
                            <div>
                                <label className="block text-sm font-medium text-stone-700 mb-2">
                                    Albums
                                </label>
                                <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1">
                                    {availableAlbums.length === 0 ? (
                                        <p className="text-sm text-stone-400 p-2">No albums available</p>
                                    ) : (
                                        availableAlbums.map(album => (
                                            <label key={album.id} className="flex items-center gap-2 p-2 hover:bg-stone-50 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedAlbums.includes(album.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedAlbums([...selectedAlbums, album.id]);
                                                        } else {
                                                            setSelectedAlbums(selectedAlbums.filter(a => a !== album.id));
                                                        }
                                                    }}
                                                    className="rounded border-stone-300 text-orange-500 focus:ring-orange-500"
                                                />
                                                <span className="text-sm text-stone-700">{album.name}</span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {videos.length === 0 ? (
                <div className="text-center py-20">
                    <Film size={64} className="mx-auto text-stone-300 mb-4" />
                    <p className="text-stone-500 text-lg font-medium">No videos yet</p>
                    <p className="text-stone-400 text-sm mt-2">
                        {albumId ? 'Upload videos to this album to get started' : 'Upload your first video to get started'}
                    </p>
                </div>
            ) : (
                /* Video Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {(() => {
                        const filteredVideos = getFilteredVideos();
                        const sortedVideos = [...filteredVideos].sort((a, b) => {
                            switch (sortBy) {
                                case 'newest':
                                    return (b.createdAt?.toMillis?.() || b.uploadDate?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || a.uploadDate?.toMillis?.() || 0);
                                case 'oldest':
                                    return (a.createdAt?.toMillis?.() || a.uploadDate?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || b.uploadDate?.toMillis?.() || 0);
                                case 'liked':
                                    return (b.likes?.length || 0) - (a.likes?.length || 0);
                                case 'viewed':
                                    return (b.viewsCount || 0) - (a.viewsCount || 0);
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
                                onDelete={handleDelete}
                                onLike={handleLike}
                            />
                        ));
                    })()}
                </div>
            )}

            {/* Video Uploader Modal */}
            {showUploader && currentUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <VideoUploader
                        currentUser={currentUser}
                        albumId={albumId}
                        onUploadComplete={handleUploadComplete}
                        onClose={() => setShowUploader(false)}
                    />
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
        </>
    );
};
