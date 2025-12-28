import React, { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Edit2, Heart } from 'lucide-react';
import { useComments, formatRelativeTime } from '../hooks/useInteractions';
import { User } from '../types';
import { EmojiPicker } from './EmojiPicker';

interface CommentSectionProps {
  photoId?: string;
  itemId?: string;
  itemType?: 'photo' | 'video';
  currentUser: User | null;
  photoLikes?: string[];
}

export const CommentSection: React.FC<CommentSectionProps> = ({ photoId, itemId, itemType = 'photo', currentUser, photoLikes }) => {
  const actualItemId = itemId || photoId || '';
  // Map itemType to collection name: 'photo' -> 'photos', 'post' -> 'posts', 'video' -> 'videos'
  const collectionName = itemType === 'video' ? 'videos' : itemType === 'post' ? 'posts' : 'photos';
  const { comments, loading, addComment, deleteComment, editComment, toggleCommentLike } = useComments(actualItemId, collectionName);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyToName, setReplyToName] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_CHARS = 500;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || newComment.length > MAX_CHARS) return;

    setIsSubmitting(true);
    try {
      // If replying, add mention with comma
      const commentText = replyToId ? `@${replyToName}, ${newComment}` : newComment;
      await addComment(commentText, currentUser);

      // Clear input and reset state after successful submission
      // Use setTimeout to ensure this runs after React's batched updates
      setTimeout(() => {
        setNewComment('');
        setReplyToId(null);
        setReplyToName('');
        // Reset textarea height and force clear
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.value = '';
          textareaRef.current.blur(); // Remove focus to ensure state updates
        }
      }, 0);
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const cursorPos = textareaRef.current?.selectionStart || newComment.length;
    const newText =
      newComment.slice(0, cursorPos) +
      emoji +
      newComment.slice(cursorPos);

    if (newText.length <= MAX_CHARS) {
      setNewComment(newText);
      // Focus back on textarea
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = cursorPos + emoji.length;
          textareaRef.current.selectionEnd = cursorPos + emoji.length;
        }
      }, 0);
    }
  };

  const handleStartEdit = (commentId: string, currentText: string) => {
    setEditingCommentId(commentId);
    setEditText(currentText);
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editText.trim()) {
      setEditingCommentId(null);
      return;
    }
    try {
      await editComment(commentId, editText);
      setEditingCommentId(null);
      setEditText('');
    } catch (error) {
      console.error('Failed to save edit:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditText('');
  };

  const handleReply = (commentId: string, userName: string) => {
    setReplyToId(commentId);
    setReplyToName(userName);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Comment List */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {loading ? (
          <div className="text-center py-10">
            <div className="inline-block w-6 h-6 border-2 border-stone-200 border-t-orange-400 rounded-full animate-spin"></div>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-10 text-stone-400">
            <p className="text-sm">No comments yet. Be the first!</p>
          </div>
        ) : (
          comments.map((comment) => {
            const isLiked = currentUser && comment.likes?.includes(currentUser.id);
            const likeCount = comment.likes?.length || 0;

            return (
              <div key={comment.id} className="group flex gap-3 animate-fade-in-up">
                <img
                  src={comment.userAvatar}
                  alt={comment.userName}
                  className="w-8 h-8 rounded-full object-cover border border-stone-100 flex-shrink-0"
                />
                <div className="flex-1">
                  <div className="bg-stone-50 rounded-2xl rounded-tl-none p-3 px-4">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold text-sm text-stone-800">{comment.userName}</span>
                      <span className="text-[10px] text-stone-400">
                        {formatRelativeTime(comment.createdAt)}
                        {comment.updatedAt && ' (edited)'}
                      </span>
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full text-sm text-stone-600 bg-white border border-stone-200 rounded-lg p-2 focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(comment.id)}
                            className="text-[11px] font-medium text-orange-500 hover:text-orange-600 px-2 py-1 rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-[11px] font-medium text-stone-400 hover:text-stone-600 px-2 py-1 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-stone-600 leading-relaxed break-words whitespace-pre-wrap">
                        {comment.text.split(/(@[^,]+,)/).map((part, i) =>
                          part.match(/@[^,]+,/) ? (
                            <span key={i} className="text-blue-600 font-semibold">{part}</span>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </p>
                    )}
                  </div>

                  {/* Actions Line */}
                  {editingCommentId !== comment.id && (
                    <div className="flex items-center gap-4 mt-2 ml-2">
                      <button
                        onClick={() => currentUser && toggleCommentLike(comment.id, currentUser.id)}
                        disabled={!currentUser}
                        className={`flex items-center gap-1.5 text-sm font-semibold transition-all ${isLiked ? 'text-red-500' : 'text-stone-500 hover:text-red-400'
                          } disabled:opacity-50`}
                      >
                        <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} strokeWidth={2.5} />
                        {likeCount > 0 && <span>{likeCount}</span>}
                      </button>
                      <button
                        onClick={() => handleReply(comment.id, comment.userName)}
                        className="text-sm font-semibold text-stone-500 hover:text-stone-700"
                      >
                        Reply
                      </button>
                      {currentUser?.id === comment.userId && (
                        <>
                          <button
                            onClick={() => handleStartEdit(comment.id, comment.text)}
                            className="text-sm font-semibold text-stone-500 hover:text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                          >
                            <Edit2 size={14} className="inline" />
                            Edit
                          </button>
                          <button
                            onClick={() => deleteComment(comment.id)}
                            className="text-sm font-semibold text-red-400 hover:text-red-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 border-t border-stone-100 bg-white">
        {currentUser ? (
          <>
            {replyToId && (
              <div className="mb-2 flex items-center justify-between text-xs text-stone-500 bg-orange-50 px-3 py-2 rounded-lg">
                <span>Replying to <strong>{replyToName}</strong></span>
                <button
                  onClick={() => { setReplyToId(null); setReplyToName(''); }}
                  className="text-stone-400 hover:text-stone-600 font-bold"
                >
                  ✕
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex gap-2 items-end">
                <img src={currentUser.avatar} className="w-8 h-8 rounded-full mb-2 hidden sm:block" />
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={newComment}
                    onChange={(e) => {
                      if (e.target.value.length <= MAX_CHARS) {
                        setNewComment(e.target.value);
                      }
                    }}
                    placeholder="Add a comment..."
                    className={`w-full bg-stone-50 border rounded-2xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all resize-none custom-scrollbar ${newComment.length >= MAX_CHARS
                      ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                      : 'border-stone-200 focus:border-orange-300'
                      }`}
                    rows={1}
                    style={{ minHeight: '46px', maxHeight: '100px' }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />

                  <div className="absolute right-3 top-3">
                    <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting || newComment.length > MAX_CHARS}
                  className="mb-1 p-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
              <p className={`text-[10px] mt-2 pl-10 text-right ${newComment.length >= MAX_CHARS ? 'text-red-500 font-semibold' : 'text-stone-400'
                }`}>
                {newComment.length}/{MAX_CHARS}
              </p>
            </form>
          </>
        ) : (
          <p className="text-center text-sm text-stone-400">
            Please sign in to comment
          </p>
        )}
      </div>
    </div>
  );
};