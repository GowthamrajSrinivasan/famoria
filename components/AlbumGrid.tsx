import React, { useState, useEffect } from 'react';
import { Plus, Search, FolderOpen } from 'lucide-react';
import { Album } from '../types';
import { AlbumCard } from './AlbumCard';
import { subscribeToAlbums, searchAlbums, deleteAlbum } from '../services/albumService';

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
    const [albums, setAlbums] = useState<Album[]>([]);
    const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!currentUserId) {
            setLoading(false);
            return;
        }

        const unsubscribe = subscribeToAlbums(
            currentUserId,
            (fetchedAlbums) => {
                setAlbums(fetchedAlbums);
                setLoading(false);
            },
            (error) => {
                console.error('Error subscribing to albums:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUserId]);

    // Search functionality
    useEffect(() => {
        if (!searchTerm.trim()) {
            setFilteredAlbums(albums);
        } else {
            const results = searchAlbums(albums, searchTerm);
            setFilteredAlbums(results);
        }
    }, [searchTerm, albums]);

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
                    <h1 className="text-3xl font-bold text-stone-800">My Albums</h1>
                    <p className="text-stone-500 mt-1">Organize your family memories</p>
                </div>

                <button
                    onClick={onCreateAlbum}
                    className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                >
                    <Plus size={20} />
                    <span>Create Album</span>
                </button>
            </div>

            {/* Search Bar */}
            {albums.length > 0 && (
                <div className="mb-6 relative">
                    <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search albums..."
                        className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all"
                    />
                </div>
            )}

            {/* Albums Grid */}
            {filteredAlbums.length === 0 ? (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                        <FolderOpen size={40} className="text-stone-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-stone-700 mb-2">
                        {searchTerm ? 'No albums found' : 'No albums yet'}
                    </h3>
                    <p className="text-stone-500 mb-6">
                        {searchTerm
                            ? 'Try a different search term'
                            : 'Create your first album to start organizing photos'}
                    </p>
                    {!searchTerm && (
                        <button
                            onClick={onCreateAlbum}
                            className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 inline-flex items-center gap-2 font-medium"
                        >
                            <Plus size={20} />
                            <span>Create Your First Album</span>
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
                        <h3 className="text-xl font-bold text-stone-800 mb-2">Delete Album?</h3>
                        <p className="text-stone-600 mb-2">
                            This will permanently delete this album and <strong>all photos and videos</strong> inside it.
                        </p>
                        <p className="text-red-600 text-sm font-medium mb-6">
                            ⚠️ This action cannot be undone!
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl hover:bg-stone-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium disabled:bg-red-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Deleting...</span>
                                    </>
                                ) : (
                                    'Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
