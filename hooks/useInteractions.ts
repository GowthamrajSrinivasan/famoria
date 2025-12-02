import { useState, useEffect } from 'react';
import { interactionService } from '../services/interactionService';
import { Comment } from '../types';

export const useLikes = (photoId: string, currentUserId?: string) => {
  const [likes, setLikes] = useState<string[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const unsubscribe = interactionService.subscribeToLikes(photoId, (userIds) => {
      setLikes(userIds);
      if (currentUserId) {
        setIsLiked(userIds.includes(currentUserId));
      }
    });
    return () => unsubscribe();
  }, [photoId, currentUserId]);

  const toggleLike = async () => {
    if (!currentUserId) return;

    // Optimistic Update
    const previousLikes = [...likes];
    const previousIsLiked = isLiked;

    if (!isLiked) {
      setIsAnimating(true);
      setLikes([...likes, currentUserId]);
      setIsLiked(true);
    } else {
      setLikes(likes.filter(id => id !== currentUserId));
      setIsLiked(false);
    }

    try {
      await interactionService.toggleLike(photoId, currentUserId);
    } catch (error) {
      // Revert on error
      setLikes(previousLikes);
      setIsLiked(previousIsLiked);
    }

    setTimeout(() => setIsAnimating(false), 1000);
  };

  return { likes, isLiked, toggleLike, isAnimating };
};

export const useComments = (photoId: string) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = interactionService.subscribeToComments(photoId, (newComments) => {
      setComments(newComments);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [photoId]);

  const addComment = async (text: string, user: any) => {
    if (!user) return;
    
    try {
      await interactionService.addComment({
        photoId,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        text
      });
    } catch (error) {
      console.error("Failed to add comment", error);
      throw error;
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await interactionService.deleteComment(photoId, commentId);
    } catch (error) {
      console.error("Failed to delete comment", error);
    }
  };

  return { comments, loading, addComment, deleteComment };
};

// Helper for relative time (e.g., "2 hours ago")
export const formatRelativeTime = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};