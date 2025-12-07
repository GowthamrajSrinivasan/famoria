import React, { useState, useEffect } from 'react';
import { X, Sparkles, Wand2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { Photo } from '../types';
import { editImageWithAI } from '../services/geminiService';
import { userService } from '../services/userService';
import { securePhotoService } from '../services/securePhotoService';
import { photoService } from '../services/photoService';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';
import { useDecryptedPhoto } from '../hooks/useDecryptedPhoto';

interface EditPhotoModalProps {
  photo: Photo;
  onClose: () => void;
  onSave: (newPhoto: Photo) => void;
}

const SUGGESTED_PROMPTS = [
  "Enhance lighting and colors",
  "Make it look like a watercolor painting",
  "Remove background distraction",
  "Add a sunset background",
  "Turn into black and white with high contrast",
  "Add warm golden hour glow"
];

export const EditPhotoModal: React.FC<EditPhotoModalProps> = ({ photo, onClose, onSave }) => {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState({ editsUsed: 0, limit: 0, plan: 'Pro' });

  // Decrypt photo if encrypted
  const { url: decryptedUrl, loading: loadingPhoto } = useDecryptedPhoto(photo.url, photo.id);

  useEffect(() => {
    if (user) {
      userService.getUsage(user.id).then(setUsage);
    }
  }, [user]);

  /**
   * Convert blob URL to base64
   */
  const blobUrlToBase64 = async (blobUrl: string): Promise<string> => {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !user || !decryptedUrl) return;

    const hasQuota = await userService.checkQuota(user.id);
    if (!hasQuota) {
      setError("You've reached your monthly AI edit limit. Please upgrade your plan.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Convert decrypted URL to base64 for AI processing
      const imageBase64 = decryptedUrl.startsWith('blob:')
        ? await blobUrlToBase64(decryptedUrl)
        : decryptedUrl;

      const generatedImageBase64 = await editImageWithAI(imageBase64, prompt);
      setResultImage(generatedImageBase64);
    } catch (err) {
      setError("Something went wrong with the AI editor. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!resultImage || !user) return;
    setIsSaving(true);

    try {
      // 1. Convert base64 to File object
      const base64Response = await fetch(resultImage);
      const blob = await base64Response.blob();
      const fileName = `edited_${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // 2. Upload with encryption
      const result = await securePhotoService.uploadPhoto(file, {
        albumName: 'AI Edited',
        onProgress: (progress) => {
          console.log(`Upload: ${progress.percentage}% - ${progress.status}`);
        },
      });

      // 3. Increment usage
      await userService.incrementUsage(user.id);

      // 4. Save new photo record
      const newPhotoData = {
        photoId: result.photoId,
        albumId: result.albumId,
        url: `encrypted://${result.photoId}`, // Encrypted placeholder URL
        caption: `Edited: ${photo.caption}`,
        tags: [...photo.tags, 'AI Edited'],
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: user.name,
        authorId: user.id,
        isAiGenerated: true,
        originalPhotoId: photo.id,
        uploadedAt: result.uploadedAt,
        encrypted: true,
      };

      const savedPhoto = await photoService.addPhoto(newPhotoData);
      onSave(savedPhoto as Photo);
      onClose();
    } catch (e) {
      setError("Failed to save edited photo.");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/95 backdrop-blur-md p-4 animate-fade-in-up">
      <div className="w-full max-w-5xl h-[85vh] bg-stone-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row border border-stone-800">
        
        {/* Left: Image Preview Area */}
        <div className="flex-1 relative bg-black flex flex-col">
          {/* Header over image */}
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 bg-gradient-to-b from-black/80 to-transparent">
             <div>
               <h2 className="text-white font-bold text-lg flex items-center gap-2">
                 <Sparkles className="text-orange-400" size={18} />
                 AI Studio
               </h2>
               <p className="text-stone-400 text-xs mt-1">
                 {usage.plan} Plan: {usage.limit - usage.editsUsed} edits remaining
               </p>
             </div>
             <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
               <X size={20} />
             </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-8 relative">
            {loadingPhoto || isGenerating ? (
               <div className="flex flex-col items-center gap-4 text-center">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full border-4 border-stone-800 border-t-orange-500 animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                       <Sparkles className="text-orange-400 animate-pulse" size={24} />
                    </div>
                  </div>
                  <p className="text-stone-300 font-medium animate-pulse">
                    {loadingPhoto ? 'Loading photo...' : 'Creating magic...'}
                  </p>
                  {isGenerating && (
                    <p className="text-stone-500 text-sm max-w-xs">This might take a few seconds as we process every pixel.</p>
                  )}
               </div>
            ) : resultImage ? (
              <img src={resultImage} alt="Edited Result" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
            ) : decryptedUrl ? (
              <img src={decryptedUrl} alt="Original" className="max-w-full max-h-full object-contain opacity-80" />
            ) : null}
          </div>

          {/* Compare Toggle (Only if result exists) */}
          {resultImage && !isGenerating && (
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
                <button 
                  onMouseDown={() => setResultImage(null)} 
                  onMouseUp={() => handleGenerate()} // A simple toggle back for visual check (regenerates not ideal, but keeps simpler state)
                  className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white text-sm font-medium border border-white/10 hover:bg-black/80"
                  onClick={() => setResultImage(null)}
                >
                  View Original
                </button>
             </div>
          )}
        </div>

        {/* Right: Controls Sidebar */}
        <div className="w-full md:w-[380px] bg-stone-900 border-l border-stone-800 flex flex-col">
          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            
            <div className="mb-8">
              <label className="block text-sm font-bold text-stone-300 mb-2">
                What would you like to change?
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g., Remove the person in the background, make it sunny..."
                className="w-full h-32 bg-stone-800 border border-stone-700 rounded-xl p-4 text-white placeholder:text-stone-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none transition-all"
              />
            </div>

            <div className="mb-8">
               <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">
                 Quick Enhancements
               </label>
               <div className="flex flex-wrap gap-2">
                 {SUGGESTED_PROMPTS.map((suggestion, i) => (
                   <button
                     key={i}
                     onClick={() => setPrompt(suggestion)}
                     className="text-left text-xs text-stone-300 bg-stone-800 hover:bg-stone-700 border border-stone-700 px-3 py-2 rounded-lg transition-colors"
                   >
                     {suggestion}
                   </button>
                 ))}
               </div>
            </div>

            {error && (
              <div className="p-4 bg-red-900/30 border border-red-900/50 rounded-xl flex gap-3 text-red-200 text-sm mb-6">
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-stone-800 bg-stone-900">
            {resultImage ? (
               <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant="ghost" 
                    onClick={() => setResultImage(null)}
                    disabled={isSaving}
                    className="text-stone-400 hover:text-white hover:bg-stone-800 border border-stone-700"
                  >
                    <RefreshCw size={16} className="mr-2" />
                    Retry
                  </Button>
                  <Button 
                    onClick={handleSave}
                    isLoading={isSaving}
                    className="bg-teal-600 hover:bg-teal-500 text-white"
                  >
                    <Check size={18} className="mr-2" />
                    Save Copy
                  </Button>
               </div>
            ) : (
               <Button 
                 onClick={handleGenerate} 
                 disabled={!prompt.trim() || isGenerating}
                 className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-lg shadow-orange-900/20"
               >
                 {isGenerating ? (
                   "Processing..."
                 ) : (
                   <>
                     <Wand2 size={18} className="mr-2" />
                     Generate Edit
                   </>
                 )}
               </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};