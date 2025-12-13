import React, { useState, useEffect } from 'react';
import { Photo, User } from '../types';
import { Share2, MessageCircle, Calendar, Lock } from 'lucide-react';
import { LikeButton } from './LikeButton';
import { useAuth } from '../context/AuthContext';

interface PhotoCardProps {
  photo: Photo;
  onClick: (photo: Photo) => void;
  currentUser: User | null;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, currentUser }) => {
  const { getAlbumKey } = useAuth();
  const [displayUrl, setDisplayUrl] = useState<string>(photo.url);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    // Only decrypt if photo is marked as encrypted
    if (!photo.isEncrypted || !photo.albumId) {
      setDisplayUrl(photo.url);
      return;
    }

    // Check if we have access to the album
    const albumKey = getAlbumKey(photo.albumId);
    if (!albumKey) {
      setIsLocked(true);
      return;
    }

    // Decrypt the photo
    const decryptPhoto = async () => {
      setIsDecrypting(true);
      try {
        const { cacheService } = await import('../services/cacheService');
        const { storageService } = await import('../services/storageService');

        // Use albumPhotoId if available, otherwise use photo.id
        const photoId = photo.albumPhotoId || photo.id;
        console.log(`[PhotoCard] Decrypting photo - feedId: ${photo.id}, albumPhotoId: ${photo.albumPhotoId}, using: ${photoId}`);

        // Check cache first
        let imageBlob = await cacheService.getCachedDecryptedPhoto(photoId, 'thumbnail');

        if (imageBlob) {
          console.log(`[PhotoCard] Cache hit for thumbnail ${photoId}`);
          setDisplayUrl(URL.createObjectURL(imageBlob));
        } else {
          // Cache miss - need to decrypt
          console.log(`[PhotoCard] Cache miss for ${photoId}, decrypting...`);

          // Import crypto modules
          const photoKeyModule = await import('../lib/crypto/photoKey');
          const photoCryptoModule = await import('../lib/crypto/photoCrypto');

          // Load encrypted photo from the album subcollection
          // For feed photos, we need to fetch the actual encrypted data from the album
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase');

          // Fetch the photo document from album subcollection
          console.log(`[PhotoCard] Fetching photo from albums/${photo.albumId}/photos/${photoId}`);
          const photoQuery = query(
            collection(db, 'albums', photo.albumId, 'photos'),
            where('__name__', '==', photoId)
          );
          const snapshot = await getDocs(photoQuery);

          if (snapshot.empty) {
            console.error(`[PhotoCard] Photo ${photoId} not found in album ${photo.albumId}`);
            setIsLocked(true);
            return;
          }

          const photoDoc = snapshot.docs[0].data();
          console.log(`[PhotoCard] Photo document fetched, has thumbnailPath: ${!!photoDoc.thumbnailPath}, has encryptedPath: ${!!photoDoc.encryptedPath}`);

          // CRITICAL: Use the UUID from photoDoc.id, not the Firestore document ID!
          // The Firestore document ID is auto-generated, but encryption uses the UUID
          const actualPhotoId = photoDoc.id;
          console.log(`[PhotoCard] Using actual photoId for decryption: ${actualPhotoId} (Firestore doc ID was: ${photoId})`);

          // Derive photo key with the ACTUAL UUID used during encryption
          const photoKey = await photoKeyModule.derivePhotoKey(albumKey, actualPhotoId);

          const pathToLoad = photoDoc.thumbnailPath || photoDoc.encryptedPath;

          if (!pathToLoad) {
            console.error(`[PhotoCard] No file path found for photo ${photoId}`);
            setIsLocked(true);
            return;
          }

          console.log(`[PhotoCard] Loading encrypted blob from: ${pathToLoad}`);
          // Download and decrypt
          const encryptedBlob = await storageService.downloadBlob(pathToLoad);
          console.log(`[PhotoCard] Blob downloaded, size: ${encryptedBlob.size}, attempting decryption...`);
          imageBlob = await photoCryptoModule.decryptFile(encryptedBlob, photoKey);
          const decryptedUrl = URL.createObjectURL(imageBlob);
          setDisplayUrl(decryptedUrl);

          // Cache the decrypted thumbnail using the actual UUID
          await cacheService.setCachedDecryptedPhoto(actualPhotoId, photo.albumId, imageBlob, 'thumbnail');
          console.log(`[PhotoCard] Photo decrypted and cached successfully`);
        }
      } catch (err) {
        console.error('[PhotoCard] Failed to decrypt photo:', err);
        setIsLocked(true);
      } finally {
        setIsDecrypting(false);
      }
    };

    decryptPhoto();
  }, [photo.isEncrypted, photo.albumId, photo.id, photo.albumPhotoId, getAlbumKey]);

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
        ) : (
          <img
            src={displayUrl}
            alt={photo.caption}
            className="w-full h-auto object-cover"
            loading="lazy"
          />
        )}
        {/* Gradient Overlay on Hover */}
        {!isDecrypting && !isLocked && (
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