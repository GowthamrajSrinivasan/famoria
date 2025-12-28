# Video Upload Implementation Plan
**Famoria - Video Feature Implementation**

---

## 📋 **Table of Contents**
1. [Overview](#overview)
2. [Phase 1: Backend Setup](#phase-1-backend-setup)
3. [Phase 2: Video Upload Service](#phase-2-video-upload-service)
4. [Phase 3: Video Player Component](#phase-3-video-player-component)
5. [Phase 4: Video Card & Grid](#phase-4-video-card--grid)
6. [Phase 5: Video Albums](#phase-5-video-albums)
7. [Phase 6: Video Interactions](#phase-6-video-interactions)
8. [Phase 7: Advanced Features](#phase-7-advanced-features)
9. [Testing & Optimization](#testing--optimization)
10. [Deployment Checklist](#deployment-checklist)

---

## 🎯 **Overview**

### **Goal**
Implement full video upload, storage, display, and interaction features similar to existing photo functionality.

### **Key Features**
- ✅ Video upload with progress tracking
- ✅ Video player with controls
- ✅ Video thumbnails/previews
- ✅ Video metadata (duration, size, format)
- ✅ Video likes, comments, sharing
- ✅ Video albums and collections
- ✅ Video compression and optimization
- ✅ Video search and filtering

### **Technology Stack**
- **Storage**: Firebase Storage
- **Database**: Firestore
- **Player**: HTML5 Video API / react-player
- **Upload**: Firebase Storage SDK
- **Compression**: Browser-based or Cloud Functions
- **Thumbnails**: Canvas API / FFmpeg

---

## 🔧 **Phase 1: Backend Setup**

### **1.1 Firestore Schema**

#### **Videos Collection**
```typescript
interface Video {
  id: string;
  url: string;                    // Firebase Storage URL
  thumbnailUrl?: string;          // Thumbnail image URL
  title: string;
  description?: string;
  tags: string[];
  
  // Metadata
  duration: number;               // in seconds
  size: number;                   // in bytes
  format: string;                 // 'mp4', 'webm', 'mov'
  resolution: string;             // '1920x1080', '1280x720'
  aspectRatio: string;            // '16:9', '9:16', '1:1'
  
  // Upload info
  uploadedBy: string;             // User ID
  author: string;                 // User name
  uploadDate: Timestamp;
  
  // Interactions
  likes: string[];                // Array of user IDs
  commentsCount: number;
  viewsCount: number;
  
  // Organization
  albumId?: string;               // Optional album reference
  isProcessing: boolean;          // Video processing status
  processingError?: string;
  
  // Privacy
  isPublic: boolean;
  allowedUsers?: string[];        // For private videos
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### **Video Comments Collection**
```typescript
// Similar structure to photo comments
interface VideoComment {
  id: string;
  videoId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  likes: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
```

### **1.2 Firebase Storage Structure**
```
/videos/
  /{userId}/
    /{videoId}.mp4          # Original video
    /{videoId}_thumb.jpg    # Thumbnail
    /{videoId}_compressed.mp4  # Compressed version (optional)
```

### **1.3 Firestore Security Rules**
```javascript
// Add to firestore.rules
match /videos/{videoId} {
  // Anyone can read public videos
  allow read: if request.auth != null && 
                 (resource.data.isPublic == true ||
                  request.auth.uid == resource.data.uploadedBy ||
                  request.auth.uid in resource.data.allowedUsers);
  
  // Only authenticated users can create videos
  allow create: if request.auth != null &&
                   request.auth.uid == request.resource.data.uploadedBy;
  
  // Only video owner can update or delete
  allow update, delete: if request.auth != null &&
                           request.auth.uid == resource.data.uploadedBy;
}

match /video_comments/{commentId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null &&
                   request.auth.uid == request.resource.data.userId;
  allow update, delete: if request.auth != null &&
                           request.auth.uid == resource.data.userId;
}
```

### **1.4 Storage Security Rules**
```javascript
// Add to storage.rules
service firebase.storage {
  match /b/{bucket}/o {
    match /videos/{userId}/{videoId} {
      // Allow authenticated users to upload
      allow write: if request.auth != null && 
                      request.auth.uid == userId &&
                      request.resource.size < 100 * 1024 * 1024; // 100MB limit
      
      // Allow anyone to read (assuming video metadata controls access)
      allow read: if request.auth != null;
    }
  }
}
```

---

## 📤 **Phase 2: Video Upload Service**

### **2.1 Create Video Types**
**File**: `types.ts`
```typescript
export interface Video {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title: string;
  description?: string;
  tags: string[];
  duration: number;
  size: number;
  format: string;
  resolution: string;
  aspectRatio: string;
  uploadedBy: string;
  author: string;
  uploadDate: any;
  likes: string[];
  commentsCount: number;
  viewsCount: number;
  albumId?: string;
  isProcessing: boolean;
  processingError?: string;
  isPublic: boolean;
  allowedUsers?: string[];
  createdAt: any;
  updatedAt: any;
}

export interface VideoUploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}
```

### **2.2 Create Video Service**
**File**: `services/videoService.ts`
```typescript
import { db, storage } from '../lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  increment
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { Video, VideoUploadProgress } from '../types';

const VIDEOS_COLLECTION = 'videos';

export const videoService = {
  /**
   * Upload video to Firebase Storage and create Firestore document
   */
  uploadVideo: async (
    file: File,
    metadata: {
      title: string;
      description?: string;
      tags?: string[];
      albumId?: string;
      isPublic?: boolean;
    },
    userId: string,
    userName: string,
    onProgress?: (progress: VideoUploadProgress) => void
  ): Promise<string> => {
    try {
      // Validate file
      if (!file.type.startsWith('video/')) {
        throw new Error('File must be a video');
      }

      // Size limit: 100MB
      if (file.size > 100 * 1024 * 1024) {
        throw new Error('Video size must be less than 100MB');
      }

      // Generate unique ID
      const videoId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get video metadata
      const videoMetadata = await getVideoMetadata(file);
      
      // Upload to Storage
      const storageRef = ref(storage, `videos/${userId}/${videoId}.${videoMetadata.format}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            onProgress?.({
              fileName: file.name,
              progress,
              status: 'uploading'
            });
          },
          (error) => {
            onProgress?.({
              fileName: file.name,
              progress: 0,
              status: 'error',
              error: error.message
            });
            reject(error);
          },
          async () => {
            try {
              // Get download URL
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Generate thumbnail
              onProgress?.({
                fileName: file.name,
                progress: 95,
                status: 'processing'
              });
              
              const thumbnailUrl = await generateThumbnail(file, userId, videoId);
              
              // Create Firestore document
              const videoData: Omit<Video, 'id'> = {
                url,
                thumbnailUrl,
                title: metadata.title,
                description: metadata.description || '',
                tags: metadata.tags || [],
                duration: videoMetadata.duration,
                size: file.size,
                format: videoMetadata.format,
                resolution: videoMetadata.resolution,
                aspectRatio: videoMetadata.aspectRatio,
                uploadedBy: userId,
                author: userName,
                uploadDate: Timestamp.now(),
                likes: [],
                commentsCount: 0,
                viewsCount: 0,
                albumId: metadata.albumId,
                isProcessing: false,
                isPublic: metadata.isPublic ?? true,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
              };

              const docRef = await addDoc(collection(db, VIDEOS_COLLECTION), videoData);
              
              onProgress?.({
                fileName: file.name,
                progress: 100,
                status: 'complete'
              });
              
              resolve(docRef.id);
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Subscribe to videos feed
   */
  subscribeToVideos: (callback: (videos: Video[]) => void, albumId?: string) => {
    let q = query(
      collection(db, VIDEOS_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    if (albumId) {
      q = query(
        collection(db, VIDEOS_COLLECTION),
        where('albumId', '==', albumId),
        orderBy('createdAt', 'desc')
      );
    }

    return onSnapshot(q, (snapshot) => {
      const videos: Video[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Video));
      callback(videos);
    });
  },

  /**
   * Delete video
   */
  deleteVideo: async (videoId: string, userId: string): Promise<void> => {
    const videoRef = doc(db, VIDEOS_COLLECTION, videoId);
    
    // Delete from Storage
    const storageRef = ref(storage, `videos/${userId}/${videoId}`);
    await deleteObject(storageRef);
    
    // Delete thumbnail
    const thumbRef = ref(storage, `videos/${userId}/${videoId}_thumb.jpg`);
    try {
      await deleteObject(thumbRef);
    } catch (e) {
      // Thumbnail might not exist
    }
    
    // Delete from Firestore
    await deleteDoc(videoRef);
  },

  /**
   * Increment view count
   */
  incrementViews: async (videoId: string): Promise<void> => {
    const videoRef = doc(db, VIDEOS_COLLECTION, videoId);
    await updateDoc(videoRef, {
      viewsCount: increment(1)
    });
  }
};

/**
 * Helper: Get video metadata
 */
async function getVideoMetadata(file: File): Promise<{
  duration: number;
  format: string;
  resolution: string;
  aspectRatio: string;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      
      const duration = Math.floor(video.duration);
      const width = video.videoWidth;
      const height = video.videoHeight;
      const format = file.type.split('/')[1] || 'mp4';
      
      // Calculate aspect ratio
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(width, height);
      const aspectRatio = `${width / divisor}:${height / divisor}`;
      
      resolve({
        duration,
        format,
        resolution: `${width}x${height}`,
        aspectRatio
      });
    };

    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Helper: Generate thumbnail from video
 */
async function generateThumbnail(
  file: File,
  userId: string,
  videoId: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    video.onloadeddata = () => {
      // Seek to 1 second or 10% of video
      video.currentTime = Math.min(1, video.duration * 0.1);
    };

    video.onseeked = async () => {
      // Set canvas size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Failed to generate thumbnail'));
          return;
        }

        try {
          // Upload thumbnail
          const thumbRef = ref(storage, `videos/${userId}/${videoId}_thumb.jpg`);
          await uploadBytesResumable(thumbRef, blob);
          const thumbUrl = await getDownloadURL(thumbRef);
          
          resolve(thumbUrl);
        } catch (error) {
          reject(error);
        }
      }, 'image/jpeg', 0.8);
    };

    video.onerror = () => {
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.src = URL.createObjectURL(file);
  });
}
```

### **2.3 Create Video Uploader Component**
**File**: `components/VideoUploader.tsx`
```typescript
import React, { useState } from 'react';
import { Upload, Video as VideoIcon, X } from 'lucide-react';
import { videoService } from '../services/videoService';
import { VideoUploadProgress } from '../types';
import { User } from '../types';

interface VideoUploaderProps {
  currentUser: User;
  albumId?: string;
  onUploadComplete?: (videoId: string) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  currentUser,
  albumId,
  onUploadComplete
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
      setSelectedFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
    } else {
      alert('Please select a video file');
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
    } catch (error: any) {
      alert('Failed to upload video: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <VideoIcon className="text-orange-500" />
        Upload Video
      </h2>

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
              className="p-2 hover:bg-stone-200 rounded-full transition-colors"
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
                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="Enter video title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isUploading}
                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 h-24"
                placeholder="Enter video description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                disabled={isUploading}
                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="tag1, tag2, tag3"
              />
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isUploading}
                className="w-4 h-4"
              />
              <span className="text-sm">Make video public</span>
            </label>
          </div>

          {/* Upload Progress */}
          {uploadProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{uploadProgress.status}</span>
                <span>{uploadProgress.progress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-stone-200 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={isUploading || !title.trim()}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-300 text-white font-semibold rounded-lg transition-colors"
          >
            {isUploading ? 'Uploading...' : 'Upload Video'}
          </button>
        </div>
      )}
    </div>
  );
};
```

---

## 🎬 **Phase 3: Video Player Component**

### **3.1 Create Video Player**
**File**: `components/VideoPlayer.tsx`
```typescript
import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';

interface VideoPlayerProps {
  videoUrl: string;
  thumbnailUrl?: string;
  title: string;
  onPlay?: () => void;
  autoPlay?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  thumbnailUrl,
  title,
  onPlay,
  autoPlay = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateProgress = () => {
      setCurrentTime(video.currentTime);
      setProgress((video.currentTime / video.duration) * 100);
    };

    const updateDuration = () => {
      setDuration(video.duration);
    };

    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('loadedmetadata', updateDuration);

    return () => {
      video.removeEventListener('timeupdate', updateProgress);
      video.removeEventListener('loadedmetadata', updateDuration);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
      onPlay?.();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = (parseFloat(e.target.value) / 100) * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress(parseFloat(e.target.value));
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="relative bg-black rounded-xl overflow-hidden group"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(isPlaying ? false : true)}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={thumbnailUrl}
        className="w-full h-full object-contain"
        autoPlay={autoPlay}
        onClick={togglePlay}
      />

      {/* Play/Pause Overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={togglePlay}
            className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-all"
          >
            <Play size={40} className="text-white ml-2" fill="white" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Progress Bar */}
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleProgressChange}
          className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer mb-3"
        />

        <div className="flex items-center justify-between">
          {/* Left Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="text-white hover:text-orange-400 transition-colors"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <button
              onClick={toggleMute}
              className="text-white hover:text-orange-400 transition-colors"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer"
            />

            <span className="text-white text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-orange-400 transition-colors"
            >
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## 📱 **Phase 4: Video Card & Grid**

### **4.1 Create Video Card Component**
**File**: `components/VideoCard.tsx`
```typescript
import React from 'react';
import { Video, User } from '../types';
import { Heart, MessageCircle, Play, Trash2 } from 'lucide-react';

interface VideoCardProps {
  video: Video;
  currentUser: User | null;
  onClick: () => void;
  onDelete?: (videoId: string) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  currentUser,
  onClick,
  onDelete
}) => {
  const isOwner = currentUser?.id === video.uploadedBy;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatViews = (views: number) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views.toString();
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer">
      {/* Thumbnail with Play Button */}
      <div className="relative aspect-video bg-stone-200" onClick={onClick}>
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play size={48} className="text-stone-400" />
          </div>
        )}

        {/* Play Overlay */}
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <div className="w-16 h-16 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
            <Play size={32} className="text-white ml-1" fill="white" />
          </div>
        </div>

        {/* Duration Badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold">
          {formatDuration(video.duration)}
        </div>

        {/* Delete Button (Owner Only) */}
        {isOwner && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this video?')) {
                onDelete(video.id);
              }
            }}
            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Video Info */}
      <div className="p-4">
        <h3 className="font-semibold text-stone-800 line-clamp-2 mb-2">
          {video.title}
        </h3>
        
        <p className="text-sm text-stone-500 mb-3">{video.author}</p>

        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>{formatViews(video.viewsCount)} views</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Heart size={14} />
              {video.likes.length}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle size={14} />
              {video.commentsCount}
            </span>
          </div>
        </div>

        {/* Tags */}
        {video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {video.tags.slice(0, 3).map((tag, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 bg-stone-100 text-stone-600 rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

### **4.2 Create Video Grid**
**File**: `components/VideoGrid.tsx`
```typescript
import React, { useEffect, useState } from 'react';
import { VideoCard } from './VideoCard';
import { VideoPlayer } from './VideoPlayer';
import { videoService } from '../services/videoService';
import { Video, User } from '../types';
import { X } from 'lucide-react';

interface VideoGridProps {
  currentUser: User | null;
  albumId?: string;
}

export const VideoGrid: React.FC<VideoGridProps> = ({ currentUser, albumId }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

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
    const video = videos.find(v => v.id === videoId);
    if (!video || !currentUser) return;

    try {
      await videoService.deleteVideo(videoId, currentUser.id);
    } catch (error) {
      alert('Failed to delete video');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading videos...</div>;
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-20 text-stone-500">
        <p>No videos yet</p>
      </div>
    );
  }

  return (
    <>
      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            currentUser={currentUser}
            onClick={() => handleVideoClick(video)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Video Lightbox */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
          <button
            onClick={() => setSelectedVideo(null)}
            className="absolute top-4 right-4 text-white hover:text-orange-400 p-2"
          >
            <X size={32} />
          </button>

          <div className="w-full max-w-6xl">
            <VideoPlayer
              videoUrl={selectedVideo.url}
              thumbnailUrl={selectedVideo.thumbnailUrl}
              title={selectedVideo.title}
              autoPlay
            />
            
            <div className="mt-4 text-white">
              <h2 className="text-2xl font-bold mb-2">{selectedVideo.title}</h2>
              <p className="text-stone-300">{selectedVideo.description}</p>
              
              <div className="mt-4 flex items-center gap-4 text-sm">
                <span>{selectedVideo.author}</span>
                <span>•</span>
                <span>{selectedVideo.viewsCount} views</span>
                <span>•</span>
                <span>{selectedVideo.likes.length} likes</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
```

---

## 📁 **Phase 5: Video Albums**

### **5.1 Extend Album Types**
```typescript
// Update types.ts
export interface Album {
  // ... existing fields
  videoCount?: number;         // Add video count
  contentType?: 'photos' | 'videos' | 'mixed';  // Album type
}
```

### **5.2 Update Album Service**
Add functions to handle video counts and mixed content in `albumService.ts`.

---

## ❤️ **Phase 6: Video Interactions**

### **6.1 Video Likes**
- Reuse existing `LikeButton` component
- Update to support both photos and videos

### **6.2 Video Comments**
- Reuse `CommentSection` component
- Pass `videoId` instead of `photoId`

### **6.3 Video Sharing**
- Add share button with URL copying
- Social media integration (optional)

---

## 🚀 **Phase 7: Advanced Features**

### **7.1 Video Compression** (Optional)
- Use Cloud Functions to compress large videos
- Generate multiple quality versions (360p, 720p, 1080p)

### **7.2 Live Streaming** (Future)
- Integrate YouTube/Twitch live streaming
- Real-time video chat

### **7.3 Video Editing** (Future)
- Basic trim/cut functionality
- Filters and effects
- Text overlays

---

## ✅ **Testing & Optimization**

### **Testing Checklist**
- [ ] Video upload (small files < 10MB)
- [ ] Video upload (large files 50-100MB)
- [ ] Video upload (multiple formats: MP4, WebM, MOV)
- [ ] Video playback on desktop
- [ ] Video playback on mobile
- [ ] Video playback in different browsers
- [ ] Thumbnail generation
- [ ] Progress tracking
- [ ] Error handling
- [ ] Video deletion
- [ ] Video likes/comments
- [ ] Video albums
- [ ] Video search/filter

### **Performance Optimization**
- Lazy load videos
- Use video thumbnails for grid
- Implement video pagination
- Cache video metadata
- Compress videos server-side

### **Security Checks**
- Validate file types
- Enforce size limits
- Check user authentication
- Verify upload permissions
- Sanitize video metadata

---

## 📦 **Deployment Checklist**

### **Before Deployment**
- [ ] Update Firestore rules
- [ ] Update Storage rules
- [ ] Test all upload scenarios
- [ ] Test on different devices
- [ ] Check browser compatibility
- [ ] Verify error handling
- [ ] Test deletion workflow
- [ ] Check performance metrics

### **Deploy Commands**
```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules
firebase deploy --only storage

# Build frontend
npm run build

# Deploy to hosting (if using Firebase Hosting)
firebase deploy --only hosting
```

### **Post-Deployment**
- [ ] Monitor upload success rates
- [ ] Track video load times
- [ ] Check error logs
- [ ] Gather user feedback
- [ ] Plan next features

---

## 📊 **Success Metrics**

- **Upload Success Rate**: > 95%
- **Average Upload Time**: < 30 seconds for 50MB video
- **Playback Start Time**: < 2 seconds
- **User Engagement**: Increased video views and interactions
- **Error Rate**: < 2%

---

## 🎉 **Conclusion**

This implementation plan provides a complete roadmap for adding video functionality to Famoria. Start with Phase 1-3 for basic video upload and playback, then progressively add more features in later phases.

**Estimated Timeline:**
- Phase 1-2: 2-3 days (Backend + Upload)
- Phase 3-4: 2-3 days (Player + UI)
- Phase 5-6: 1-2 days (Albums + Interactions)
- Phase 7: 3-5 days (Advanced Features)
- Testing: 2-3 days

**Total: ~2 weeks for full implementation**

Good luck! 🚀
