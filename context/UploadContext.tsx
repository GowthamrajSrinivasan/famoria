import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Post } from '../types';
import * as imageUtils from '../lib/imageUtils';
import * as keyModule from '../lib/crypto/photoKey';
import * as cryptoModule from '../lib/crypto/photoCrypto';
import { storageService } from '../services/storageService';
import { photoService } from '../services/photoService';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UploadTask {
    id: string;
    file: File;
    photoId: string;
    albumId: string;
    thumbnailUrl: string; // local blob URL for immediate display
    status: 'encrypting' | 'uploading-thumbnail' | 'uploading-full' | 'complete' | 'failed';
    progress: number; // 0-100
    error?: string;
    postId?: string;
    caption: string;
    tags: string[];
    date?: string;
    location?: string;
}

interface UploadContextType {
    tasks: UploadTask[];
    addUploads: (files: File[], albumId: string, albumKey: Uint8Array, metadata: { caption: string; tags: string[]; date?: string; location?: string }, user: any) => Promise<void>;
    cancelUpload: (taskId: string) => void;
    retryUpload: (taskId: string) => void;
    clearCompleted: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUpload = () => {
    const context = useContext(UploadContext);
    if (!context) {
        throw new Error('useUpload must be used within UploadProvider');
    }
    return context;
};

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tasks, setTasks] = useState<UploadTask[]>([]);

    const processUpload = useCallback(async (task: UploadTask, albumKey: Uint8Array, user: any) => {
        console.log(`[Upload] 🚀 Starting background upload for ${task.id}`);

        try {
            // Phase 1: Encrypt and upload thumbnail (fast)
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'encrypting', progress: 10 } : t));

            const thumbnail: Blob = await imageUtils.generateThumbnail(task.file, 400, 0.8);
            const photoKey = await keyModule.derivePhotoKey(albumKey, task.photoId);

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 20 } : t));

            // Encrypt thumbnail
            const thumbnailFile = new File([thumbnail], 'thumbnail.webp', { type: 'image/webp' });
            const encryptedThumbnail = await cryptoModule.encryptFile(thumbnailFile, photoKey);

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'uploading-thumbnail', progress: 30 } : t));

            // Upload thumbnail
            const fileName = `${Date.now()}_${task.photoId}.enc`;
            const storagePath = `albums/${task.albumId}/photos/${fileName}`;
            const thumbnailPath = storageService.getThumbnailPath(storagePath);

            await storageService.uploadWithCaching(encryptedThumbnail, thumbnailPath);

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 40 } : t));

            // Encrypt metadata
            const metadata = {
                caption: task.caption,
                tags: task.tags,
                date: task.date || new Date().toISOString(),
                location: task.location || "",
                author: user.name,
                authorId: user.id
            };
            const encMeta = await cryptoModule.encryptMetadata(metadata, photoKey);

            // Create post with thumbnail only
            const encryptedPhotoRecord = {
                id: task.photoId,
                albumId: task.albumId,
                version: 1,
                createdAt: Date.now(),
                encryptedPath: '', // Will be filled after full upload
                thumbnailPath: thumbnailPath,
                encryptedMetadata: encMeta.encrypted,
                metadataIv: encMeta.iv,
                metadataAuthTag: encMeta.authTag,
                photoIv: encMeta.photoIv || "",
                authorId: user.id
            };

            const postData: Omit<Post, 'id'> = {
                albumId: task.albumId,
                caption: task.caption,
                tags: task.tags,
                date: task.date ? new Date(task.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                location: task.location || "",
                author: user.name,
                authorId: user.id,
                photoIds: [],
                coverPhotoId: '',
                createdAt: Date.now(),
                isEncrypted: true,
                likes: [],
                commentsCount: 0,
                uploadStatus: 'uploading' // New field to track upload state
            };

            const createdPost = await photoService.createPost(postData);
            const savedPhotos = await photoService.addPhotosToPost(task.albumId, createdPost.id, [encryptedPhotoRecord]);

            const uploadedPhotoIds = savedPhotos.map(p => p.id);
            const actualPhotoDocId = savedPhotos[0]?.id; // Get the actual Firestore document ID

            const postRef = doc(db, 'posts', createdPost.id);
            await updateDoc(postRef, {
                photoIds: uploadedPhotoIds,
                coverPhotoId: uploadedPhotoIds[0]
            });

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, postId: createdPost.id, progress: 50 } : t));

            console.log(`[Upload] ✅ Thumbnail uploaded, post created: ${createdPost.id}, photo doc: ${actualPhotoDocId}`);

            // Phase 2: Encrypt and upload full image (slow, background)
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'uploading-full', progress: 60 } : t));

            const encryptedFile = await cryptoModule.encryptFile(task.file, photoKey);

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 70 } : t));

            await storageService.uploadWithCaching(encryptedFile, storagePath);

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 90 } : t));

            // Update photo record with full image path using the actual document ID
            if (actualPhotoDocId) {
                const photoDocRef = doc(db, 'albums', task.albumId, 'photos', actualPhotoDocId);
                await updateDoc(photoDocRef, {
                    encryptedPath: storagePath
                });
            }

            // Update post to remove uploading status
            await updateDoc(postRef, {
                uploadStatus: 'complete'
            });

            // Update album photo count
            const albumRef = doc(db, 'albums', task.albumId);
            await updateDoc(albumRef, {
                photoCount: increment(1),
                updatedAt: Date.now()
            });

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'complete', progress: 100 } : t));

            console.log(`[Upload] 🎉 Full image uploaded and complete: ${task.id}`);

        } catch (error: any) {
            console.error(`[Upload] ❌ Upload failed for ${task.id}:`, error);
            setTasks(prev => prev.map(t => t.id === task.id ? {
                ...t,
                status: 'failed',
                error: error.message || 'Upload failed'
            } : t));
        }
    }, []);

    const addUploads = useCallback(async (
        files: File[],
        albumId: string,
        albumKey: Uint8Array,
        metadata: { caption: string; tags: string[]; date?: string; location?: string },
        user: any
    ) => {
        console.log(`[Upload] 📋 Queueing ${files.length} uploads`);

        // Create tasks with local preview URLs
        const newTasks: UploadTask[] = await Promise.all(
            files.map(async (file, index) => {
                const photoId = crypto.randomUUID();
                const thumbnailUrl = URL.createObjectURL(file); // Use original file for preview

                return {
                    id: `upload-${Date.now()}-${index}`,
                    file,
                    photoId,
                    albumId,
                    thumbnailUrl,
                    status: 'encrypting' as const,
                    progress: 0,
                    caption: index === 0 ? metadata.caption : '',
                    tags: metadata.tags,
                    date: metadata.date,
                    location: metadata.location
                };
            })
        );

        setTasks(prev => [...prev, ...newTasks]);

        // Process uploads in parallel (with concurrency limit)
        const processWithLimit = async () => {
            const concurrency = 3;
            for (let i = 0; i < newTasks.length; i += concurrency) {
                const batch = newTasks.slice(i, i + concurrency);
                await Promise.all(
                    batch.map(task => processUpload(task, albumKey, user))
                );
            }
        };

        processWithLimit();
    }, [processUpload]);

    const cancelUpload = useCallback((taskId: string) => {
        console.log(`[Upload] 🚫 Cancelling upload ${taskId}`);
        setTasks(prev => prev.filter(t => t.id !== taskId));
    }, []);

    const retryUpload = useCallback((taskId: string) => {
        console.log(`[Upload] 🔄 Retrying upload ${taskId}`);
        setTasks(prev => prev.map(t =>
            t.id === taskId
                ? { ...t, status: 'encrypting', progress: 0, error: undefined }
                : t
        ));
        // Re-process the upload
        // TODO: Implement retry logic
    }, []);

    const clearCompleted = useCallback(() => {
        setTasks(prev => prev.filter(t => t.status !== 'complete'));
    }, []);

    return (
        <UploadContext.Provider value={{ tasks, addUploads, cancelUpload, retryUpload, clearCompleted }}>
            {children}
        </UploadContext.Provider>
    );
};
