import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Image as ImageIcon, Sparkles, Check, Wand2, FolderPlus, Folder } from 'lucide-react';
import { Button } from './Button';
import { analyzeImage } from '../services/geminiService';
import { securePhotoService } from '../services/securePhotoService';
import { photoService } from '../services/photoService';
import { Photo, Album } from '../types';
import { useAuth } from '../context/AuthContext';
import { subscribeToAlbums } from '../services/albumService';
import { CreateAlbumModal } from './CreateAlbumModal';

interface UploaderProps {
  onUploadComplete: (photo: Photo) => void;
  onCancel: () => void;
}

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

export const Uploader: React.FC<UploaderProps> = ({ onUploadComplete, onCancel }) => {
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [analysis, setAnalysis] = useState<{ caption: string; tags: string[]; album: string } | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user's albums
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToAlbums(
      user.id,
      (updatedAlbums) => {
        setAlbums(updatedAlbums);
        // Auto-select first album if none selected
        if (updatedAlbums.length > 0 && !selectedAlbumId) {
          setSelectedAlbumId(updatedAlbums[0].id);
        }
      },
      (error) => {
        console.error('Error loading albums:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

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

  const handleFile = (file: File) => {
    // Clear any previous errors
    setValidationError(null);

    // Validate the file
    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      return;
    }

    setFileToUpload(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      runAIAnalysis(base64);
    };
    reader.readAsDataURL(file);
  };

  const runAIAnalysis = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeImage(base64);
      setAnalysis({
        caption: result.caption,
        tags: result.tags,
        album: result.suggestedAlbum
      });
    } catch (error: any) {
      console.error("Analysis failed", error);

      // Show user-friendly error for AI analysis failure
      setValidationError({
        title: 'AI Analysis Failed',
        message: 'Unable to analyze your photo automatically.',
        suggestion: 'The photo will still be uploaded, but you may need to add details manually. Try uploading a clearer photo for better results.'
      });

      // Set default analysis so user can still upload
      setAnalysis({
        caption: 'A beautiful family memory',
        tags: ['Family', 'Memory'],
        album: 'General'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSave = async () => {
    if (!preview || !analysis || !fileToUpload || !user || !selectedAlbumId) {
      if (!selectedAlbumId) {
        setValidationError({
          title: 'No Album Selected',
          message: 'Please select an album or create a new one.',
          suggestion: 'Choose an album from the dropdown or click "Create New Album".'
        });
      }
      return;
    }
    setIsUploading(true);

    try {
      // Find selected album name
      const selectedAlbum = albums.find(a => a.id === selectedAlbumId);

      // 1. Upload with encryption to Firebase Storage
      const result = await securePhotoService.uploadPhoto(fileToUpload, {
        albumId: selectedAlbumId,
        albumName: selectedAlbum?.name || 'General',
        onProgress: (progress) => {
          console.log(`Upload: ${progress.percentage}% - ${progress.status}`);
          // You can add a progress bar here if needed
        },
      });

      // 2. Save metadata to Firestore
      const newPhotoData = {
        photoId: result.photoId,
        albumId: result.albumId,
        url: `encrypted://${result.photoId}`, // Encrypted placeholder URL
        caption: analysis.caption,
        tags: analysis.tags,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: user.name,
        authorId: user.id,
        uploadedAt: result.uploadedAt,
        encrypted: true, // Mark as encrypted
      };

      const savedPhoto = await photoService.addPhoto(newPhotoData);

      // 3. Complete
      onUploadComplete(savedPhoto as Photo);
    } catch (error: any) {
      console.error("Encrypted upload failed", error);

      // Show user-friendly error message
      let errorMessage = "Failed to upload photo. Please try again.";

      if (error?.message?.includes('storage/unauthorized') || error?.message?.includes('not authenticated')) {
        errorMessage = "You don't have permission to upload photos. Please sign in again.";
      } else if (error?.message?.includes('network')) {
        errorMessage = "Network error. Please check your internet connection and try again.";
      } else if (error?.message?.includes('quota')) {
        errorMessage = "Storage limit reached. Please contact support.";
      } else if (error?.message?.includes('too large') || error?.message?.includes('FILE_TOO_LARGE')) {
        errorMessage = "Photo is too large. Maximum size is 50MB.";
      } else if (error?.message?.includes('format') || error?.message?.includes('INVALID_FORMAT')) {
        errorMessage = "Unsupported photo format. Please use JPEG, PNG, or HEIC.";
      }

      setValidationError({
        title: 'Upload Failed',
        message: errorMessage,
        suggestion: 'If the problem persists, try using a different photo or contact support.'
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
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
        {!preview ? (
          <>
            <div
              className={`group relative h-80 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer ${
                isDragging
                  ? 'border-orange-400 bg-orange-50/50 scale-[0.99]'
                  : 'border-stone-200 hover:border-orange-300 hover:bg-stone-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="w-20 h-20 bg-white shadow-sm rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Upload size={32} className="text-orange-400" />
              </div>
              <h3 className="text-xl font-bold text-stone-800 mb-2">Drop your photo here</h3>
              <p className="text-stone-500 text-sm max-w-xs mx-auto">or click to browse from your computer</p>
              <p className="text-stone-400 text-xs mt-4">Supports JPEG, PNG, HEIC (max 20MB)</p>
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
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden shadow-lg aspect-[4/5] bg-stone-100 group">
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setPreview(null); setAnalysis(null); }} className="w-full text-stone-500">
                Choose different photo
              </Button>
            </div>

            <div className="flex flex-col h-full">
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
                          onChange={(e) => setAnalysis({...analysis, caption: e.target.value})}
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
                                onClick={() => setAnalysis({...analysis, tags: analysis.tags.filter(t => t !== tag)})}
                                className="text-stone-300 hover:text-red-400 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                         <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">
                           Select Album
                         </label>
                         {albums.length === 0 ? (
                           <div className="text-center py-6 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                             <p className="text-sm text-stone-500 mb-3">No albums yet. Create your first album!</p>
                             <button
                               onClick={() => setShowCreateAlbumModal(true)}
                               className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                             >
                               <FolderPlus size={16} />
                               Create Album
                             </button>
                           </div>
                         ) : (
                           <div className="space-y-3">
                             <div className="relative">
                               <Folder size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                               <select
                                 value={selectedAlbumId || ''}
                                 onChange={(e) => setSelectedAlbumId(e.target.value)}
                                 className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-stone-200 rounded-lg text-sm font-medium text-stone-700 focus:border-orange-300 focus:ring-0 transition-colors appearance-none cursor-pointer hover:border-stone-300"
                               >
                                 <option value="" disabled>Choose an album...</option>
                                 {albums.map((album) => (
                                   <option key={album.id} value={album.id}>
                                     {album.name} {album.photoCount ? `(${album.photoCount} photos)` : ''}
                                   </option>
                                 ))}
                               </select>
                               <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                 <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                 </svg>
                               </div>
                             </div>
                             <button
                               onClick={() => setShowCreateAlbumModal(true)}
                               className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-stone-50 text-stone-600 rounded-lg hover:bg-stone-100 transition-colors text-sm font-medium border border-stone-200"
                             >
                               <FolderPlus size={16} />
                               Create New Album
                             </button>
                           </div>
                         )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                      <p>Analysis could not be completed.</p>
                      <Button variant="ghost" size="sm" onClick={() => runAIAnalysis(preview!)} className="mt-2 text-orange-500">Retry</Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-8 mt-8 border-t border-stone-100">
                <Button 
                  onClick={handleSave} 
                  disabled={isAnalyzing || !analysis || isUploading} 
                  isLoading={isUploading}
                  className="w-full py-4 text-base shadow-xl shadow-orange-500/20 hover:shadow-orange-500/30 active:scale-[0.98]"
                >
                  <Check size={20} className="mr-2" />
                  Save Memory
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Album Modal */}
      {user && (
        <CreateAlbumModal
          isOpen={showCreateAlbumModal}
          onClose={() => setShowCreateAlbumModal(false)}
          onSuccess={(albumId) => {
            setSelectedAlbumId(albumId);
            setShowCreateAlbumModal(false);
          }}
          currentUserId={user.id}
        />
      )}
    </div>
  );
};