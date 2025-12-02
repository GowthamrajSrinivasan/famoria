import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Trash2, MoreHorizontal } from 'lucide-react';
import { useComments, formatRelativeTime } from '../hooks/useInteractions';
import { User } from '../types';

interface CommentSectionProps {
  photoId: string;
  currentUser: User | null;
}

export const CommentSection: React.FC<CommentSectionProps> = ({ photoId, currentUser }) => {
  const { comments, loading, addComment, deleteComment } = useComments(photoId);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;

    setIsSubmitting(true);
    try {
      await addComment(newComment, currentUser);
      setNewComment('');
      // Scroll to top of comments or bottom depending on preference. 
      // Typically new comments are at bottom, but we sort by new at top in service for display
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Comment List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {loading ? (
          <div className="text-center py-10">
            <div className="inline-block w-6 h-6 border-2 border-stone-200 border-t-orange-400 rounded-full animate-spin"></div>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-10 text-stone-400">
            <p className="text-sm">No comments yet. Be the first!</p>
          </div>
        ) : (
          comments.map((comment) => (
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
                    <span className="text-[10px] text-stone-400">{formatRelativeTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-stone-600 leading-relaxed break-words">{comment.text}</p>
                </div>
                
                {/* Actions Line */}
                <div className="flex items-center gap-4 mt-1 ml-2">
                   <button className="text-[11px] font-medium text-stone-400 hover:text-stone-600">Like</button>
                   <button className="text-[11px] font-medium text-stone-400 hover:text-stone-600">Reply</button>
                   {currentUser?.id === comment.userId && (
                      <button 
                        onClick={() => deleteComment(comment.id)}
                        className="text-[11px] font-medium text-red-300 hover:text-red-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={10} /> Delete
                      </button>
                   )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-stone-100 bg-white">
        {currentUser ? (
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex gap-2 items-end">
               <img src={currentUser.avatar} className="w-8 h-8 rounded-full mb-2 hidden sm:block" />
               <div className="flex-1 relative">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all resize-none custom-scrollbar"
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
                  <button 
                    type="button"
                    className="absolute right-3 top-3 text-stone-400 hover:text-orange-500 transition-colors"
                  >
                    <Smile size={20} />
                  </button>
               </div>
               <button 
                 type="submit" 
                 disabled={!newComment.trim() || isSubmitting}
                 className="mb-1 p-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
               >
                 {isSubmitting ? (
                   <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 ) : (
                   <Send size={18} />
                 )}
               </button>
            </div>
            <p className="text-[10px] text-stone-400 mt-2 pl-10 text-right">
              {newComment.length}/500
            </p>
          </form>
        ) : (
          <p className="text-center text-sm text-stone-400 py-2">
            Please sign in to comment
          </p>
        )}
      </div>
    </div>
  );
};