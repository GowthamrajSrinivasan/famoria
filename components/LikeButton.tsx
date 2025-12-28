import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useLikes } from '../hooks/useInteractions';
import { LikesModal } from './LikesModal';
import { LikesPreview } from './LikesPreview';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface LikeButtonProps {
  photoId: string;
  currentUserId?: string;
  showCount?: boolean;
  variant?: 'card' | 'lightbox';
  itemType?: 'photo' | 'video' | 'post'; // Added 'post' type
}

export const LikeButton: React.FC<LikeButtonProps> = ({
  photoId,
  currentUserId,
  showCount = true,
  variant = 'card',
  itemType = 'photo'
}) => {
  // Map itemType to Firestore collection name
  const collectionName = itemType === 'video' ? 'videos' : itemType === 'post' ? 'posts' : 'photos';
  const { likes, isLiked, toggleLike, isAnimating } = useLikes(photoId, currentUserId, collectionName);
  const [showTooltip, setShowTooltip] = useState(false);
  const [likerNames, setLikerNames] = useState<string[]>([]);
  const [showLikesModal, setShowLikesModal] = useState(false);

  // Fetch user names for the likers
  useEffect(() => {
    const fetchLikerNames = async () => {
      if (likes.length === 0) {
        setLikerNames([]);
        return;
      }

      try {
        // Get up to 3 names to display
        const userIdsToFetch = likes.slice(0, 3);
        const usersQuery = query(
          collection(db, 'users'),
          where('__name__', 'in', userIdsToFetch)
        );

        const snapshot = await getDocs(usersQuery);
        const names = snapshot.docs.map(doc => doc.data().name as string);
        setLikerNames(names);
      } catch (error) {
        console.error('Error fetching liker names:', error);
        setLikerNames([]);
      }
    };

    fetchLikerNames();
  }, [likes]);

  const baseClasses = "flex items-center gap-2 transition-all active:scale-95";
  const styles = {
    card: "bg-white/20 hover:bg-white/40 backdrop-blur-sm p-2 rounded-full text-white",
    lightbox: `px-5 py-2.5 rounded-full transition-colors ${isLiked
      ? 'bg-red-50 hover:bg-red-100'
      : 'bg-stone-100 hover:bg-stone-200'
      }`
  };

  // Format tooltip text
  const getTooltipText = () => {
    if (likerNames.length === 0) {
      return `${likes.length} ${likes.length === 1 ? 'like' : 'likes'}`;
    }

    const displayNames = likerNames.slice(0, 3);
    const remainingCount = likes.length - displayNames.length;

    if (displayNames.length === 1) {
      return remainingCount > 0
        ? `${displayNames[0]} and ${remainingCount} ${remainingCount === 1 ? 'other' : 'others'}`
        : displayNames[0];
    } else if (displayNames.length === 2) {
      return remainingCount > 0
        ? `${displayNames[0]}, ${displayNames[1]}, and ${remainingCount} ${remainingCount === 1 ? 'other' : 'others'}`
        : `${displayNames[0]} and ${displayNames[1]}`;
    } else {
      // 3 names
      return remainingCount > 0
        ? `${displayNames[0]}, ${displayNames[1]}, ${displayNames[2]}, and ${remainingCount} ${remainingCount === 1 ? 'other' : 'others'}`
        : `${displayNames[0]}, ${displayNames[1]}, and ${displayNames[2]}`;
    }
  };

  return (
    <>
      <div className="relative inline-flex items-center gap-3">
        {/* Like Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLike();
          }}
          onMouseEnter={() => likes.length > 0 && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`${baseClasses} ${styles[variant]} ${isAnimating ? 'animate-heart-burst' : ''}`}
        >
          <Heart
            size={variant === 'lightbox' ? 20 : 18}
            fill={isLiked ? "currentColor" : "none"}
            className={`transition-all duration-200 ${variant === 'lightbox'
                ? (isLiked ? "text-red-500" : "text-stone-500")
                : (isLiked ? "text-red-500 scale-110" : "text-white/90")
              }`}
          />
          {showCount && likes.length > 0 && (
            <span className={`text-sm font-semibold ${variant === 'card' ? 'text-white' : (isLiked ? 'text-red-500' : 'text-stone-600')
              }`}>
              {likes.length}
            </span>
          )}
        </button>

        {/* Who Liked Tooltip */}
        {showTooltip && likes.length > 0 && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-stone-900 text-white text-xs rounded-lg whitespace-nowrap z-50 animate-fade-in-up pointer-events-none">
            <div className="max-w-xs">
              <span>{getTooltipText()}</span>
            </div>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-stone-900 rotate-45" />
          </div>
        )}
      </div>

      {/* Likes Modal */}
      {showLikesModal && (
        <LikesModal
          likes={likes}
          onClose={() => setShowLikesModal(false)}
        />
      )}
    </>
  );
};