import React, { useState, useRef, useEffect } from 'react';
import { X, Calendar, Share2, MoreVertical, Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from 'lucide-react';
import { Video, User } from '../types';
import { CommentSection } from './CommentSection';
import { LikeButton } from './LikeButton';
import { LikesPreview } from './LikesPreview';
import { LikesModal } from './LikesModal';

interface VideoLightboxProps {
    video: Video;
    currentUser: User | null;
    onClose: () => void;
}

export const VideoLightbox: React.FC<VideoLightboxProps> = ({ video, currentUser, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [showLikesModal, setShowLikesModal] = useState(false);

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [onClose]);

    // Video event listeners
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
    }, []);

    // Auto-play on mount
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(() => {
                    // Auto-play blocked, user needs to click
                });
        }
    }, []);

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            setIsPlaying(true);
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
        if (videoRef.current) {
            videoRef.current.volume = vol;
            setIsMuted(vol === 0);
        }
    };

    const toggleMute = () => {
        if (!videoRef.current) return;
        if (isMuted) {
            videoRef.current.muted = false;
            videoRef.current.volume = volume;
            setIsMuted(false);
        } else {
            videoRef.current.muted = true;
            setIsMuted(true);
        }
    };

    const skip = (seconds: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/95 backdrop-blur-md p-4 sm:p-6 animate-fade-in-up">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all z-50"
            >
                <X size={24} />
            </button>

            <div className="w-full max-w-6xl h-full max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">

                {/* Video Section */}
                <div
                    ref={containerRef}
                    className="flex-1 bg-black flex items-center justify-center relative group"
                    onMouseMove={() => setShowControls(true)}
                    onMouseLeave={() => isPlaying && setShowControls(false)}
                >
                    <video
                        ref={videoRef}
                        src={video.url}
                        className="max-w-full max-h-[50vh] md:max-h-full object-contain"
                        onClick={togglePlay}
                    />

                    {/* Custom Controls Overlay */}
                    <div className={`absolute inset-0 pointer-events-none transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                        {/* Top Gradient */}
                        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />

                        {/* Bottom Gradient & Controls */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-4 pointer-events-auto">
                            {/* Progress Bar */}
                            <input
                                type="range"
                                min={0}
                                max={duration || 0}
                                value={currentTime}
                                onChange={handleSeek}
                                className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer mb-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                                style={{
                                    background: `linear-gradient(to right, #f97316 ${(currentTime / duration) * 100}%, rgba(255,255,255,0.2) ${(currentTime / duration) * 100}%)`
                                }}
                            />

                            {/* Controls */}
                            <div className="flex items-center justify-between text-white">
                                <div className="flex items-center gap-2">
                                    {/* Play/Pause */}
                                    <button onClick={togglePlay} className="hover:text-orange-500 transition-colors">
                                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                    </button>

                                    {/* SkipButtons */}
                                    <button onClick={() => skip(-10)} className="hover:text-orange-500 transition-colors">
                                        <SkipBack size={18} />
                                    </button>
                                    <button onClick={() => skip(10)} className="hover:text-orange-500 transition-colors">
                                        <SkipForward size={18} />
                                    </button>

                                    {/* Time */}
                                    <span className="text-sm text-white/90 ml-2">
                                        {formatTime(currentTime)} / {formatTime(duration)}
                                    </span>
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Volume */}
                                    <div className="flex items-center gap-2 group/volume">
                                        <button onClick={toggleMute} className="hover:text-orange-500 transition-colors">
                                            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                        </button>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.1}
                                            value={isMuted ? 0 : volume}
                                            onChange={handleVolumeChange}
                                            className="w-0 group-hover/volume:w-20 transition-all h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                                        />
                                    </div>

                                    {/* Fullscreen */}
                                    <button onClick={toggleFullscreen} className="hover:text-orange-500 transition-colors">
                                        <Maximize size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Section */}
                <div className="w-full md:w-[400px] lg:w-[450px] flex flex-col bg-white border-l border-stone-100">

                    {/* Header */}
                    <div className="p-6 border-b border-stone-100">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
                                    {video.author.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-stone-800">{video.author}</h3>
                                    <div className="flex items-center gap-1.5 text-xs text-stone-400">
                                        <Calendar size={12} />
                                        <span>{new Date(video.uploadDate.toDate()).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                            <button className="text-stone-400 hover:bg-stone-50 p-2 rounded-full transition-colors">
                                <MoreVertical size={20} />
                            </button>
                        </div>

                        <h2 className="text-lg font-bold text-stone-800 mb-2">{video.title}</h2>
                        {video.description && (
                            <p className="text-stone-700 leading-relaxed text-sm">{video.description}</p>
                        )}

                        {video.tags && video.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {video.tags.map((tag, i) => (
                                    <span key={i} className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-1 rounded-md">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-50">
                            <div className="flex gap-3">
                                <LikeButton photoId={video.id} currentUserId={currentUser?.id} variant="lightbox" itemType="video" />
                                <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors">
                                    <Share2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Reactions Section - Below buttons */}
                        {video.likes && video.likes.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-stone-50">
                                <LikesPreview
                                    photoId={video.id}
                                    likes={video.likes}
                                    onClick={() => setShowLikesModal(true)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Comments */}
                    <div className="flex-1 overflow-hidden relative bg-stone-50/30">
                        <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
                        <CommentSection
                            itemId={video.id}
                            itemType="video"
                            currentUser={currentUser}
                            photoLikes={video.likes || []}
                        />
                    </div>
                </div>
            </div>

            {/* Likes Modal */}
            {showLikesModal && (
                <LikesModal
                    likes={video.likes || []}
                    onClose={() => setShowLikesModal(false)}
                />
            )}
        </div>
    );
};
