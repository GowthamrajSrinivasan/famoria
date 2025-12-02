import React from 'react';
import { Heart } from 'lucide-react';
import { useLikes } from '../hooks/useInteractions';

interface LikeButtonProps {
  photoId: string;
  currentUserId?: string;
  showCount?: boolean;
  variant?: 'card' | 'lightbox';
}

export const LikeButton: React.FC<LikeButtonProps> = ({ 
  photoId, 
  currentUserId, 
  showCount = true,
  variant = 'card'
}) => {
  const { likes, isLiked, toggleLike, isAnimating } = useLikes(photoId, currentUserId);

  const baseClasses = "flex items-center gap-2 transition-all active:scale-95";
  const styles = {
    card: "bg-white/20 hover:bg-white/40 backdrop-blur-sm p-2 rounded-full text-white",
    lightbox: `px-4 py-2 rounded-full border transition-colors ${
      isLiked 
        ? 'bg-red-50 border-red-100 text-red-500' 
        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
    }`
  };

  return (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        toggleLike();
      }}
      className={`${baseClasses} ${styles[variant]} ${isAnimating ? 'animate-heart-burst' : ''}`}
    >
      <Heart 
        size={variant === 'lightbox' ? 20 : 18} 
        fill={isLiked ? "currentColor" : "none"}
        className={isLiked ? "text-red-500" : (variant === 'card' ? "text-white/90" : "text-stone-400")}
      />
      {showCount && likes.length > 0 && (
        <span className={`text-sm font-semibold ${variant === 'card' ? 'text-white' : ''}`}>
          {likes.length}
        </span>
      )}
    </button>
  );
};