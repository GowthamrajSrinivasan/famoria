import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { Photo } from '../types';
import { Button } from './Button';
import { FamilyMemberSelector } from './FamilyMemberSelector';

interface TagPeopleModalProps {
    photo: Photo;
    isOpen: boolean;
    onClose: () => void;
    onSave: (tags: { userId: string; userName: string; userPhoto: string }[], taggedUserIds: string[]) => Promise<void>;
}

export const TagPeopleModal: React.FC<TagPeopleModalProps> = ({
    photo,
    isOpen,
    onClose,
    onSave
}) => {
    const [selectedTags, setSelectedTags] = useState<{ userId: string; userName: string; userPhoto: string }[]>(
        photo.peopleTags || []
    );
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSelectionChange = (users: { id: string; name: string; avatar: string }[]) => {
        const newTags = users.map(u => ({
            userId: u.id,
            userName: u.name,
            userPhoto: u.avatar
        }));
        setSelectedTags(newTags);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const taggedUserIds = selectedTags.map(t => t.userId);
            await onSave(selectedTags, taggedUserIds);
            onClose();
        } catch (error) {
            console.error("Failed to save tags", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                    <h3 className="font-bold text-stone-800">Tag People</h3>
                    <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="mb-6 flex justify-center">
                        <div className="relative w-32 h-32 rounded-xl overflow-hidden shadow-md">
                            <img src={photo.url} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-stone-700">Who is in this photo?</label>
                        <FamilyMemberSelector
                            selectedUserIds={selectedTags.map(t => t.userId)}
                            onSelectionChange={handleSelectionChange}
                            className="w-full"
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSave} isLoading={isSaving}>Save Tags</Button>
                </div>
            </div>
        </div>
    );
};
