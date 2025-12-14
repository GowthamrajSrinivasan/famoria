import React, { useState, useEffect } from 'react';
import { X, Calendar, Share2, MoreVertical, Sparkles, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Photo, Post, User } from '../types';
import { CommentSection } from './CommentSection';
import { LikeButton } from './LikeButton';
import { EditPhotoModal } from './EditPhotoModal';
import { photoService } from '../services/photoService';
import { useAuth } from '../context/AuthContext';

interface PhotoLightboxProps {
  photo: Photo | Post; // Accept both Photo and Post
  currentUser: User | null;
  onClose: () => void;
  onPhotoUpdate?: (photo: Photo) => void;
  onPhotoDelete?: () => void;
}

// Type guard
function isPost(item: Photo | Post): item is Post {
  return 'photoIds' in item && Array.isArray((item as Post).photoIds);
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photo, currentUser, onClose, onPhotoUpdate, onPhotoDelete }) => {
  const { getAlbumKey } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Carousel state for posts
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [displayUrls, setDisplayUrls] = useState<string[]>([]);
  const [isDecryptingFullRes, setIsDecryptingFullRes] = useState(false);

  const post = isPost(photo) ? photo : null;
  const photoCount = post ? post.photoIds.length : 1;

  // Decrypt images (single photo or multiple for post)
  useEffect(() => {
    setCurrentImageIndex(0);
    setDisplayUrls([]);
    setIsDecryptingFullRes(false);

    if (!photo.isEncrypted || !photo.albumId) {
      setDisplayUrls([photo.url || '']);
      return;
    }

    const albumKey = getAlbumKey(photo.albumId);
    if (!albumKey) {
      setDisplayUrls([photo.url || '']);
      return;
    }

    const decryptImages = async () => {
      setIsDecryptingFullRes(true);
      try {
        const { cacheService } = await import('../services/cacheService');
        const { storageService } = await import('../services/storageService');
        const { photoService } = await import('../services/photoService');

        if (post) {
          // Multi-image post
          console.log(`[PhotoLightbox] Decrypting post ${post.id} with ${post.photoIds.length} photos`);

          const urls: string[] = [];
          const postPhotos = await photoService.getPostPhotos(photo.albumId!, post.id);

          for (let i = 0; i < postPhotos.length; i++) {
            const photoData = postPhotos[i];
            const photoId = photoData.id;

            // Check cache for full-res
            let imageBlob = await cacheService.getCachedDecryptedPhoto(photoId, 'full');

            if (!imageBlob) {
              const photoKeyModule = await import('../lib/crypto/photoKey');
              const photoCryptoModule = await import('../lib/crypto/photoCrypto');

              const photoKey = await photoKeyModule.derivePhotoKey(albumKey, photoId);
              const pathToLoad = photoData.encryptedPath;

              if (pathToLoad) {
                const encryptedBlob = await storageService.downloadBlob(pathToLoad);
                imageBlob = await photoCryptoModule.decryptFile(encryptedBlob, photoKey);
                await cacheService.setCachedDecryptedPhoto(photoId, photo.albumId!, imageBlob, 'full');
              }
            }

            if (imageBlob) {
              urls.push(URL.createObjectURL(imageBlob));
            }
          }

          setDisplayUrls(urls);
          console.log(`[PhotoLightbox] Post decrypted: ${urls.length} full-res images`);
        } else {
          // Single photo
          const photoId = (photo as any).albumPhotoId || photo.id;
          let imageBlob = await cacheService.getCachedDecryptedPhoto(photoId, 'full');

          if (!imageBlob) {
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');

            const photoQuery = query(
              collection(db, 'albums', photo.albumId, 'photos'),
              where('__name__', '==', photoId)
            );
            const snapshot = await getDocs(photoQuery);

            if (!snapshot.empty) {
              const photoDoc = snapshot.docs[0].data();
              const actualPhotoId = photoDoc.id;

              const photoKeyModule = await import('../lib/crypto/photoKey');
              const photoCryptoModule = await import('../lib/crypto/photoCrypto');
              const photoKey = await photoKeyModule.derivePhotoKey(albumKey, actualPhotoId);

              const pathToLoad = photoDoc.encryptedPath;
              if (pathToLoad) {
                const encryptedBlob = await storageService.downloadBlob(pathToLoad);
                imageBlob = await photoCryptoModule.decryptFile(encryptedBlob, photoKey);
                await cacheService.setCachedDecryptedPhoto(actualPhotoId, photo.albumId, imageBlob, 'full');
              }
            }
          }

          if (imageBlob) {
            setDisplayUrls([URL.createObjectURL(imageBlob)]);
          }
        }
      } catch (err) {
        console.error('[PhotoLightbox] Failed to decrypt:', err);
        setDisplayUrls([photo.url || '']);
      } finally {
        setIsDecryptingFullRes(false);
      }
    };

    decryptImages();
  }, [photo.id, photo.isEncrypted, photo.albumId, getAlbumKey]);

  // Close on Escape, navigate with arrow keys
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showEditModal) onClose();
      if (photoCount > 1) {
        if (e.key === 'ArrowLeft') handlePrevImage();
        if (e.key === 'ArrowRight') handleNextImage();
      }
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = 'unset';
    };
  }, [onClose, showEditModal, currentImageIndex, photoCount]);

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? photoCount - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === photoCount - 1 ? 0 : prev + 1));
  };

  const handleEditSave = (newPhoto: Photo) => {
    if (onPhotoUpdate) onPhotoUpdate(newPhoto);
    setShowEditModal(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!photo.albumId) {
      alert('Cannot delete: Album information missing');
      return;
    }

    setIsDeleting(true);
    try {
      if (post) {
        // Delete entire post
        await photoService.deletePost(post.id, photo.albumId, post.photoIds);
      } else {
        // Delete single photo
        const encryptedPath = (photo as any).encryptedPath;
        await photoService.deletePhotoCompletely(photo.albumId, photo.id, encryptedPath);
      }

      if (onPhotoDelete) onPhotoDelete();
      onClose();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete. Please try again.');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (showEditModal) {
    return (
      <EditPhotoModal
        photo={post ? { ...photo, id: post.coverPhotoId } as Photo : photo as Photo}
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

        {/* Image Section */}
        <div className="flex-1 bg-black flex items-center justify-center relative group">
          {isDecryptingFullRes && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
                <span className="text-white text-sm">Loading full resolution...</span>
              </div>
            </div>
          )}

          {displayUrls.length > 0 && (
            <>
              <img
                src={displayUrls[currentImageIndex]}
                alt={photo.caption}
                className="max-w-full max-h-[50vh] md:max-h-full object-contain"
              />

              {/* Multi-image controls */}
              {photoCount > 1 && (
                <>
                  {/* Navigation arrows */}
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <ChevronLeft size={24} className="text-stone-800" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <ChevronRight size={24} className="text-stone-800" />
                  </button>

                  {/* Image counter */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1.5 rounded-full font-bold backdrop-blur-sm">
                    {currentImageIndex + 1} / {photoCount}
                  </div>

                  {/* Pagination dots */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                    {Array.from({ length: Math.min(photoCount, 10) }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentImageIndex(idx)}
                        className={`h-2 rounded-full transition-all ${idx === currentImageIndex
                            ? 'w-8 bg-white'
                            : 'w-2 bg-white/50 hover:bg-white/75'
                          }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
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

              {/* More Menu - Only for owner */}
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
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-stone-100 py-1 min-w-[140px] z-20 animate-fade-in-up">
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setShowDeleteConfirm(true);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          <span>{post ? 'Delete Post' : 'Delete Photo'}</span>
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
              {(photo as any).isAiGenerated && (
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

              {/* Edit Button - only for single photos */}
              {!post && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-stone-900 text-white shadow-md hover:bg-stone-700 hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Sparkles size={16} className="text-orange-300" />
                  <span className="text-sm font-medium">Edit with AI</span>
                </button>
              )}
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
            <h3 className="text-xl font-bold text-stone-800 mb-2">{post ? 'Delete Post?' : 'Delete Photo?'}</h3>
            <p className="text-stone-600 mb-6">
              {post
                ? `This will permanently delete this post and all ${photoCount} photos from your album and the family feed.`
                : 'This will permanently delete this photo from your album and the family feed.'
              } This action cannot be undone.
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