import React, { useState } from 'react';
import { Photo, User } from '../types';
import { Share2, MessageCircle, Calendar, Loader2, Trash2 } from 'lucide-react';
import { LikeButton } from './LikeButton';
import { useDecryptedThumbnail } from '../hooks/useDecryptedPhoto';
import { securePhotoService } from '../services/securePhotoService';

interface PhotoCardProps {
  photo: Photo;
  onClick: (photo: Photo) => void;
  currentUser: User | null;
  onDelete?: (photoId: string) => void;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, currentUser, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  // Decrypt photo if encrypted
  const { url: decryptedUrl, loading, error } = useDecryptedThumbnail(photo.url, photo.id);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await securePhotoService.deletePhoto(photo.id);
      if (onDelete) {
        onDelete(photo.id);
      }
    } catch (error) {
      console.error('Failed to delete photo:', error);
      alert('Failed to delete photo. Please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="group relative break-inside-avoid mb-6 rounded-3xl overflow-hidden bg-white shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.1)] transition-all duration-300 border border-stone-100/50 hover:-translate-y-1 cursor-pointer"
      onClick={() => onClick(photo)}
    >
      <div className="relative">
        {loading && (
          <div className="w-full aspect-square bg-stone-100 flex items-center justify-center">
            <Loader2 size={32} className="text-stone-400 animate-spin" />
          </div>
        )}
        {error && (
          <div className="w-full aspect-square bg-stone-100 flex items-center justify-center">
            <p className="text-stone-500 text-sm">Failed to load photo</p>
          </div>
        )}
        {!loading && !error && decryptedUrl && (
          <img
            src={decryptedUrl}
            alt={photo.caption}
            className="w-full h-auto object-cover"
            loading="lazy"
          />
        )}
        {/* Gradient Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-between p-5">
          <div className="flex gap-3">
            <LikeButton photoId={photo.id} currentUserId={currentUser?.id} />
            <button
              className="bg-white/20 hover:bg-white/40 backdrop-blur-sm p-2 rounded-full text-white transition-all transform hover:scale-110"
              onClick={(e) => {
                e.stopPropagation();
                onClick(photo);
              }}
            >
              <MessageCircle size={18} className="text-white/90" />
            </button>
          </div>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-500/80 hover:bg-red-600/90 backdrop-blur-sm p-2 rounded-full text-white transition-all transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete photo"
          >
            {isDeleting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Trash2 size={18} className="text-white/90" />
            )}
          </button>
        </div>
      </div>
      
      <div className="p-5">
        <p className="text-stone-800 font-medium text-[15px] leading-relaxed mb-4 line-clamp-2">
          {photo.caption}
        </p>
        
        <div className="flex flex-wrap gap-2 mb-5">
          {photo.tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="px-2.5 py-1 rounded-md bg-stone-50 text-stone-500 text-xs font-semibold tracking-wide border border-stone-100">
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-stone-50">
          <div className="flex items-center gap-1.5 text-stone-400">
            <Calendar size={12} />
            <span className="text-xs font-medium">{photo.date}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">by</span>
            <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
              {photo.author}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};