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

export const Uploader: React.FC<UploaderProps> = ({ onUploadComplete, onCancel }) => {
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [analysis, setAnalysis] = useState<{ caption: string; tags: string[]; album: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
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
    } catch (error) {
      console.error("Analysis failed", error);
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
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload photo. Please try again.");
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
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="w-20 h-20 bg-white shadow-sm rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <Upload size={32} className="text-orange-400" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Drop your photo here</h3>
            <p className="text-stone-500 text-sm max-w-xs mx-auto">or click to browse from your computer</p>
          </div>
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