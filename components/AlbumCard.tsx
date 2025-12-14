import React, { useState } from 'react';
import { MoreVertical, Trash2, Edit, Image as ImageIcon, Calendar } from 'lucide-react';
import { Album } from '../types';

interface AlbumCardProps {
    album: Album;
    currentUserId?: string;
    onClick: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}

// Helper to format relative time
const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);
    const months = Math.floor(diff / 2629800000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return new Date(timestamp).toLocaleDateString();
};

export const AlbumCard: React.FC<AlbumCardProps> = ({
    album,
    currentUserId,
    onClick,
    onEdit,
    onDelete
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const isOwner = currentUserId === album.createdBy;

    return (
        <div
            className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-stone-100"
            onClick={onClick}
        >
            {/* Cover Photo */}
            <div className="aspect-square bg-gradient-to-br from-stone-100 to-stone-200 relative overflow-hidden">
                {album.coverPhoto ? (
                    <img
                        src={album.coverPhoto}
                        alt={album.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={48} className="text-stone-300" />
                    </div>
                )}

                {/* Post Count Badge */}
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5">
                    <ImageIcon size={14} />
                    <span>{album.photoCount || 0} {(album.photoCount || 0) === 1 ? 'post' : 'posts'}</span>
                </div>

                {/* Last Updated Badge */}
                {album.updatedAt && (
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-stone-700 px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                        <Calendar size={12} />
                        <span>{formatRelativeTime(album.updatedAt)}</span>
                    </div>
                )}
            </div>

            {/* Album Info */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-stone-800 text-lg truncate">{album.name}</h3>
                        {album.description && (
                            <p className="text-sm text-stone-500 mt-1 line-clamp-2">{album.description}</p>
                        )}
                    </div>

                    {/* Actions Menu - Only for owner */}
                    {isOwner && (
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMenu(!showMenu);
                                }}
                                className="p-2 hover:bg-stone-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <MoreVertical size={18} className="text-stone-600" />
                            </button>

                            {showMenu && (
                                <>
                                    {/* Backdrop */}
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowMenu(false);
                                        }}
                                    />

                                    {/* Menu */}
                                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-stone-100 py-1 min-w-[140px] z-20 animate-fade-in-up">
                                        {onEdit && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowMenu(false);
                                                    onEdit();
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
                                            >
                                                <Edit size={14} />
                                                <span>Edit Album</span>
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowMenu(false);
                                                    onDelete();
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <Trash2 size={14} />
                                                <span>Delete Album</span>
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Privacy Badge */}
                <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-600 capitalize">
                        {album.privacy}
                    </span>
                    {album.members.length > 1 && (
                        <span className="text-xs text-stone-400">
                            {album.members.length} members
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
