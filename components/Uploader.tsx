import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Image as ImageIcon, Sparkles, Check, Wand2, ChevronDown, GripVertical, Trash2, Plus } from 'lucide-react';
import { Button } from './Button';
import { analyzeImage, analyzeMultipleImages } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { photoService } from '../services/photoService';
import { subscribeToAlbums } from '../services/albumService';
import { Photo, Album, Post } from '../types';
import { useAuth } from '../context/AuthContext';
import { VaultUnlockModal } from './VaultUnlockModal';

interface UploaderProps {
  onUploadComplete: (post: Post) => void; // Changed to Post
  onCancel: () => void;
  currentAlbumId?: string;
}

// Multi-image upload constants
const MAX_IMAGES_PER_POST = 10;

// Image validation constants for family photos
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB (accommodates DSLR JPEGs)
const ALLOWED_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp'
];

const FORMAT_NAMES: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/png': 'PNG',
  'image/heic': 'HEIC (iPhone)',
  'image/heif': 'HEIF (iPhone)',
  'image/webp': 'WebP'
};

interface ValidationError {
  title: string;
  message: string;
  suggestion: string;
}

export const Uploader: React.FC<UploaderProps> = ({ onUploadComplete, onCancel, currentAlbumId }) => {
  const { user, getAlbumKey, unlockAlbum, googleAccessToken, refreshDriveToken } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]); // Changed to array
  const [previews, setPreviews] = useState<string[]>([]); // Array of preview URLs
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>(''); // "2/5 photos uploaded"
  const [analysis, setAnalysis] = useState<{ caption: string; tags: string[]; album: string } | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Album Selection State
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(currentAlbumId || '');

  // Inline Album Creation State
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumDescription, setNewAlbumDescription] = useState('');
  const [newAlbumPrivacy, setNewAlbumPrivacy] = useState<'private' | 'family' | 'public'>('family');
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);

  // Unlock State
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToAlbums(user.id, (fetchedAlbums) => {
      setAlbums(fetchedAlbums);
      // If no album is selected and we have albums, maybe default to the first one?
      // Or if currentAlbumId was invalid, reset it.
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (currentAlbumId) setSelectedAlbumId(currentAlbumId);
  }, [currentAlbumId]);

  const validateFile = (file: File): ValidationError | null => {
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      return {
        title: 'Not an Image File',
        message: `The file "${file.name}" is not an image.`,
        suggestion: 'Please select a photo file (JPEG, PNG, or HEIC from your camera).'
      };
    }

    // Check file format
    if (!ALLOWED_FORMATS.includes(file.type.toLowerCase())) {
      const detectedType = file.type || 'Unknown';
      return {
        title: 'Unsupported Image Format',
        message: `${detectedType.replace('image/', '').toUpperCase()} format is not supported.`,
        suggestion: `Please use photos from your phone or camera. Supported formats: JPEG, PNG, HEIC (iPhone photos).`
      };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return {
        title: 'File Too Large',
        message: `This photo is ${sizeMB}MB, which exceeds the 20MB limit.`,
        suggestion: 'Try reducing the image quality in your camera settings, or use a photo editor to compress it.'
      };
    }

    // Check if file is suspiciously small (might be corrupted)
    if (file.size < 1024) {
      return {
        title: 'Invalid Image File',
        message: 'This file appears to be corrupted or incomplete.',
        suggestion: 'Please try selecting a different photo.'
      };
    }

    return null;
  };

  const handleFiles = (files: FileList | File[]) => {
    // Clear any previous errors
    setValidationError(null);

    const filesArray = Array.from(files);

    // Check total count (including existing files)
    if (filesToUpload.length + filesArray.length > MAX_IMAGES_PER_POST) {
      setValidationError({
        title: 'Too Many Images',
        message: `You can upload a maximum of ${MAX_IMAGES_PER_POST} images per post.`,
        suggestion: `You currently have ${filesToUpload.length} image(s). You can add ${MAX_IMAGES_PER_POST - filesToUpload.length} more.`
      });
      return;
    }

    // Validate each file
    for (const file of filesArray) {
      const error = validateFile(file);
      if (error) {
        setValidationError(error);
        return;
      }
    }

    // If all valid, add to state
    const newFiles = [...filesToUpload, ...filesArray];
    setFilesToUpload(newFiles);

    // Generate previews for new files
    filesArray.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setPreviews(prev => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });

    // Clear the file input so the same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Run AI analysis once all files are added
    if (newFiles.length > 0 && !isAnalyzing) {
      setTimeout(() => runAIAnalysis(newFiles), 100);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = filesToUpload.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFilesToUpload(newFiles);
    setPreviews(newPreviews);

    // Re-run analysis if files remain
    if (newFiles.length > 0) {
      runAIAnalysis(newFiles);
    } else {
      setAnalysis(null);
    }
  };

  const runAIAnalysis = async (files: File[]) => {
    setIsAnalyzing(true);
    try {
      if (files.length === 1) {
        // Single image analysis
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result as string;
          const result = await analyzeImage(base64);
          setAnalysis({
            caption: result.caption,
            tags: result.tags,
            album: result.suggestedAlbum
          });
          setIsAnalyzing(false);
        };
        reader.readAsDataURL(files[0]);
      } else {
        // Multi-image analysis
        const base64Array: string[] = [];
        const readPromises = files.map(file => {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
        });

        const allBase64 = await Promise.all(readPromises);
        const result = await analyzeMultipleImages(allBase64);
        setAnalysis({
          caption: result.caption,
          tags: result.tags,
          album: result.suggestedAlbum
        });
        setIsAnalyzing(false);
      }
    } catch (error: any) {
      console.error("Analysis failed", error);
      setValidationError({
        title: 'AI Analysis Failed',
        message: 'Unable to analyze your photos automatically.',
        suggestion: 'The photos will still be uploaded, but you may need to add details manually.'
      });
      setAnalysis({
        caption: files.length > 1 ? 'A beautiful collection of memories' : 'A beautiful family memory',
        tags: ['Family', 'Memory'],
        album: 'General'
      });
      setIsAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleUnlock = (key: Uint8Array) => {
    unlockAlbum(selectedAlbumId, key);
    setShowUnlockModal(false);
    // Optional: Auto-retry upload?
    // For now, let user click "Save" again to be safe/clear.
  };

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim() || !user) {
      setValidationError({
        title: 'Album Name Required',
        message: 'Please enter a name for your new album.',
        suggestion: 'Album names must be between 1 and 50 characters.'
      });
      return;
    }

    setIsCreatingAlbum(true);
    try {
      // 1. Get Google Drive access token
      let token = googleAccessToken;
      if (!token) {
        token = await refreshDriveToken();
        if (!token) throw new Error("Google Drive access required for secure storage.");
      }

      // 2. Generate Master Key (Raw Bytes) - 32 bytes CSPRNG
      const masterKey = crypto.getRandomValues(new Uint8Array(32));
      const masterKeyId = crypto.randomUUID();

      // Helper: Convert to Base64
      const toBase64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));

      // 3. Generate Hardware DeviceKey & Store in IndexedDB
      const { generateAndStoreDeviceKey, wrapMasterKeyForDevice } = await import('@/lib/crypto/deviceKey');
      const deviceKey = await generateAndStoreDeviceKey(masterKeyId);

      // 4. Create TWO versions of MK for Drive:
      const plainMasterKeyB64 = toBase64(masterKey);
      const { encryptedMasterKey, iv, authTag } = await wrapMasterKeyForDevice(masterKey, deviceKey);

      // 5. Construct Drive Blob (V4 Format with BOTH layers)
      const driveBlob = {
        version: 4,
        masterKeyId,
        recoveryKey: plainMasterKeyB64,
        encryptedMasterKey,
        iv,
        authTag,
        createdAt: Date.now()
      };

      // 6. Upload to Drive
      const { uploadDriveAppDataFile } = await import('@/services/driveService');
      const filename = `famoria_album_${masterKeyId}.key`;
      await uploadDriveAppDataFile(filename, JSON.stringify(driveBlob), token!);

      // 7. Create Album in Firestore
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      const albumId = masterKeyId;
      await setDoc(doc(db, 'albums', albumId), {
        id: albumId,
        name: newAlbumName.trim(),
        description: newAlbumDescription.trim(),
        privacy: newAlbumPrivacy,
        createdBy: user.id,
        userId: user.id,
        members: [user.id],
        masterKeyId: masterKeyId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        coverPhoto: null,
        photoCount: 0
      });

      console.log(`[Uploader] Created new album: ${albumId}`);

      // 8. Unlock locally (Add to Keyring)
      unlockAlbum(albumId, masterKey);

      // 9. Select the new album
      setSelectedAlbumId(albumId);

      // 10. Reset inline form
      setShowCreateAlbum(false);
      setNewAlbumName('');
      setNewAlbumDescription('');
      setNewAlbumPrivacy('family');

      // The albums list will update automatically via the subscription
    } catch (error: any) {
      console.error('[Uploader] Failed to create album:', error);
      setValidationError({
        title: 'Album Creation Failed',
        message: error.message || 'Could not create the album.',
        suggestion: 'Please try again or select an existing album.'
      });
    } finally {
      setIsCreatingAlbum(false);
    }
  };



  const handleSave = async () => {
    if (filesToUpload.length === 0 || !analysis || !user || !onUploadComplete) return;
    if (!selectedAlbumId) {
      setValidationError({
        title: 'Album Required',
        message: 'Please select an album to store your photos securely.',
        suggestion: 'Choose an album from the dropdown list.'
      });
      return;
    }

    // 0. Ensure Encryption Context
    const albumKey = getAlbumKey(selectedAlbumId);
    if (!albumKey) {
      setShowUnlockModal(true);
      return;
    }

    setIsUploading(true);
    setUploadProgress('');

    try {
      const albumId = selectedAlbumId;
      console.log(`[Upload] Starting multi-image post upload: ${filesToUpload.length} photos to album ${albumId}`);

      // Import utilities
      const imageUtils = await import('../lib/imageUtils');
      const keyModule = await import('../lib/crypto/photoKey');
      const cryptoModule = await import('../lib/crypto/photoCrypto');

      // Arrays to store photo data
      const photoIds: string[] = [];
      const encryptedPhotoRecords: any[] = [];

      // Process each file
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgress(`${i + 1}/${filesToUpload.length} photos processed...`);

        // 1. Generate unique ID for this photo
        const photoId = crypto.randomUUID();
        photoIds.push(photoId);

        const fileName = `${Date.now()}_${photoId}.enc`;
        const storagePath = `albums/${albumId}/photos/${fileName}`;
        const thumbnailPath = storageService.getThumbnailPath(storagePath);

        console.log(`[Upload] Processing photo ${i + 1}/${filesToUpload.length}: ${photoId}`);

        // 2. Generate Thumbnail
        const thumbnail = await imageUtils.generateThumbnail(file, 400, 0.8);

        // 3. Derive Key & Encrypt
        const photoKey = await keyModule.derivePhotoKey(albumKey, photoId);

        // Encrypt full image
        const encryptedFile = await cryptoModule.encryptFile(file, photoKey);

        // Encrypt thumbnail
        const thumbnailFile = new File([thumbnail], 'thumbnail.webp', { type: 'image/webp' });
        const encryptedThumbnail = await cryptoModule.encryptFile(thumbnailFile, photoKey);

        // 4. Encrypt Metadata (same for all photos in post)
        const metadata = {
          caption: analysis.caption,
          tags: analysis.tags,
          date: new Date().toISOString(),
          author: user.name,
          authorId: user.id
        };
        const encMeta = await cryptoModule.encryptMetadata(metadata, photoKey);

        // 5. Upload encrypted files
        setUploadProgress(`Uploading ${i + 1}/${filesToUpload.length} photos...`);
        await storageService.uploadWithCaching(encryptedFile, storagePath);
        await storageService.uploadWithCaching(encryptedThumbnail, thumbnailPath);

        // 6. Store encrypted photo record data (will be saved after post is created)
        encryptedPhotoRecords.push({
          id: photoId,
          albumId: albumId,
          version: 1,
          createdAt: Date.now(),
          encryptedPath: storagePath,
          thumbnailPath: thumbnailPath,
          encryptedMetadata: encMeta.encrypted,
          metadataIv: encMeta.iv,
          metadataAuthTag: encMeta.authTag,
          photoIv: encMeta.photoIv || "",
          authorId: user.id
        });

        console.log(`[Upload] Photo ${i + 1} encrypted and uploaded`);
      }

      // 7. Create Post (with references to all photos)
      setUploadProgress('Creating post...');
      const postData: Omit<Post, 'id'> = {
        albumId: albumId,
        caption: analysis.caption,
        tags: analysis.tags,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: user.name,
        authorId: user.id,
        photoIds: [], // Will be populated after photos are saved
        coverPhotoId: '', // Will be set to first photo ID
        createdAt: Date.now(),
        isEncrypted: true,
        likes: [],
        commentsCount: 0
      };

      const createdPost = await photoService.createPost(postData);
      console.log(`[Upload] Post created: ${createdPost.id}`);

      // 8. Save all photos to album subcollection
      setUploadProgress('Saving photos...');
      const savedPhotos = await photoService.addPhotosToPost(
        albumId,
        createdPost.id,
        encryptedPhotoRecords
      );

      // 9. Update post with actual photo IDs (in memory and Firestore)
      const uploadedPhotoIds = savedPhotos.map(p => p.id);
      const uploadedCoverPhotoId = savedPhotos[0].id;

      createdPost.photoIds = uploadedPhotoIds;
      createdPost.coverPhotoId = uploadedCoverPhotoId;

      // Update the post document in Firestore with the photo IDs
      const { doc, updateDoc, increment } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      const postRef = doc(db, 'posts', createdPost.id);
      await updateDoc(postRef, {
        photoIds: uploadedPhotoIds,
        coverPhotoId: uploadedCoverPhotoId
      });

      // Update album metadata (photoCount, updatedAt) - user manages cover photo manually
      if (selectedAlbumId) {
        const albumRef = doc(db, 'albums', selectedAlbumId);

        await updateDoc(albumRef, {
          photoCount: increment(1),
          updatedAt: Date.now()
        });

        console.log(`[Upload] Album ${selectedAlbumId} updated: photoCount incremented`);
      }

      console.log(`[Upload] Multi-image post upload complete: ${savedPhotos.length} photos, IDs updated in Firestore`);

      // 10. Return the complete post
      onUploadComplete(createdPost);
    } catch (error: any) {
      console.error("Upload failed", error);
      setValidationError({
        title: 'Upload Failed',
        message: error.message || "Failed to upload secure photos.",
        suggestion: 'Please try again.'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const selectedAlbumName = albums.find(a => a.id === selectedAlbumId)?.name;

  return (
    <>
      <div className="bg-white rounded-[2rem] shadow-xl border border-stone-100 overflow-hidden">
        <div className="p-1.5 flex items-center justify-between border-b border-stone-50 bg-stone-50/50 px-8 py-4">
          <div className="flex items-center gap-2">
            <div className="bg-orange-100 p-1.5 rounded-lg text-orange-500">
              <Wand2 size={18} />
            </div>
            <h2 className="text-lg font-bold text-stone-800">Add Memory</h2>
          </div>
          <button onClick={onCancel} className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {/* Hidden file input that persists for "Add More" functionality */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp"
            multiple
            onChange={(e) => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
          />

          {filesToUpload.length === 0 ? (
            <>
              <div
                className={`group relative h-80 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer ${isDragging
                  ? 'border-orange-400 bg-orange-50/50 scale-[0.99]'
                  : 'border-stone-200 hover:border-orange-300 hover:bg-stone-50'
                  }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {/* File input removed - now using persistent input at top of component */}
                <div className="w-20 h-20 bg-white shadow-sm rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Upload size={32} className="text-orange-400" />
                </div>
                <h3 className="text-xl font-bold text-stone-800 mb-2">Drop your photos here</h3>
                <p className="text-stone-500 text-sm max-w-xs mx-auto">or click to browse from your computer</p>
                <p className="text-stone-400 text-xs mt-4">Supports JPEG, PNG, HEIC (max 20MB each, {MAX_IMAGES_PER_POST} photos max)</p>
              </div>

              {/* Validation Error Message */}
              {validationError && (
                <div className="mt-6 p-6 bg-red-50 border border-red-200 rounded-2xl">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <X size={20} className="text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-red-900 mb-1">{validationError.title}</h4>
                      <p className="text-red-700 text-sm mb-3">{validationError.message}</p>
                      <p className="text-red-600 text-sm font-medium">{validationError.suggestion}</p>
                      <button
                        onClick={() => setValidationError(null)}
                        className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              {/* Image Preview Grid */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider">
                    Selected Photos ({filesToUpload.length}/{MAX_IMAGES_PER_POST})
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilesToUpload([]);
                      setPreviews([]);
                      setAnalysis(null);
                    }}
                    className="text-xs text-stone-500"
                  >
                    Clear All
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                  {previews.map((previewUrl, index) => (
                    <div key={index} className="relative group aspect-square rounded-xl overflow-hidden bg-stone-100">
                      <img src={previewUrl} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full font-bold">
                        {index + 1}
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  {/* Add more button if under limit */}
                  {filesToUpload.length < MAX_IMAGES_PER_POST && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-stone-300 hover:border-orange-400 hover:bg-orange-50/50 flex flex-col items-center justify-center cursor-pointer transition-all"
                    >
                      <Plus size={24} className="text-stone-400 mb-1" />
                      <span className="text-xs text-stone-500 font-medium">Add More</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex-1 space-y-8">
                  <div>
                    <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Sparkles size={16} className="text-teal-500" />
                      AI Insights
                    </h3>

                    {isAnalyzing ? (
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-stone-50 border border-stone-100 space-y-3">
                          <div className="h-4 bg-stone-200 rounded w-3/4 animate-pulse"></div>
                          <div className="h-4 bg-stone-200 rounded w-1/2 animate-pulse"></div>
                        </div>
                        <div className="flex gap-2">
                          <div className="h-8 w-20 bg-stone-100 rounded-full animate-pulse"></div>
                          <div className="h-8 w-24 bg-stone-100 rounded-full animate-pulse"></div>
                          <div className="h-8 w-16 bg-stone-100 rounded-full animate-pulse"></div>
                        </div>
                        <p className="text-xs text-stone-400 animate-pulse pt-2">Crafting a caption...</p>
                      </div>
                    ) : analysis ? (
                      <div className="space-y-6 animate-fade-in-up">
                        <div className="relative group">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-orange-600 mb-2">Caption</label>
                          <textarea
                            className="w-full bg-orange-50/50 hover:bg-orange-50 focus:bg-white border-2 border-transparent focus:border-orange-200 rounded-xl p-4 text-stone-800 font-medium text-lg leading-relaxed focus:ring-0 resize-none transition-all placeholder:text-stone-300"
                            rows={3}
                            value={analysis.caption}
                            onChange={(e) => setAnalysis({ ...analysis, caption: e.target.value })}
                          />
                          <div className="absolute right-3 top-9 text-orange-300 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Sparkles size={16} />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Tags</label>
                          <div className="flex flex-wrap gap-2">
                            {analysis.tags.map((tag, i) => (
                              <span key={i} className="pl-3 pr-2 py-1.5 bg-white text-stone-600 rounded-lg text-sm font-medium border border-stone-200 shadow-sm flex items-center gap-2 group">
                                {tag}
                                <button
                                  onClick={() => setAnalysis({ ...analysis, tags: analysis.tags.filter(t => t !== tag) })}
                                  className="text-stone-300 hover:text-red-400 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Album</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-teal-500">
                              <ImageIcon size={16} />
                            </div>
                            <select
                              value={showCreateAlbum ? 'CREATE_NEW' : selectedAlbumId}
                              onChange={(e) => {
                                if (e.target.value === 'CREATE_NEW') {
                                  setShowCreateAlbum(true);
                                  setSelectedAlbumId('');
                                } else {
                                  setShowCreateAlbum(false);
                                  setSelectedAlbumId(e.target.value);
                                }
                              }}
                              className="appearance-none w-full bg-stone-50 border border-stone-200 text-stone-700 py-3 pl-10 pr-10 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all font-semibold text-sm cursor-pointer"
                            >
                              <option value="" disabled>Select an Album</option>
                              {albums.map(album => (
                                <option key={album.id} value={album.id}>{album.name}</option>
                              ))}
                              <option value="CREATE_NEW" className="font-bold text-orange-600">+ Create New Album</option>
                            </select>
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-stone-400">
                              <ChevronDown size={16} />
                            </div>
                          </div>

                          {/* Inline Album Creation Form */}
                          {showCreateAlbum && (
                            <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-3 animate-fade-in-up">
                              <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                                <Plus size={16} />
                                Create New Album
                              </h4>

                              <div>
                                <input
                                  type="text"
                                  value={newAlbumName}
                                  onChange={(e) => setNewAlbumName(e.target.value)}
                                  placeholder="Album name (required)"
                                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                                  maxLength={50}
                                />
                              </div>

                              <div>
                                <textarea
                                  value={newAlbumDescription}
                                  onChange={(e) => setNewAlbumDescription(e.target.value)}
                                  placeholder="Description (optional)"
                                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-none"
                                  rows={2}
                                  maxLength={500}
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-blue-900 mb-1.5">Privacy</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {[
                                    { value: 'private', label: 'Private' },
                                    { value: 'family', label: 'Family' },
                                    { value: 'public', label: 'Public' }
                                  ].map((opt) => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setNewAlbumPrivacy(opt.value as any)}
                                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${newAlbumPrivacy === opt.value
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-blue-700 hover:bg-blue-100'
                                        }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="flex gap-2 pt-1">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setShowCreateAlbum(false);
                                    setNewAlbumName('');
                                    setNewAlbumDescription('');
                                    setNewAlbumPrivacy('family');
                                  }}
                                  className="flex-1 text-xs"
                                  disabled={isCreatingAlbum}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleCreateAlbum}
                                  className="flex-1 text-xs"
                                  disabled={!newAlbumName.trim() || isCreatingAlbum}
                                  isLoading={isCreatingAlbum}
                                >
                                  Create Album
                                </Button>
                              </div>
                            </div>
                          )}

                          {isAnalyzing && (
                            <p className="text-xs text-stone-400 mt-2 ml-1">
                              AI Suggested: <span className="text-stone-600 font-medium">{analysis.album}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                        <p>Analysis could not be completed.</p>
                        <Button variant="ghost" size="sm" onClick={() => runAIAnalysis(filesToUpload)} className="mt-2 text-orange-500">Retry</Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-8 mt-8 border-t border-stone-100">
                  {uploadProgress && (
                    <div className="mb-4 text-center text-sm text-orange-600 font-medium">
                      {uploadProgress}
                    </div>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={isAnalyzing || !analysis || isUploading || !selectedAlbumId || filesToUpload.length === 0}
                    isLoading={isUploading}
                    className="w-full py-4 text-base shadow-xl shadow-orange-500/20 hover:shadow-orange-500/30 active:scale-[0.98]"
                  >
                    <Check size={20} className="mr-2" />
                    {filesToUpload.length > 1 ? `Save ${filesToUpload.length} photos as post` : 'Save secure memory'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <VaultUnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        onUnlock={handleUnlock}
        albumId={selectedAlbumId}
        albumName={selectedAlbumName}
      />
    </>
  );
};