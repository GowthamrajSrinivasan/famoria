import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Film, Check, Loader } from 'lucide-react';
import { photoService } from '../services/photoService';
import { videoService } from '../services/videoService';
import { Photo, User, VideoUploadProgress } from '../types';

interface MediaUploaderProps {
    onUploadComplete: (media: Photo | string) => void; // Photo for images, string (videoId) for videos
    onCancel: () => void;
    albumId?: string;
    currentUser: User;
}

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_IMAGE_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const ALLOWED_VIDEO_FORMATS = ['video/mp4', 'video/webm', 'video/mov', 'video/quicktime'];

type MediaType = 'image' | 'video';

export const MediaUploader: React.FC<MediaUploaderProps> = ({
    onUploadComplete,
    onCancel,
    albumId,
    currentUser
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [mediaType, setMediaType] = useState<MediaType | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Photo fields
    const [caption, setCaption] = useState('');
    const [tags, setTags] = useState<string[]>([]);

    // Video fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [videoTags, setVideoTags] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [uploadProgress, setUploadProgress] = useState<VideoUploadProgress | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const detectMediaType = (file: File): MediaType | null => {
        if (ALLOWED_IMAGE_FORMATS.includes(file.type)) return 'image';
        if (ALLOWED_VIDEO_FORMATS.includes(file.type)) return 'video';
        return null;
    };

    const handleFileSelect = (file: File) => {
        const type = detectMediaType(file);

        if (!type) {
            alert('Unsupported file type. Please select an image or video.');
            return;
        }

        // Check file size
        const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
        if (file.size > maxSize) {
            alert(`File too large. Max size: ${type === 'image' ? '20MB' : '100MB'}`);
            return;
        }

        setSelectedFile(file);
        setMediaType(type);

        // Set default title/caption from filename
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        if (type === 'image') {
            setCaption(nameWithoutExt);
        } else {
            setTitle(nameWithoutExt);
        }

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    // FIXME: uploadPhoto method doesn't exist in photoService
    // This function is not currently used in the component
    /*
    const handleUploadPhoto = async () => {
        if (!selectedFile || !currentUser) return;

        setIsUploading(true);
        try {
            const photoId = await photoService.uploadPhoto(
                selectedFile,
                {
                    caption: caption || selectedFile.name,
                    tags: tags,
                    albumId: albumId
                },
                currentUser.id,
                currentUser.name,
                (progress) => {
                    setUploadProgress({
                        fileName: selectedFile.name,
                        progress,
                        status: progress < 100 ? 'uploading' : 'complete'
                    });
                }
            );
            onUploadComplete(photoId);
        } catch (error: any) {
            alert('Failed to upload photo: ' + error.message);
            setIsUploading(false);
        }
    };
    */

    const handleUploadVideo = async () => {
        if (!selectedFile || !title.trim() || !currentUser) return;

        setIsUploading(true);
        try {
            const videoId = await videoService.uploadVideo(
                selectedFile,
                {
                    title: title.trim(),
                    description: description.trim(),
                    tags: videoTags.split(',').map(t => t.trim()).filter(Boolean),
                    albumId,
                    isPublic
                },
                currentUser.id,
                currentUser.name,
                setUploadProgress
            );
            onUploadComplete(videoId);
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

    const handleUpload = () => {
        if (mediaType === 'image') {
            // Photo upload is handled differently - not using the old method
            // Implement proper photo upload flow here if needed
            alert('Photo upload feature needs to be implemented');
        } else {
            handleUploadVideo();
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-stone-200 p-6 flex items-center justify-between z-10">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    {mediaType === 'image' ? <ImageIcon className="text-orange-500" /> : <Film className="text-orange-500" />}
                    Upload {mediaType === 'image' ? 'Photo' : mediaType === 'video' ? 'Video' : 'Media'}
                </h2>
                <button
                    onClick={onCancel}
                    className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="p-6">
                {!selectedFile ? (
                    /* File Selection */
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${isDragging ? 'border-orange-500 bg-orange-50' : 'border-stone-300 hover:border-orange-400 hover:bg-stone-50'
                            }`}
                    >
                        <Upload size={48} className="mx-auto mb-4 text-stone-400" />
                        <p className="text-lg font-medium text-stone-700 mb-2">
                            Drop photo or video here, or click to browse
                        </p>
                        <p className="text-sm text-stone-500">
                            Photos: JPEG, PNG, WebP, HEIC (max 20MB)
                        </p>
                        <p className="text-sm text-stone-500">
                            Videos: MP4, WebM, MOV (max 100MB)
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept="image/*,video/*"
                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                        />
                    </div>
                ) : (
                    /* Media Preview & Upload Form */
                    <div className="space-y-6">
                        {/* Preview */}
                        <div className="relative rounded-xl overflow-hidden bg-stone-100">
                            {preview && (
                                <>
                                    {mediaType === 'image' ? (
                                        <img src={preview} alt="Preview" className="w-full h-auto max-h-96 object-contain" />
                                    ) : (
                                        <video src={preview} controls className="w-full h-auto max-h-96 object-contain" />
                                    )}
                                </>
                            )}
                            <button
                                onClick={() => {
                                    setSelectedFile(null);
                                    setPreview(null);
                                    setMediaType(null);
                                    setCaption('');
                                    setTitle('');
                                    setDescription('');
                                    setVideoTags('');
                                }}
                                className="absolute top-3 right-3 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* File Info */}
                        <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                            <div>
                                <p className="font-medium">{selectedFile.name}</p>
                                <p className="text-sm text-stone-500">
                                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {mediaType}
                                </p>
                            </div>
                            {mediaType === 'image' ? (
                                <ImageIcon className="text-orange-500" size={24} />
                            ) : (
                                <Film className="text-orange-500" size={24} />
                            )}
                        </div>

                        {/* Form Fields */}
                        {mediaType === 'image' ? (
                            /* Photo Fields */
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Caption</label>
                                    <input
                                        type="text"
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                        className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        placeholder="Add a caption..."
                                    />
                                </div>
                            </div>
                        ) : (
                            /* Video Fields */
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Title *</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        placeholder="Enter video title"
                                        maxLength={100}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Description</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 h-24 resize-none"
                                        placeholder="Enter video description"
                                        maxLength={500}
                                    />
                                    <p className="text-xs text-stone-400 mt-1">{description.length}/500</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Tags (comma separated)</label>
                                    <input
                                        type="text"
                                        value={videoTags}
                                        onChange={(e) => setVideoTags(e.target.value)}
                                        className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        placeholder="tag1, tag2, tag3"
                                    />
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isPublic}
                                        onChange={(e) => setIsPublic(e.target.checked)}
                                        className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm">Make video public</span>
                                </label>
                            </div>
                        )}

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
                            </div>
                        )}

                        {/* Upload Button */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setSelectedFile(null);
                                    setPreview(null);
                                    setMediaType(null);
                                }}
                                disabled={isUploading}
                                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl hover:bg-stone-200 transition-colors font-medium disabled:opacity-50"
                            >
                                Change File
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={isUploading || (mediaType === 'video' && !title.trim())}
                                className="flex-1 px-4 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-medium disabled:bg-stone-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isUploading ? (
                                    <>
                                        <Loader size={20} className="animate-spin" />
                                        <span>Uploading...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check size={20} />
                                        <span>Upload {mediaType === 'image' ? 'Photo' : 'Video'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
