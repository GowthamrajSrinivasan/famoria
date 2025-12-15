import { useState, useEffect } from 'react';
import { interactionService } from '../services/interactionService';
import { notificationService } from '../services/notificationService';
import { emailService } from '../services/emailService';
import { userService } from '../services/userService';
import { Comment } from '../types';

export const useLikes = (photoId: string, currentUserId?: string, collectionName: string = 'photos', post?: any) => {
  const [likes, setLikes] = useState<string[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const unsubscribe = interactionService.subscribeToLikes(photoId, (userIds) => {
      setLikes(userIds);
      if (currentUserId) {
        setIsLiked(userIds.includes(currentUserId));
      }
    }, collectionName);
    return () => unsubscribe();
  }, [photoId, currentUserId, collectionName]);

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
      await interactionService.toggleLike(photoId, currentUserId, collectionName);

      // Send notification for new likes (not for unlikes)
      if (!previousIsLiked && post && post.authorId && post.authorId !== currentUserId) {
        try {
          const currentUser = await userService.getUserById(currentUserId);

          // Create in-app notification
          await notificationService.createNotification({
            userId: post.authorId,
            type: 'like',
            actorId: currentUserId,
            actorName: currentUser?.name || 'Someone',
            actorAvatar: currentUser?.avatar,
            message: 'liked your memory.',
            photoId: photoId,
            createdAt: Date.now(),
            isRead: false
          });

          // Send email notification
          const owner = await userService.getUserById(post.authorId);
          if (owner?.email) {
            await emailService.sendNotificationEmailBackground(
              owner.email,
              owner.name,
              'like',
              {
                actorName: currentUser?.name || 'Someone',
                photoUrl: window.location.href
              }
            );
          }
        } catch (err) {
          console.warn('[useLikes] Failed to send notification:', err);
        }
      }
    } catch (error) {
      // Revert on error
      setLikes(previousLikes);
      setIsLiked(previousIsLiked);
    }

    setTimeout(() => setIsAnimating(false), 1000);
  };

  return { likes, isLiked, toggleLike, isAnimating };
};

export const useComments = (photoId: string, collectionName: string = 'photos', post?: any) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = interactionService.subscribeToComments(photoId, (newComments) => {
      setComments(newComments);
      setLoading(false);
    }, collectionName);
    return () => unsubscribe();
  }, [photoId, collectionName]);

  const addComment = async (text: string, user: any) => {
    if (!user) return;

    try {
      await interactionService.addComment({
        photoId,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        text
      }, collectionName);

      // Send notification to post owner
      if (post && post.authorId && post.authorId !== user.id) {
        try {
          // Create in-app notification
          await notificationService.createNotification({
            userId: post.authorId,
            type: 'comment',
            actorId: user.id,
            actorName: user.name,
            actorAvatar: user.avatar,
            message: `commented: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
            photoId: photoId,
            createdAt: Date.now(),
            isRead: false
          });

          // Send email notification
          const owner = await userService.getUserById(post.authorId);
          if (owner?.email) {
            await emailService.sendNotificationEmailBackground(
              owner.email,
              owner.name,
              'comment',
              {
                actorName: user.name,
                message: `"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"}`,
                photoUrl: window.location.href
              }
            );
          }
        } catch (err) {
          console.warn('[useComments] Failed to send notification:', err);
        }
      }
    } catch (error) {
      console.error("Failed to add comment", error);
      throw error;
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await interactionService.deleteComment(photoId, commentId, collectionName);
    } catch (error) {
      console.error("Failed to delete comment", error);
    }
  };

  const editComment = async (commentId: string, newText: string) => {
    try {
      await interactionService.updateComment(photoId, commentId, newText, collectionName);
    } catch (error) {
      console.error('Failed to edit comment:', error);
      throw error;
    }
  };

  const toggleCommentLike = async (commentId: string, userId: string) => {
    try {
      return await interactionService.toggleCommentLike(photoId, commentId, userId, collectionName);
    } catch (error) {
      console.error("Failed to toggle comment like", error);
      return false;
    }
  };

  return { comments, loading, addComment, deleteComment, editComment, toggleCommentLike };
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