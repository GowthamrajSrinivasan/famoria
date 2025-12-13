import React, { useState } from 'react';
import { X, Calendar, Share2, MoreVertical, Sparkles, Trash2 } from 'lucide-react';
import { Photo, User } from '../types';
import { CommentSection } from './CommentSection';
import { LikeButton } from './LikeButton';
import { EditPhotoModal } from './EditPhotoModal';
import { photoService } from '../services/photoService';

interface PhotoLightboxProps {
  photo: Photo;
  currentUser: User | null;
  onClose: () => void;
  onPhotoUpdate?: (photo: Photo) => void; // Optional callback if we want to update the feed immediately
  onPhotoDelete?: () => void; // Optional callback after successful deletion
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photo, currentUser, onClose, onPhotoUpdate, onPhotoDelete }) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Close on Escape key
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showEditModal) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden'; // Lock scroll
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [onClose, showEditModal]);

  const handleEditSave = (newPhoto: Photo) => {
    if (onPhotoUpdate) {
      onPhotoUpdate(newPhoto);
    }
    // Close edit modal, keep lightbox open? Or close all?
    // Let's close edit modal and switch lightbox to new photo if we were passing state up, 
    // but for now, we'll just close the edit modal.
    setShowEditModal(false);
    onClose(); // Close lightbox to return to feed where new photo should be
  };

  const handleDelete = async () => {
    if (!photo.albumId) {
      alert('Cannot delete photo: Album information missing');
      return;
    }

    setIsDeleting(true);
    try {
      // Get encryptedPath from photo data if available
      const encryptedPath = (photo as any).encryptedPath;

      await photoService.deletePhotoCompletely(
        photo.albumId,
        photo.id,
        encryptedPath
      );

      // Notify parent and close
      if (onPhotoDelete) onPhotoDelete();
      onClose();
    } catch (error) {
      console.error('Failed to delete photo:', error);
      alert('Failed to delete photo. Please try again.');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (showEditModal) {
    return (
      <EditPhotoModal
        photo={photo}
        onClose={() => setShowEditModal(false)}
        onSave={handleEditSave}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/95 backdrop-blur-md p-4 sm:p-6 animate-fade-in-up">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all z-50"
      >
        <X size={24} />
      </button>

      <div className="w-full max-w-6xl h-full max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">

        {/* Image Section - Darker background for focus */}
        <div className="flex-1 bg-black flex items-center justify-center relative group">
          <img
            src={photo.url}
            alt={photo.caption}
            className="max-w-full max-h-[50vh] md:max-h-full object-contain"
          />
        </div>

        {/* Sidebar Section */}
        <div className="w-full md:w-[400px] lg:w-[450px] flex flex-col bg-white border-l border-stone-100">

          {/* Header */}
          <div className="p-6 border-b border-stone-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
                  {(photo.author || "?").charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-stone-800">{photo.author || "Unknown"}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-stone-400">
                    <Calendar size={12} />
                    <span>{photo.date}</span>
                  </div>
                </div>
              </div>

              {/* More Menu - Only for photo owner */}
              {currentUser?.id === photo.authorId && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="text-stone-400 hover:bg-stone-50 p-2 rounded-full transition-colors"
                  >
                    <MoreVertical size={20} />
                  </button>

                  {showMenu && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowMenu(false)}
                      />

                      {/* Menu */}
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-stone-100 py-1 min-w-[140px] z-20 animate-fade-in-up">
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setShowDeleteConfirm(true);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          <span>Delete Photo</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="text-stone-700 leading-relaxed text-[15px]">{photo.caption}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              {(photo.tags || []).map((tag, i) => (
                <span key={i} className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-1 rounded-md">
                  #{tag}
                </span>
              ))}
              {photo.isAiGenerated && (
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-md border border-purple-100 flex items-center gap-1">
                  <Sparkles size={10} /> AI Edited
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-50">
              <div className="flex gap-4">
                <LikeButton photoId={photo.id} currentUserId={currentUser?.id} variant="lightbox" />
                <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors">
                  <Share2 size={18} />
                </button>
              </div>

              {/* Edit Button */}
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-stone-900 text-white shadow-md hover:bg-stone-700 hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Sparkles size={16} className="text-orange-300" />
                <span className="text-sm font-medium">Edit with AI</span>
              </button>
            </div>
          </div>

          {/* Comments */}
          <div className="flex-1 overflow-hidden relative bg-stone-50/30">
            <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
            <CommentSection photoId={photo.id} currentUser={currentUser} />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-3xl">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-fade-in-up">
            <h3 className="text-xl font-bold text-stone-800 mb-2">Delete Photo?</h3>
            <p className="text-stone-600 mb-6">
              This will permanently delete this photo from your album and the family feed. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl hover:bg-stone-200 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};