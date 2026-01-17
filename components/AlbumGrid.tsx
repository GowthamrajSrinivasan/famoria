import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, FolderOpen, ArrowUpDown } from 'lucide-react';
import { Album } from '../types';
import { AlbumCard } from './AlbumCard';
import { subscribeToAlbums, deleteAlbum } from '../services/albumService';
import { useAuth } from '../context/AuthContext';
import * as photoCrypto from '../lib/crypto/photoCrypto';

interface AlbumGridProps {
    currentUserId?: string;
    onCreateAlbum: () => void;
    onEditAlbum: (album: Album) => void;
    onViewAlbum: (album: Album) => void;
}

export const AlbumGrid: React.FC<AlbumGridProps> = ({
    currentUserId,
    onCreateAlbum,
    onEditAlbum,
    onViewAlbum
}) => {
    const { t } = useTranslation();
    const [albums, setAlbums] = useState<Album[]>([]);
    const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'photos' | 'videos'>('newest');
    const [loading, setLoading] = useState(true);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const { familyKey } = useAuth();

    useEffect(() => {
        if (!currentUserId) {
            setLoading(false);
            return;
        }

        const unsubscribe = subscribeToAlbums(
            currentUserId,
            async (fetchedAlbums) => {
                // Decrypt albums if familyKey is available
                const decrypted = await Promise.all(fetchedAlbums.map(async (album) => {
                    if (familyKey && album.encryptedName) {
                        try {
                            const metadata = await photoCrypto.decryptMetadata({
                                encrypted: album.encryptedName,
                                iv: album.metadataIv!,
                                authTag: album.metadataAuthTag!
                            }, familyKey);
                            return {
                                ...album,
                                name: metadata.name,
                                description: metadata.description
                            };
                        } catch (err) {
                            console.error(`[AlbumGrid] Failed to decrypt album ${album.id}:`, err);
                            return album;
                        }
                    }
                    return album;
                }));

                setAlbums(decrypted);
                setLoading(false);
            },
            (error) => {
                console.error('Error subscribing to albums:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUserId, familyKey]);

    // Search and sort functionality
    useEffect(() => {
        let result = albums;

        // Apply search filter (client-side)
        if (searchTerm.trim()) {
            const query = searchTerm.toLowerCase();
            result = albums.filter(album =>
                album.name.toLowerCase().includes(query) ||
                album.description?.toLowerCase().includes(query)
            );
        }

        // Apply sorting
        const sorted = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return b.updatedAt - a.updatedAt;
                case 'oldest':
                    return a.createdAt - b.createdAt;
                case 'photos':
                    return (b.photoCount || 0) - (a.photoCount || 0);
                case 'videos':
                    return (b.videoCount || 0) - (a.videoCount || 0);
                default:
                    return 0;
            }
        });

        setFilteredAlbums(sorted);
    }, [searchTerm, albums, sortBy]);

    const handleDelete = async (albumId: string) => {
        if (isDeleting) return; // Prevent double-click

        setIsDeleting(true);
        try {
            console.log('Starting album deletion:', albumId);
            await deleteAlbum(albumId);
            console.log('Album deleted successfully');
            setDeleteConfirm(null);
        } catch (error: any) {
            console.error('Error deleting album:', error);
            const errorMessage = error?.message || 'Unknown error occurred';
            alert(`Failed to delete album:\n${errorMessage}\n\nPlease check the console for more details.`);
        } finally {
            setIsDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-stone-800">{t('album_grid_title')}</h1>
                    <p className="text-stone-500 mt-1">{t('album_grid_subtitle')}</p>
                </div>

                <button
                    onClick={onCreateAlbum}
                    className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                >
                    <Plus size={20} />
                    <span>{t('create_album')}</span>
                </button>
            </div>

            {/* Search Bar and Sort */}
            {albums.length > 0 && (
                <div className="mb-6 flex flex-col sm:flex-row gap-4">
                    {/* Search Bar */}
                    <div className="flex-1 relative">
                        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={t('search_albums_placeholder')}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all"
                        />
                    </div>

                    {/* Sort Dropdown */}
                    <div className="flex items-center gap-3">
                        <ArrowUpDown size={16} className="text-stone-400" />
                        <span className="text-sm font-medium text-stone-600">{t('sort_by')}</span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all cursor-pointer hover:border-stone-300"
                        >
                            <option value="newest">{t('sort_newest')}</option>
                            <option value="oldest">{t('sort_oldest')}</option>
                            <option value="photos">{t('sort_most_photos')}</option>
                            <option value="videos">{t('sort_most_videos')}</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Albums Grid */}
            {filteredAlbums.length === 0 ? (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                        <FolderOpen size={40} className="text-stone-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-stone-700 mb-2">
                        {searchTerm ? t('no_albums_found') : t('no_albums_yet')}
                    </h3>
                    <p className="text-stone-500 mb-6">
                        {searchTerm
                            ? t('hint_search')
                            : t('hint_create_first_album')}
                    </p>
                    {!searchTerm && (
                        <button
                            onClick={onCreateAlbum}
                            className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 inline-flex items-center gap-2 font-medium"
                        >
                            <Plus size={20} />
                            <span>{t('create_first_album')}</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredAlbums.map((album) => (
                        <AlbumCard
                            key={album.id}
                            album={album}
                            currentUserId={currentUserId}
                            onClick={() => onViewAlbum(album)}
                            onEdit={() => onEditAlbum(album)}
                            onDelete={() => setDeleteConfirm(album.id)}
                        />
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-bold text-stone-800 mb-2">{t('delete_album_title')}</h3>
                        <p className="text-stone-600 mb-2">
                            <span dangerouslySetInnerHTML={{ __html: t('delete_album_message') }}></span>
                        </p>
                        <p className="text-red-600 text-sm font-medium mb-6">
                            {t('delete_album_warning')}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl hover:bg-stone-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium disabled:bg-red-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>{t('deleting')}</span>
                                    </>
                                ) : (
                                    t('delete')
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
