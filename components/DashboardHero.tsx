import React, { useEffect, useState } from 'react';
import { Post, ViewState } from '../types';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { photoService } from '../services/photoService';
import { cacheService } from '../services/cacheService';
import { storageService } from '../services/storageService';
import * as photoKeyModule from '../lib/crypto/photoKey';
import * as photoCryptoModule from '../lib/crypto/photoCrypto';

interface DashboardHeroProps {
    post?: Post;
}

export const DashboardHero: React.FC<DashboardHeroProps> = ({ post }) => {
    const { t } = useTranslation();
    const { familyKey } = useAuth();
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [decryptedCaption, setDecryptedCaption] = useState(post?.caption || '');

    // Date formatting
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    useEffect(() => {
        let isMounted = true;

        const loadHeroImage = async () => {
            if (!post) {
                setImageUrl(null);
                setDecryptedCaption('');
                return;
            }

            setDecryptedCaption(post.caption || '');

            try {
                // 1. If it has a direct public URL (legacy), use it
                // Typings might be tricky if 'url' isn't on Post, but let's check
                if ('url' in post && (post as any).url) {
                    if (isMounted) setImageUrl((post as any).url);
                    return;
                }

                // 2. Encryption Check
                if (post.isEncrypted !== false && post.albumId && familyKey) {
                    // NEW: Decrypt metadata
                    if ((post as any).encryptedMetadata) {
                        try {
                            const postKey = await photoKeyModule.derivePhotoKey(familyKey, post.id);
                            const metadata = await photoCryptoModule.decryptMetadata({
                                encrypted: (post as any).encryptedMetadata,
                                iv: (post as any).metadataIv,
                                authTag: (post as any).metadataAuthTag
                            }, postKey);
                            if (isMounted) setDecryptedCaption(metadata.caption || post.caption || '');
                        } catch (err) {
                            console.error('[DashboardHero] Failed to decrypt metadata', err);
                        }
                    }

                    // Fetch photos for this post
                    const postPhotos = await photoService.getPostPhotos(post.albumId, post.id);
                    if (postPhotos.length === 0) return;

                    const photoData = postPhotos[0];
                    const photoId = photoData.id;

                    // Check cache
                    const cachedBlob = await cacheService.getCachedDecryptedPhoto(photoId, 'full');
                    if (cachedBlob && isMounted) {
                        setImageUrl(URL.createObjectURL(cachedBlob));
                        return;
                    }

                    // Decrypt
                    const photoKey = await photoKeyModule.derivePhotoKey(familyKey, photoId);
                    const pathToLoad = photoData.encryptedPath;

                    if (pathToLoad) {
                        const encryptedBlob = await storageService.downloadBlob(pathToLoad);
                        const imageBlob = await photoCryptoModule.decryptFile(encryptedBlob, photoKey);

                        // Cache it
                        await cacheService.setCachedDecryptedPhoto(photoId, post.albumId, imageBlob, 'full');

                        if (isMounted) {
                            setImageUrl(URL.createObjectURL(imageBlob));
                        }
                    }
                } else {
                    // Fallback for unencrypted but no direct URL on Post object (rare/legacy)
                    if (isMounted) setImageUrl(null);
                }

            } catch (error) {
                console.error('[DashboardHero] Failed to load hero image', error);
            }
        };

        loadHeroImage();

        return () => {
            isMounted = false;
        };
    }, [post, familyKey]);


    if (!post) {
        // Fallback/Empty State
        return (
            <div className="relative w-full h-full bg-stone-900 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center"></div>
                <div className="z-10 text-center text-white p-6">
                    <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">{t('welcome_famoria')}</h1>
                    <p className="text-xl opacity-80 mb-8">{t('start_creating_memories')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-stone-900 overflow-hidden group">
            {/* Background Image */}
            {imageUrl && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-[20s] ease-out group-hover:scale-105"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                />
            )}

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            {/* Content Overlay */}
            <div className="absolute bottom-0 left-0 w-full p-8 md:p-12 lg:p-16 flex flex-col md:flex-row items-end justify-between gap-6">

                {/* Text Content */}
                <div className="max-w-3xl animate-fade-in-up">
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-white mb-4 leading-tight shadow-sm/50 tracking-tight drop-shadow-md">
                        "{decryptedCaption || t('untitled_memory')}"
                    </h1>
                    <p className="text-lg md:text-xl text-white/80 font-medium drop-shadow-sm">
                        {formatDate(post.createdAt || Date.now())}
                    </p>
                </div>


            </div>
        </div>
    );
};
