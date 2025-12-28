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
    increment,
    getDocs
} from 'firebase/firestore';
import {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from 'firebase/storage';
import { Video, VideoUploadProgress } from '../types';

const VIDEOS_COLLECTION = 'videos';
const VIDEO_COMMENTS_COLLECTION = 'video_comments';

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
                    (error: any) => {
                        // Silently handle permission errors
                        if (error?.code !== 'storage/unauthorized' && !error?.message?.includes('permission')) {
                            console.error('Video upload error:', error);
                        }

                        onProgress?.({
                            fileName: file.name,
                            progress: 0,
                            status: 'error',
                            error: error?.code === 'storage/unauthorized' ? 'Permission denied' : error.message
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
                                ...(metadata.albumId && { albumId: metadata.albumId }), // Only include if defined
                                isProcessing: false,
                                isPublic: metadata.isPublic ?? true,
                                createdAt: Timestamp.now(),
                                updatedAt: Timestamp.now()
                            };

                            const docRef = await addDoc(collection(db, VIDEOS_COLLECTION), videoData);

                            // Increment album video count if video belongs to an album
                            if (metadata.albumId) {
                                try {
                                    const { incrementVideoCount } = await import('./albumService');
                                    await incrementVideoCount(metadata.albumId);
                                } catch (error) {
                                    console.error('Failed to increment album video count:', error);
                                }
                            }

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
        }, (error: any) => {
            // Silently handle permission errors
            if (!error?.message?.includes('permission') && error?.code !== 'permission-denied') {
                console.warn('Error fetching videos:', error);
            }
            callback([]);
        });
    },

    /**
     * Get a single video by ID
     */
    getVideo: async (videoId: string): Promise<Video | null> => {
        try {
            const videosQuery = query(
                collection(db, VIDEOS_COLLECTION),
                where('__name__', '==', videoId)
            );
            const snapshot = await getDocs(videosQuery);

            if (snapshot.empty) return null;

            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() } as Video;
        } catch (error) {
            console.warn('Error getting video:', error);
            return null;
        }
    },

    /**
     * Delete video
     */
    deleteVideo: async (videoId: string, userId: string): Promise<void> => {
        // Get video data first to check if it belongs to an album
        const video = await videoService.getVideo(videoId);
        const albumId = video?.albumId;

        const videoRef = doc(db, VIDEOS_COLLECTION, videoId);

        // Delete from Storage
        try {
            const storageRef = ref(storage, `videos/${userId}/${videoId}`);
            await deleteObject(storageRef);
        } catch (e) {
            console.warn('Storage deletion failed:', e);
        }

        // Delete thumbnail
        try {
            const thumbRef = ref(storage, `videos/${userId}/${videoId}_thumb.jpg`);
            await deleteObject(thumbRef);
        } catch (e) {
            // Thumbnail might not exist
        }

        // Delete from Firestore
        await deleteDoc(videoRef);

        // Decrement album video count if video belonged to an album
        if (albumId) {
            try {
                const { decrementVideoCount } = await import('./albumService');
                await decrementVideoCount(albumId);
            } catch (error) {
                console.error('Failed to decrement album video count:', error);
            }
        }
    },

    /**
     * Toggle video like
     */
    toggleLike: async (videoId: string, userId: string): Promise<void> => {
        const videoRef = doc(db, VIDEOS_COLLECTION, videoId);
        const video = await videoService.getVideo(videoId);

        if (!video) throw new Error('Video not found');

        const likes = video.likes || [];
        const isLiked = likes.includes(userId);

        const updatedLikes = isLiked
            ? likes.filter(id => id !== userId)
            : [...likes, userId];

        await updateDoc(videoRef, {
            likes: updatedLikes
        });
    },

    /**
     * Increment view count
     */
    incrementViews: async (videoId: string): Promise<void> => {
        const videoRef = doc(db, VIDEOS_COLLECTION, videoId);
        await updateDoc(videoRef, {
            viewsCount: increment(1)
        });
    },

    /**
     * Update video details
     */
    updateVideo: async (
        videoId: string,
        updates: Partial<Pick<Video, 'title' | 'description' | 'tags' | 'isPublic'>>
    ): Promise<void> => {
        const videoRef = doc(db, VIDEOS_COLLECTION, videoId);
        await updateDoc(videoRef, {
            ...updates,
            updatedAt: Timestamp.now()
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
        video.load();
    });
}
