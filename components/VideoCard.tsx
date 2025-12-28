import React, { useState, useRef, useEffect } from 'react';
import { Video, User } from '../types';
import { Heart, MessageCircle, Play, Pause, Trash2, Eye, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from 'lucide-react';

interface VideoCardProps {
    video: Video;
    currentUser: User | null;
    onClick?: () => void;
    onDelete?: (videoId: string) => void;
    onLike?: (videoId: string) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
    video,
    currentUser,
    onClick,
    onDelete,
    onLike
}) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);

    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout>();

    const isOwner = currentUser?.id === video.uploadedBy;
    const isLiked = currentUser && video.likes.includes(currentUser.id);

    useEffect(() => {
        const videoElement = videoRef.current;
        if (!videoElement) return;

        const handleTimeUpdate = () => setCurrentTime(videoElement.currentTime);
        const handleLoadedMetadata = () => setDuration(videoElement.duration);
        const handleEnded = () => setIsPlaying(false);

        videoElement.addEventListener('timeupdate', handleTimeUpdate);
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.addEventListener('ended', handleEnded);

        return () => {
            videoElement.removeEventListener('timeupdate', handleTimeUpdate);
            videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
            videoElement.removeEventListener('ended', handleEnded);
        };
    }, [isPlaying]);

    // Auto-play when player opens
    useEffect(() => {
        if (isPlaying && videoRef.current) {
            console.log('🎬 Auto-playing video...');
            videoRef.current.play()
                .then(() => {
                    console.log('✅ Video playing!');
                })
                .catch((error) => {
                    console.error('❌ Auto-play failed:', error);
                    // Try unmuting and playing again
                    if (videoRef.current) {
                        videoRef.current.muted = true;
                        videoRef.current.play()
                            .then(() => {
                                console.log('✅ Video playing (muted)');
                                alert('Video started muted. Click volume to unmute.');
                            })
                            .catch((err2) => {
                                console.error('❌ Still failed:', err2);
                                alert('Cannot play video. Try clicking the play button.');
                            });
                    }
                });
        }
    }, [isPlaying]);

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatViews = (views: number) => {
        if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
        if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
        return views.toString();
    };

    const togglePlay = () => {
        console.log('🎬 togglePlay called, isPlaying:', isPlaying);
        console.log('📹 videoRef.current:', videoRef.current);
        console.log('🔗 video.url:', video.url);

        if (!videoRef.current) {
            console.error('❌ No video ref!');
            return;
        }

        if (isPlaying) {
            console.log('⏸️ Pausing video');
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            console.log('▶️ Playing video');
            videoRef.current.play()
                .then(() => {
                    console.log('✅ Video playing successfully');
                    setIsPlaying(true);
                    if (onClick) onClick();
                })
                .catch((error) => {
                    console.error('❌ Error playing video:', error);
                    alert('Cannot play video: ' + error.message);
                });
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value);
        setVolume(vol);
        setIsMuted(vol === 0);
        if (videoRef.current) {
            videoRef.current.volume = vol;
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            const newMuted = !isMuted;
            setIsMuted(newMuted);
            videoRef.current.muted = newMuted;
            if (newMuted) {
                videoRef.current.volume = 0;
            } else {
                videoRef.current.volume = volume;
            }
        }
    };

    const skip = (seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
        }
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onDelete) return;

        if (confirm('Delete this video? This cannot be undone!')) {
            setIsDeleting(true);
            try {
                await onDelete(video.id);
            } catch (error) {
                console.error('Error deleting video:', error);
                alert('Failed to delete video');
                setIsDeleting(false);
            }
        }
    };

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onLike || !currentUser) return;
        await onLike(video.id);
    };

    return (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all group">
            {/* Video Player Container */}
            <div
                ref={containerRef}
                className="relative aspect-video bg-stone-900"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => isPlaying && setShowControls(false)}
            >
                {isPlaying ? (
                    <>
                        <video
                            ref={videoRef}
                            src={video.url}
                            className="w-full h-full object-contain"
                            onClick={togglePlay}
                        />

                        {/* Custom Controls Overlay */}
                        <div className={`absolute inset-0 pointer-events-none transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                            {/* Top Gradient */}
                            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />

                            {/* Bottom Controls */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-auto">
                                {/* Progress Bar */}
                                <input
                                    type="range"
                                    min="0"
                                    max={duration || 0}
                                    value={currentTime}
                                    onChange={handleSeek}
                                    className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer mb-3
                                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                                             [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500
                                             [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full 
                                             [&::-moz-range-thumb]:bg-orange-500 [&::-moz-range-thumb]:border-0"
                                    style={{
                                        background: `linear-gradient(to right, #f97316 0%, #f97316 ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) 100%)`
                                    }}
                                />

                                {/* Controls Row */}
                                <div className="flex items-center gap-3 text-white">
                                    {/* Play/Pause */}
                                    <button onClick={togglePlay} className="hover:text-orange-500 transition-colors">
                                        {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                                    </button>

                                    {/* Skip Backward */}
                                    <button onClick={() => skip(-10)} className="hover:text-orange-500 transition-colors" title="Skip -10s">
                                        <SkipBack size={20} />
                                    </button>

                                    {/* Skip Forward */}
                                    <button onClick={() => skip(10)} className="hover:text-orange-500 transition-colors" title="Skip +10s">
                                        <SkipForward size={20} />
                                    </button>

                                    {/* Time */}
                                    <span className="text-sm font-medium">
                                        {formatTime(currentTime)} / {formatTime(duration)}
                                    </span>

                                    <div className="flex-1" />

                                    {/* Volume Control */}
                                    <div className="flex items-center gap-2 group/volume">
                                        <button onClick={toggleMute} className="hover:text-orange-500 transition-colors">
                                            {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                        </button>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={isMuted ? 0 : volume}
                                            onChange={handleVolumeChange}
                                            className="w-0 group-hover/volume:w-20 transition-all h-1 bg-white/30 rounded-full appearance-none cursor-pointer
                                                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                                                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                                                     [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full 
                                                     [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
                                        />
                                    </div>

                                    {/* Fullscreen */}
                                    <button onClick={toggleFullscreen} className="hover:text-orange-500 transition-colors">
                                        <Maximize size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Delete Button (Owner Only) */}
                        {isOwner && onDelete && (
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white p-2 rounded-full transition-all shadow-lg z-20 pointer-events-auto"
                                title="Delete video"
                            >
                                {isDeleting ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Trash2 size={16} />
                                )}
                            </button>
                        )}
                    </>
                ) : (
                    <div className="relative w-full h-full cursor-pointer" onClick={() => {
                        console.log('🖱️ Thumbnail clicked!');
                        setIsPlaying(true);
                    }}>
                        {video.thumbnailUrl ? (
                            <img
                                src={video.thumbnailUrl}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f5f5f4" width="400" height="300"/%3E%3Ctext fill="%23a8a29e" font-family="system-ui" font-size="16" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3EVideo%3C/text%3E%3C/svg%3E';
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Play size={48} className="text-stone-400" />
                            </div>
                        )}

                        {/* Play Overlay */}
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                            <div className="w-16 h-16 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform">
                                <Play size={32} className="text-white ml-1" fill="white" />
                            </div>
                        </div>

                        {/* Duration Badge */}
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs font-semibold">
                            {formatTime(video.duration)}
                        </div>

                        {/* Delete Button (Owner Only) */}
                        {isOwner && onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(e);
                                }}
                                disabled={isDeleting}
                                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg z-10"
                                title="Delete video"
                            >
                                {isDeleting ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Trash2 size={16} />
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Video Info */}
            <div className="p-4">
                <h3 className="font-semibold text-stone-800 line-clamp-2 mb-2 hover:text-orange-500 transition-colors">
                    {video.title}
                </h3>

                <p className="text-sm text-stone-600 mb-3">
                    {video.author}
                </p>

                {video.description && (
                    <p className="text-sm text-stone-500 line-clamp-2 mb-3">
                        {video.description}
                    </p>
                )}

                {/* Stats Row */}
                <div className="flex items-center gap-4 text-sm text-stone-500">
                    <div className="flex items-center gap-1">
                        <Eye size={16} />
                        <span>{formatViews(video.viewsCount || 0)}</span>
                    </div>

                    <button
                        onClick={handleLike}
                        disabled={!currentUser}
                        className={`flex items-center gap-1 transition-colors ${isLiked ? 'text-red-500' : 'hover:text-red-500'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
                        <span>{video.likes.length}</span>
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick?.();
                        }}
                        className="flex items-center gap-1 hover:text-orange-500 transition-colors"
                    >
                        <MessageCircle size={16} />
                        <span>{video.commentsCount || 0}</span>
                    </button>
                </div>

                {/* Tags */}
                {video.tags && video.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {video.tags.map((tag, index) => (
                            <span
                                key={index}
                                className="px-2 py-1 bg-orange-50 text-orange-600 rounded-full text-xs font-medium"
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div >
    );
};

