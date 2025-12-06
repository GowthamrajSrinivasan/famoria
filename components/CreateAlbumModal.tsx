import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Lock, Users, Globe } from 'lucide-react';
import { Album } from '../types';
import { createAlbum, updateAlbum } from '../services/albumService';
import { Button } from './Button';

interface CreateAlbumModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (albumId: string) => void;
    currentUserId: string;
    editAlbum?: Album | null; // If editing existing album
}

export const CreateAlbumModal: React.FC<CreateAlbumModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    currentUserId,
    editAlbum
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [privacy, setPrivacy] = useState<'private' | 'family' | 'public'>('family');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (editAlbum) {
            setName(editAlbum.name);
            setDescription(editAlbum.description || '');
            setPrivacy(editAlbum.privacy);
        } else {
            setName('');
            setDescription('');
            setPrivacy('family');
        }
        setError('');
    }, [editAlbum, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('Album name is required');
            return;
        }

        if (name.length > 50) {
            setError('Album name must be 50 characters or less');
            return;
        }

        if (description.length > 500) {
            setError('Description must be 500 characters or less');
            return;
        }

        setIsSubmitting(true);
        try {
            if (editAlbum) {
                // Update existing album
                await updateAlbum(editAlbum.id, {
                    name: name.trim(),
                    description: description.trim(),
                    privacy
                });
                onSuccess(editAlbum.id);
            } else {
                // Create new album
                const albumId = await createAlbum(
                    name,
                    currentUserId,
                    description,
                    privacy
                );
                onSuccess(albumId);
            }
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save album');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-stone-100">
                    <h2 className="text-2xl font-bold text-stone-800">
                        {editAlbum ? 'Edit Album' : 'Create New Album'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                        <X size={24} className="text-stone-600" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">\n                    {/* Album Name */}
                    <div>
                        <label className="block text-sm font-semibold text-stone-700 mb-2">
                            Album Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Summer Vacation 2024"
                            maxLength={50}
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all"
                            autoFocus
                        />
                        <div className="flex justify-between mt-1">
                            <span className="text-xs text-stone-400">Required</span>
                            <span className="text-xs text-stone-400">{name.length}/50</span>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-semibold text-stone-700 mb-2">
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Add a description for this album..."
                            maxLength={500}
                            rows={3}
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all resize-none custom-scrollbar"
                        />
                        <div className="flex justify-between mt-1">
                            <span className="text-xs text-stone-400">Optional</span>
                            <span className="text-xs text-stone-400">{description.length}/500</span>
                        </div>
                    </div>

                    {/* Privacy Settings */}
                    <div>
                        <label className="block text-sm font-semibold text-stone-700 mb-3">
                            Privacy
                        </label>
                        <div className="space-y-2">
                            {[
                                { value: 'private', label: 'Private', icon: Lock, desc: 'Only you can see' },
                                { value: 'family', label: 'Family', icon: Users, desc: 'Family members can see' },
                                { value: 'public', label: 'Public', icon: Globe, desc: 'Anyone can see' }
                            ].map(({ value, label, icon: Icon, desc }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setPrivacy(value as any)}
                                    className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-3 ${privacy === value
                                        ? 'border-orange-500 bg-orange-50'
                                        : 'border-stone-200 hover:border-stone-300 bg-white'
                                        }`}
                                >
                                    <div className={`p-2 rounded-lg ${privacy === value ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-600'
                                        }`}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-semibold text-stone-800">{label}</div>
                                        <div className="text-xs text-stone-500">{desc}</div>
                                    </div>
                                    {privacy === value && (
                                        <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3 bg-stone-100 text-stone-700 rounded-xl hover:bg-stone-200 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !name.trim()}
                            className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 font-medium"
                        >
                            {isSubmitting ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Saving...</span>
                                </div>
                            ) : (
                                <span>{editAlbum ? 'Save Changes' : 'Create Album'}</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
