import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, Image as ImageIcon, Sparkles, Check, Wand2, ChevronDown, GripVertical, Trash2, Plus, Calendar } from 'lucide-react';
import { Button } from './Button';
import { analyzeImage, analyzeMultipleImages } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { photoService } from '../services/photoService';
import { subscribeToAlbums, createAlbum } from '../services/albumService';
import { Photo, Album, Post } from '../types';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import * as imageUtils from '../lib/imageUtils';
import * as keyModule from '../lib/crypto/photoKey';
import * as cryptoModule from '../lib/crypto/photoCrypto';
import { processInParallel } from '../lib/processInParallel';
import { useUpload } from '../context/UploadContext';

interface UploaderProps {
  onUploadComplete: (posts: Post[]) => void;
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
  const { t } = useTranslation();
  const { user, familyKey, googleAccessToken, refreshDriveToken } = useAuth();
  const { addUploads } = useUpload();
  const [isDragging, setIsDragging] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
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

  // Additional Metadata State
  const [location, setLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToAlbums(user.id, (fetchedAlbums) => {
      setAlbums(fetchedAlbums);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (currentAlbumId) setSelectedAlbumId(currentAlbumId);
  }, [currentAlbumId]);

  const validateFile = (file: File): ValidationError | null => {
    if (!file.type.startsWith('image/')) {
      return {
        title: t('error_not_image'),
        message: t('error_not_image_msg', { name: file.name }),
        suggestion: t('error_not_image_sugg')
      };
    }

    if (!ALLOWED_FORMATS.includes(file.type.toLowerCase())) {
      const detectedType = file.type || 'Unknown';
      return {
        title: t('error_unsupported_format'),
        message: t('error_unsupported_format_msg', { format: detectedType.replace('image/', '').toUpperCase() }),
        suggestion: t('error_unsupported_format_sugg')
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return {
        title: t('error_file_too_large'),
        message: t('error_file_too_large_msg', { size: sizeMB }),
        suggestion: t('error_file_too_large_sugg')
      };
    }

    if (file.size < 1024) {
      return {
        title: t('error_invalid_image'),
        message: t('error_invalid_image_msg'),
        suggestion: t('error_invalid_image_sugg')
      };
    }

    return null;
  };

  const handleFiles = (files: FileList | File[]) => {
    setValidationError(null);
    const filesArray = Array.from(files);

    if (filesToUpload.length + filesArray.length > MAX_IMAGES_PER_POST) {
      setValidationError({
        title: t('error_too_many_images'),
        message: t('error_too_many_images_msg', { max: MAX_IMAGES_PER_POST }),
        suggestion: t('error_too_many_images_sugg', { count: filesToUpload.length, remaining: MAX_IMAGES_PER_POST - filesToUpload.length })
      });
      return;
    }

    for (const file of filesArray) {
      const error = validateFile(file);
      if (error) {
        setValidationError(error);
        return;
      }
    }

    const newFiles = [...filesToUpload, ...filesArray];
    setFilesToUpload(newFiles);

    filesArray.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setPreviews(prev => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (newFiles.length > 0 && !isAnalyzing) {
      setTimeout(() => runAIAnalysis(newFiles), 100);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = filesToUpload.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFilesToUpload(newFiles);
    setPreviews(newPreviews);

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
        title: t('error_ai_failed'),
        message: t('error_ai_failed_msg'),
        suggestion: t('error_ai_failed_sugg')
      });
      setAnalysis({
        caption: files.length > 1 ? t('default_caption_multiple', 'A beautiful collection of memories') : t('default_caption_single', 'A beautiful family memory'),
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

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim() || !user) {
      setValidationError({
        title: t('error_album_name_req'),
        message: t('error_album_name_req_msg'),
        suggestion: t('error_album_name_req_sugg')
      });
      return;
    }

    setIsCreatingAlbum(true);
    try {
      const albumId = await createAlbum(
        newAlbumName.trim(),
        user.id,
        newAlbumDescription.trim(),
        newAlbumPrivacy,
        [user.id],
        familyKey || undefined
      );

      console.log(`[Uploader] Created new album: ${albumId}`);

      setSelectedAlbumId(albumId);

      setShowCreateAlbum(false);
      setNewAlbumName('');
      setNewAlbumDescription('');
      setNewAlbumPrivacy('family');

    } catch (error: any) {
      console.error('[Uploader] Failed to create album:', error);
      setValidationError({
        title: t('error_album_create_failed'),
        message: error.message || t('error_album_create_failed_msg'),
        suggestion: t('error_album_create_failed_sugg')
      });
    } finally {
      setIsCreatingAlbum(false);
    }
  };

  const handleSave = async () => {
    if (filesToUpload.length === 0 || !analysis || !user || !onUploadComplete) return;
    if (!selectedAlbumId) {
      setValidationError({
        title: t('error_album_req'),
        message: t('error_album_req_msg'),
        suggestion: t('error_album_req_sugg')
      });
      return;
    }

    // Ensure Encryption Context
    if (!familyKey) {
      setValidationError({
        title: t('error_family_locked'),
        message: t('error_family_locked_msg', 'Family Vault is locked. Please unlock to upload.'),
        suggestion: t('error_family_locked_sugg', 'Unlock Family Vault.')
      });
      return;
    }

    setIsQueueing(true);

    try {
      const albumId = selectedAlbumId;
      console.log(`[Upload] Queueing ${filesToUpload.length} photos for background upload to album ${albumId}`);

      await addUploads(
        filesToUpload,
        albumId,
        familyKey,
        {
          caption: analysis.caption,
          tags: analysis.tags,
          date: selectedDate,
          location: location
        },
        user
      );

      console.log(`[Upload] ✅ All uploads queued successfully! Closing modal...`);
      onCancel();

    } catch (error: any) {
      console.error("Upload queue failed", error);
      setValidationError({
        title: t('error_upload_failed'),
        message: error.message || t('error_upload_failed_msg'),
        suggestion: t('error_upload_failed_sugg')
      });
    } finally {
      setIsQueueing(false);
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
            <h2 className="text-lg font-bold text-stone-800">{t('add_memory_title')}</h2>
          </div>
          <button onClick={onCancel} className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
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
                <div className="w-20 h-20 bg-white shadow-sm rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Upload size={32} className="text-orange-400" />
                </div>
                <h3 className="text-xl font-bold text-stone-800 mb-2">{t('drop_photos_here')}</h3>
                <p className="text-stone-500 text-sm max-w-xs mx-auto">{t('browse_computer')}</p>
                <p className="text-stone-400 text-xs mt-4">{t('upload_formats', { max: MAX_IMAGES_PER_POST })}</p>
              </div>

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
                        {t('try_again')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider">
                    {t('selected_photos', { count: filesToUpload.length, max: MAX_IMAGES_PER_POST })}
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
                    {t('clear_all_photos')}
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

                  {filesToUpload.length < MAX_IMAGES_PER_POST && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-stone-300 hover:border-orange-400 hover:bg-orange-50/50 flex flex-col items-center justify-center cursor-pointer transition-all"
                    >
                      <Plus size={24} className="text-stone-400 mb-1" />
                      <span className="text-xs text-stone-500 font-medium">{t('add_more')}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex-1 space-y-8">
                  <div>
                    <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Sparkles size={16} className="text-teal-500" />
                      {t('ai_insights')}
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
                        <p className="text-xs text-stone-400 animate-pulse pt-2">{t('crafting_caption')}</p>
                      </div>
                    ) : analysis ? (
                      <div className="space-y-6 animate-fade-in-up">
                        <div className="relative group">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-orange-600 mb-2">{t('label_caption')}</label>
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
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">{t('label_tags')}</label>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Location</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-stone-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </div>
                              <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Add location..."
                                className="w-full bg-stone-50 border border-stone-200 text-stone-700 py-3 pl-10 pr-4 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all font-semibold text-sm"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Date</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-stone-400">
                                <Calendar size={16} />
                              </div>
                              <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full bg-stone-50 border border-stone-200 text-stone-700 py-3 pl-10 pr-4 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all font-semibold text-sm appearance-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">{t('label_album')}</label>
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
                              <option value="" disabled>{t('select_album')}</option>
                              {albums.map(album => (
                                <option key={album.id} value={album.id}>{album.name}</option>
                              ))}
                              <option value="CREATE_NEW" className="font-bold text-orange-600">{t('create_new_album_option')}</option>
                            </select>
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-stone-400">
                              <ChevronDown size={16} />
                            </div>
                          </div>

                          {showCreateAlbum && (
                            <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-3 animate-fade-in-up">
                              <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                                <Plus size={16} />
                                {t('create_new_album_title')}
                              </h4>

                              <div>
                                <input
                                  type="text"
                                  value={newAlbumName}
                                  onChange={(e) => setNewAlbumName(e.target.value)}
                                  placeholder={t('placeholder_album_name')}
                                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                                  maxLength={50}
                                />
                              </div>

                              <div>
                                <textarea
                                  value={newAlbumDescription}
                                  onChange={(e) => setNewAlbumDescription(e.target.value)}
                                  placeholder={t('placeholder_album_desc')}
                                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-none"
                                  rows={2}
                                  maxLength={500}
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-blue-900 mb-1.5">{t('privacy_label')}</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {[
                                    { value: 'private', label: t('privacy_private') },
                                    { value: 'family', label: t('privacy_family') },
                                    { value: 'public', label: t('privacy_public') }
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
                                  {t('cancel')}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleCreateAlbum}
                                  className="flex-1 text-xs"
                                  disabled={!newAlbumName.trim() || isCreatingAlbum}
                                  isLoading={isCreatingAlbum}
                                >
                                  {t('create_album')}
                                </Button>
                              </div>
                            </div>
                          )}

                          {isAnalyzing && (
                            <p className="text-xs text-stone-400 mt-2 ml-1">
                              <span dangerouslySetInnerHTML={{ __html: t('ai_suggested', { album: analysis!.album }) }} />
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                        <p>{t('analysis_failed_message')}</p>
                        <Button variant="ghost" size="sm" onClick={() => runAIAnalysis(filesToUpload)} className="mt-2 text-orange-500">{t('retry')}</Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-8 mt-8 border-t border-stone-100">
                  <Button
                    onClick={handleSave}
                    disabled={isAnalyzing || !analysis || isQueueing || !selectedAlbumId || filesToUpload.length === 0}
                    isLoading={isQueueing}
                    className="w-full py-4 text-base shadow-xl shadow-orange-500/20 hover:shadow-orange-500/30 active:scale-[0.98]"
                  >
                    <Check size={20} className="mr-2" />
                    {filesToUpload.length > 1 ? t('save_photos_post', { count: filesToUpload.length }) : t('save_secure_memory')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};