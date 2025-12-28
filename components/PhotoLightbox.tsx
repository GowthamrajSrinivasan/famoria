import React, { useState, useEffect } from 'react';
import { X, Calendar, Share2, MoreVertical, Sparkles, Trash2, Loader2, ChevronLeft, ChevronRight, Edit2, MessageCircle } from 'lucide-react';
import { Photo, Post, User } from '../types';
import { CommentSection } from './CommentSection';
import { LikeButton } from './LikeButton';
import { LikesPreview } from './LikesPreview';
import { LikesModal } from './LikesModal';
import { EditPhotoModal } from './EditPhotoModal';
import { photoService } from '../services/photoService';
import { cacheService } from '../services/cacheService';
import { storageService } from '../services/storageService';
import * as photoKeyModule from '../lib/crypto/photoKey';
import * as photoCryptoModule from '../lib/crypto/photoCrypto';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
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
  const [showLikesModal, setShowLikesModal] = useState(false);

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
      if ('url' in photo) {
        setDisplayUrls([photo.url || '']);
      }
      return;
    }

    const albumKey = getAlbumKey(photo.albumId);
    if (!albumKey) {
      if ('url' in photo) {
        setDisplayUrls([photo.url || '']);
      }
      return;
    }

    const decryptImages = async () => {
      setIsDecryptingFullRes(true);
      try {


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


            const photoQuery = query(
              collection(db, 'albums', photo.albumId, 'photos'),
              where('__name__', '==', photoId)
            );
            const snapshot = await getDocs(photoQuery);

            if (!snapshot.empty) {
              const photoDoc = snapshot.docs[0].data();
              const actualPhotoId = photoDoc.id;


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
        if ('url' in photo) {
          setDisplayUrls([photo.url || '']);
        }
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

      <div className="w-full max-w-7xl h-full max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">

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
                className="w-full h-full object-contain"
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
        <div className="w-full md:w-[480px] lg:w-[520px] flex flex-col bg-white border-l border-stone-100">

          {/* Right Sidebar - Info + Comments */}
          <div className="w-full h-full flex flex-col bg-white">
            {/* Top Section - Photo info and actions (fixed height) */}
            <div className="flex-shrink-0 p-6 space-y-5 border-b border-stone-100">
              {/* Author & Date */}
              <div className="flex items-center gap-3">
                <img
                  src={photo.authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(photo.author)}&background=f97316&color=fff`}
                  alt={photo.author}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-800 truncate">{photo.author}</p>
                  <p className="text-xs text-stone-400">
                    {new Date(photo.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </div>

                {/* More Options Menu */}
                {currentUser?.id === photo.authorId && (
                  <div className="relative">
                    <button
                      onClick={() => setShowMenu(!showMenu)}
                      className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                      <MoreVertical size={18} className="text-stone-400" />
                    </button>

                    {showMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowMenu(false)}
                        />
                        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-stone-100 py-1 z-20 min-w-[160px]">
                          <button
                            onClick={() => {
                              setShowEditModal(true);
                              setShowMenu(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
                          >
                            <Edit2 size={16} />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setShowDeleteConfirm(true);
                              setShowMenu(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Caption */}
              <p className="text-stone-700 text-sm leading-relaxed">{photo.caption}</p>

              {/* Tags */}
              {photo.tags && photo.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photo.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <LikeButton
                  photoId={photo.id}
                  currentUserId={currentUser?.id}
                  itemType={post ? 'post' : 'photo'}
                  variant="lightbox"
                  showCount={true}
                />
                <button className="p-2.5 hover:bg-stone-100 text-stone-600 rounded-lg transition-colors">
                  <Share2 size={20} />
                </button>
              </div>

              {/* Reactions Section - Compact */}
              {photo.likes && photo.likes.length > 0 && (
                <div className="pt-3 border-t border-stone-100">
                  <LikesPreview
                    photoId={photo.id}
                    likes={photo.likes}
                    onClick={() => setShowLikesModal(true)}
                  />
                </div>
              )}
            </div>

            {/* Comments - Takes remaining space */}
            <div className="flex-1 overflow-hidden relative bg-stone-50/30 min-h-0">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
              <CommentSection
                photoId={photo.id}
                itemType={post ? 'post' : 'photo'}
                currentUser={currentUser}
              />
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

        {/* Likes Modal */}
        {showLikesModal && (
          <LikesModal
            likes={photo.likes || []}
            onClose={() => setShowLikesModal(false)}
          />
        )}
      </div>
    </div>
  );
};