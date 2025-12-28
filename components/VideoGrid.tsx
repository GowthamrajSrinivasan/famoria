import React, { useEffect, useState } from 'react';
import { VideoCard } from './VideoCard';
import { VideoLightbox } from './VideoLightbox';
import { VideoUploader } from './VideoUploader';
import { videoService } from '../services/videoService';
import { Video, User } from '../types';
import { Film, Plus } from 'lucide-react';

interface VideoGridProps {
    currentUser: User | null;
    albumId?: string;
}

export const VideoGrid: React.FC<VideoGridProps> = ({ currentUser, albumId }) => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);
    const [showUploader, setShowUploader] = useState(false);

    useEffect(() => {
        const unsubscribe = videoService.subscribeToVideos((fetchedVideos) => {
            setVideos(fetchedVideos);
            setLoading(false);
        }, albumId);

        return () => unsubscribe();
    }, [albumId]);

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
            {/* Header with Upload Button */}
            <div className="flex justify-between items-center mb-8">
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
                    {videos.map((video) => (
                        <VideoCard
                            key={video.id}
                            video={video}
                            currentUser={currentUser}
                            onClick={() => handleVideoClick(video)}
                            onDelete={handleDelete}
                            onLike={handleLike}
                        />
                    ))}
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
