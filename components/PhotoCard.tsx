import React from 'react';
import { Photo, User } from '../types';
import { Share2, MessageCircle, Calendar } from 'lucide-react';
import { LikeButton } from './LikeButton';

interface PhotoCardProps {
  photo: Photo;
  onClick: (photo: Photo) => void;
  currentUser: User | null;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, currentUser }) => {
  return (
    <div 
      className="group relative break-inside-avoid mb-6 rounded-3xl overflow-hidden bg-white shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.1)] transition-all duration-300 border border-stone-100/50 hover:-translate-y-1 cursor-pointer"
      onClick={() => onClick(photo)}
    >
      <div className="relative">
        <img 
          src={photo.url} 
          alt={photo.caption} 
          className="w-full h-auto object-cover"
          loading="lazy"
        />
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