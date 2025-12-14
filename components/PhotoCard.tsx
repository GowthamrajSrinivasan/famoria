import React, { useState, useEffect } from 'react';
import { Post, Photo, User } from '../types';
import { MessageCircle, Calendar, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { LikeButton } from './LikeButton';
import { useAuth } from '../context/AuthContext';

interface PhotoCardProps {
  photo: Post | Photo; // Accept both for backward compatibility
  onClick: (photo: Photo | Post) => void;
  currentUser: User | null;
}

// Type guard to check if it's a Post
function isPost(item: Post | Photo): item is Post {
  return 'photoIds' in item && Array.isArray((item as Post).photoIds);
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, currentUser }) => {
  const { getAlbumKey } = useAuth();

  // Carousel state (only for multi-image posts)
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [displayUrls, setDisplayUrls] = useState<string[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const post = isPost(photo) ? photo : null;
  const photoCount = post ? post.photoIds.length : 1;

  // Debug logging
  console.log(`[PhotoCard] Rendering item ${photo.id}:`, {
    isPost: !!post,
    photoIds: post?.photoIds,
    photoCount,
    caption: photo.caption
  });

  useEffect(() => {
    // Reset carousel when photo/post changes
    setCurrentImageIndex(0);
    setDisplayUrls([]);
    setIsDecrypting(false);
    setIsLocked(false);

    // Handle non-encrypted or non-post items
    if (!photo.isEncrypted || !photo.albumId) {
      setDisplayUrls([photo.url || '']);
      return;
    }

    // Check if we have access to the album
    const albumKey = getAlbumKey(photo.albumId);
    if (!albumKey) {
      setIsLocked(true);
      return;
    }

    // Decrypt photos
    const decryptPhotos = async () => {
      setIsDecrypting(true);
      try {
        const { cacheService } = await import('../services/cacheService');
        const { storageService } = await import('../services/storageService');
        const { photoService } = await import('../services/photoService');

        if (post) {
          // Multi-image post - decrypt all photos
          console.log(`[PhotoCard] Decrypting post ${post.id} with ${post.photoIds.length} photos`);

          const urls: string[] = [];

          // Get all photos for this post from the album
          const postPhotos = await photoService.getPostPhotos(photo.albumId!, post.id);

          for (let i = 0; i < postPhotos.length; i++) {
            const photoData = postPhotos[i];
            const photoId = photoData.id;

            console.log(`[PhotoCard] Decrypting photo ${i + 1}/${postPhotos.length}: ${photoId}`);

            // Check cache first
            let imageBlob = await cacheService.getCachedDecryptedPhoto(photoId, 'thumbnail');

            if (imageBlob) {
              console.log(`[PhotoCard] Cache hit for thumbnail ${photoId}`);
              urls.push(URL.createObjectURL(imageBlob));
            } else {
              console.log(`[PhotoCard] Cache miss for ${photoId}, decrypting...`);

              // Import crypto modules
              const photoKeyModule = await import('../lib/crypto/photoKey');
              const photoCryptoModule = await import('../lib/crypto/photoCrypto');

              // Derive photo key
              const photoKey = await photoKeyModule.derivePhotoKey(albumKey, photoId);

              const pathToLoad = photoData.thumbnailPath || photoData.encryptedPath;

              if (!pathToLoad) {
                console.error(`[PhotoCard] No file path found for photo ${photoId}`);
                continue;
              }

              // Download and decrypt
              const encryptedBlob = await storageService.downloadBlob(pathToLoad);
              imageBlob = await photoCryptoModule.decryptFile(encryptedBlob, photoKey);
              const decryptedUrl = URL.createObjectURL(imageBlob);
              urls.push(decryptedUrl);

              // Cache the decrypted thumbnail
              await cacheService.setCachedDecryptedPhoto(photoId, photo.albumId!, imageBlob, 'thumbnail');
            }
          }

          setDisplayUrls(urls);
          console.log(`[PhotoCard] Post decrypted successfully: ${urls.length} images`);
        } else {
          // Single photo (legacy)
          const photoId = (photo as any).albumPhotoId || photo.id;
          console.log(`[PhotoCard] Decrypting single photo: ${photoId}`);

          let imageBlob = await cacheService.getCachedDecryptedPhoto(photoId, 'thumbnail');

          if (!imageBlob) {
            const photoKeyModule = await import('../lib/crypto/photoKey');
            const photoCryptoModule = await import('../lib/crypto/photoCrypto');
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
              const photoKey = await photoKeyModule.derivePhotoKey(albumKey, actualPhotoId);
              const pathToLoad = photoDoc.thumbnailPath || photoDoc.encryptedPath;

              if (pathToLoad) {
                const encryptedBlob = await storageService.downloadBlob(pathToLoad);
                imageBlob = await photoCryptoModule.decryptFile(encryptedBlob, photoKey);
                await cacheService.setCachedDecryptedPhoto(actualPhotoId, photo.albumId, imageBlob, 'thumbnail');
              }
            }
          }

          if (imageBlob) {
            setDisplayUrls([URL.createObjectURL(imageBlob)]);
          }
        }
      } catch (err) {
        console.error('[PhotoCard] Failed to decrypt:', err);
        setIsLocked(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    decryptPhotos();
  }, [photo.id, photo.isEncrypted, photo.albumId, getAlbumKey]);

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? photoCount - 1 : prev - 1));
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === photoCount - 1 ? 0 : prev + 1));
  };

  return (
    <div
      className="group relative break-inside-avoid mb-6 rounded-3xl overflow-hidden bg-white shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.1)] transition-all duration-300 border border-stone-100/50 hover:-translate-y-1 cursor-pointer"
      onClick={() => onClick(photo)}
    >
      <div className="relative">
        {isDecrypting ? (
          <div className="w-full aspect-square bg-stone-100 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : isLocked ? (
          <div className="w-full aspect-square bg-stone-100 flex flex-col items-center justify-center">
            <Lock size={32} className="text-stone-300 mb-2" />
            <p className="text-xs text-stone-400">Encrypted</p>
          </div>
        ) : displayUrls.length > 0 ? (
          <>
            <img
              src={displayUrls[currentImageIndex]}
              alt={photo.caption}
              className="w-full h-auto object-cover"
              loading="lazy"
            />

            {/* Multi-image indicator */}
            {photoCount > 1 && (
              <>
                {/* Image counter badge */}
                <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full font-bold backdrop-blur-sm">
                  {currentImageIndex + 1}/{photoCount}
                </div>

                {/* Navigation arrows (show on hover for desktop) */}
                {photoCount > 1 && (
                  <>
                    <button
                      onClick={handlePrevImage}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={20} className="text-stone-800" />
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      aria-label="Next image"
                    >
                      <ChevronRight size={20} className="text-stone-800" />
                    </button>
                  </>
                )}

                {/* Pagination dots */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {Array.from({ length: Math.min(photoCount, 10) }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all ${idx === currentImageIndex
                        ? 'w-6 bg-white'
                        : 'w-1.5 bg-white/50'
                        }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : null}

        {/* Gradient Overlay on Hover */}
        {!isDecrypting && !isLocked && displayUrls.length > 0 && (
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
        )}
      </div>

      <div className="p-5">
        <p className="text-stone-800 font-medium text-[15px] leading-relaxed mb-4 line-clamp-2">
          {photo.caption}
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {(photo.tags || []).slice(0, 3).map((tag, idx) => (
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