import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Sparkles, Check, Wand2 } from 'lucide-react';
import { Button } from './Button';
import { analyzeImage } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { photoService } from '../services/photoService';
import { Photo } from '../types';
import { useAuth } from '../context/AuthContext';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!preview || !analysis || !fileToUpload || !user) return;
    setIsUploading(true);

    try {
      // 1. Upload to Firebase Storage
      const fileName = `${Date.now()}_${fileToUpload.name}`;
      const downloadURL = await storageService.uploadImage(fileToUpload, `photos/${user.id}/${fileName}`);

      // 2. Save metadata to Firestore
      const newPhotoData = {
        url: downloadURL,
        caption: analysis.caption,
        tags: analysis.tags,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: user.name,
        authorId: user.id
      };

      const savedPhoto = await photoService.addPhoto(newPhotoData);

      // 3. Complete
      onUploadComplete(savedPhoto as Photo);
    } catch (error: any) {
      console.error("Upload failed", error);

      // Show user-friendly error message
      let errorMessage = "Failed to upload photo. Please try again.";

      if (error?.message?.includes('storage/unauthorized')) {
        errorMessage = "You don't have permission to upload photos. Please sign in again.";
      } else if (error?.message?.includes('network')) {
        errorMessage = "Network error. Please check your internet connection and try again.";
      } else if (error?.message?.includes('quota')) {
        errorMessage = "Storage limit reached. Please contact support.";
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
                         <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Album</label>
                         <div className="inline-flex items-center gap-2 text-stone-600 bg-stone-50 px-4 py-2 rounded-lg border border-stone-200/60">
                            <ImageIcon size={16} className="text-teal-500" />
                            <span className="text-sm font-semibold">{analysis.album}</span>
                         </div>
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
    </div>
  );
};