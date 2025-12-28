import React, { useState } from 'react';
import { Upload, Video as VideoIcon, X, Film } from 'lucide-react';
import { videoService } from '../services/videoService';
import { VideoUploadProgress } from '../types';
import { User } from '../types';

interface VideoUploaderProps {
    currentUser: User;
    albumId?: string;
    onUploadComplete?: (videoId: string) => void;
    onClose?: () => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
    currentUser,
    albumId,
    onUploadComplete,
    onClose
}) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [uploadProgress, setUploadProgress] = useState<VideoUploadProgress | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('video/')) {
            if (file.size > 100 * 1024 * 1024) {
                alert('Video size must be less than 100MB');
                return;
            }
            setSelectedFile(file);
            setTitle(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
        } else {
            alert('Please select a video file (MP4, WebM, or MOV)');
        }
    };

    const handleUpload = async () => {
        if (!selectedFile || !title.trim()) {
            alert('Please select a video and enter a title');
            return;
        }

        setIsUploading(true);

        try {
            const videoId = await videoService.uploadVideo(
                selectedFile,
                {
                    title: title.trim(),
                    description: description.trim(),
                    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                    albumId,
                    isPublic
                },
                currentUser.id,
                currentUser.name,
                setUploadProgress
            );

            // Reset form
            setSelectedFile(null);
            setTitle('');
            setDescription('');
            setTags('');
            setUploadProgress(null);

            onUploadComplete?.(videoId);
            alert('Video uploaded successfully!');
        } catch (error: any) {
            // Completely silent for permission errors - no logs at all
            if (error?.code === 'storage/unauthorized' || error?.message?.includes('permission')) {
                // Do nothing - completely silent
            } else {
                // Log and alert only for non-permission errors
                console.error('Error uploading video:', error);
                alert('Failed to upload video: ' + (error.message || 'Unknown error'));
            }
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Film className="text-orange-500" />
                    Upload Video
                </h2>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                    >
                        <X size={24} />
                    </button>
                )}
            </div>

            {/* File Selection */}
            {!selectedFile ? (
                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-stone-300 rounded-xl cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition-all">
                    <Upload size={48} className="text-stone-400 mb-4" />
                    <span className="text-stone-600 font-medium">Click to select video</span>
                    <span className="text-stone-400 text-sm mt-2">MP4, WebM, or MOV (Max 100MB)</span>
                    <input
                        type="file"
                        className="hidden"
                        accept="video/*"
                        onChange={handleFileSelect}
                        disabled={isUploading}
                    />
                </label>
            ) : (
                <div className="space-y-4">
                    {/* Selected File Info */}
                    <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <VideoIcon className="text-orange-500" />
                            <div>
                                <p className="font-medium">{selectedFile.name}</p>
                                <p className="text-sm text-stone-500">
                                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedFile(null)}
                            disabled={isUploading}
                            className="p-2 hover:bg-stone-200 rounded-full transition-colors disabled:opacity-50"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Upload Form */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Title *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                disabled={isUploading}
                                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-stone-100"
                                placeholder="Enter video title"
                                maxLength={100}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={isUploading}
                                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 h-24 disabled:bg-stone-100 resize-none"
                                placeholder="Enter video description"
                                maxLength={500}
                            />
                            <p className="text-xs text-stone-400 mt-1">{description.length}/500</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Tags (comma separated)</label>
                            <input
                                type="text"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                disabled={isUploading}
                                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-stone-100"
                                placeholder="tag1, tag2, tag3"
                            />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                disabled={isUploading}
                                className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                            />
                            <span className="text-sm">Make video public</span>
                        </label>
                    </div>

                    {/* Upload Progress */}
                    {uploadProgress && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="capitalize">{uploadProgress.status}...</span>
                                <span className="font-medium">{uploadProgress.progress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress.progress}%` }}
                                />
                            </div>
                            {uploadProgress.error && (
                                <p className="text-sm text-red-500">{uploadProgress.error}</p>
                            )}
                        </div>
                    )}

                    {/* Upload Button */}
                    <button
                        onClick={handleUpload}
                        disabled={isUploading || !title.trim()}
                        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isUploading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Uploading...</span>
                            </>
                        ) : (
                            <>
                                <Upload size={20} />
                                <span>Upload Video</span>
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};
