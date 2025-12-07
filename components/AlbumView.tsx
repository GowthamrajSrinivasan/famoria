import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, Edit, Trash2, MoreVertical, Image as ImageIcon } from 'lucide-react';
import { Album, Photo, User } from '../types';
import { PhotoCard } from './PhotoCard';

interface AlbumViewProps {
    album: Album;
    currentUserId?: string;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onUpload: () => void;
    onPhotoClick: (photo: Photo) => void;
    onPhotoDelete?: (photoId: string) => void;
}

export const AlbumView: React.FC<AlbumViewProps> = ({
    album,
    currentUserId,
    onBack,
    onEdit,
    onDelete,
    onUpload,
    onPhotoClick,
    onPhotoDelete
}) => {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showMenu, setShowMenu] = useState(false);

    const isOwner = currentUserId === album.createdBy;

    // TODO: Fetch photos from Firestore where albumId === album.id
    useEffect(() => {
        // Placeholder - integrate with photoService
        setLoading(false);
    }, [album.id]);

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-stone-600 hover:text-stone-800 mb-4 group"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Albums</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-stone-800 mb-2">{album.name}</h1>
                        {album.description && (
                            <p className="text-stone-600 mb-3">{album.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-stone-500">
                            <span className="flex items-center gap-1.5">
                                <ImageIcon size={16} />
                                {album.photoCount || 0} photos
                            </span>
                            <span>•</span>
                            <span className="capitalize">{album.privacy}</span>
                            {album.members.length > 1 && (
                                <>
                                    <span>•</span>
                                    <span>{album.members.length} members</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onUpload}
                            className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                        >
                            <Upload size={20} />
                            <span>Upload Photos</span>
                        </button>

                        {isOwner && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    className="p-3 hover:bg-stone-100 rounded-xl transition-colors"
                                >
                                    <MoreVertical size={20} className="text-stone-600" />
                                </button>

                                {showMenu && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={() => setShowMenu(false)}
                                        />

                                        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-stone-100 py-1 min-w-[160px] z-20 animate-fade-in-up">
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    onEdit();
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
                                            >
                                                <Edit size={14} />
                                                <span>Edit Album</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowMenu(false);
                                                    onDelete();
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Trash2 size={14} />
                                                <span>Delete Album</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Photos Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="w-12 h-12 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
                </div>
            ) : photos.length === 0 ? (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                        <ImageIcon size={40} className="text-stone-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-stone-700 mb-2">No photos yet</h3>
                    <p className="text-stone-500 mb-6">Start adding photos to this album</p>
                    <button
                        onClick={onUpload}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 inline-flex items-center gap-2 font-medium"
                    >
                        <Upload size={20} />
                        <span>Upload Photos</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {photos.map((photo) => (
                        <PhotoCard
                            key={photo.id}
                            photo={photo}
                            onClick={() => onPhotoClick(photo)}
                            currentUser={{ id: currentUserId || '', name: '', email: null, avatar: '' } as User}
                            onDelete={onPhotoDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
