import React, { useState, useEffect } from 'react';
import { X, Users as UsersIcon, Check } from 'lucide-react';
import { createGroup, updateGroup } from '../services/groupService';
import { userService } from '../services/userService';
import { Group, User } from '../types';

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (groupId: string) => void;
    currentUserId: string;
    editGroup?: Group | null;
}

const GROUP_COLORS = [
    { name: 'Orange', value: '#f97316' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Red', value: '#ef4444' },
];

const GROUP_ICONS = ['👥', '🏠', '❤️', '⭐', '🎉', '🌟', '🔥', '💼', '🎨', '🏆'];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    currentUserId,
    editGroup
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [selectedColor, setSelectedColor] = useState(GROUP_COLORS[0].value);
    const [selectedIcon, setSelectedIcon] = useState(GROUP_ICONS[0]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(true);

    useEffect(() => {
        if (isOpen) {
            loadUsers();
            if (editGroup) {
                setName(editGroup.name);
                setDescription(editGroup.description || '');
                setSelectedMembers(editGroup.members.filter(id => id !== currentUserId));
                setSelectedColor(editGroup.color || GROUP_COLORS[0].value);
                setSelectedIcon(editGroup.icon || GROUP_ICONS[0]);
            } else {
                resetForm();
            }
        }
    }, [isOpen, editGroup]);

    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            const users = await userService.getAllUsers();
            setAllUsers(users.filter(u => u.id !== currentUserId));
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const resetForm = () => {
        setName('');
        setDescription('');
        setSelectedMembers([]);
        setSelectedColor(GROUP_COLORS[0].value);
        setSelectedIcon(GROUP_ICONS[0]);
    };

    const toggleMember = (userId: string) => {
        setSelectedMembers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            if (editGroup) {
                await updateGroup(editGroup.id, {
                    name,
                    description,
                    members: [currentUserId, ...selectedMembers],
                    color: selectedColor,
                    icon: selectedIcon
                });
                onSuccess(editGroup.id);
            } else {
                const groupId = await createGroup(
                    name,
                    currentUserId,
                    selectedMembers,
                    description,
                    selectedColor,
                    selectedIcon
                );
                onSuccess(groupId);
            }
            onClose();
        } catch (error: any) {
            // Suppress permission errors (normal when not logged in)
            if (!error.message?.includes('permission')) {
                console.warn('Error creating/updating group:', error);
                alert(error.message || 'Failed to save group');
            }
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl animate-fade-in-up">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-stone-100">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-100 p-2 rounded-xl">
                            <UsersIcon size={24} className="text-orange-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-stone-800">
                            {editGroup ? 'Edit Group' : 'Create New Group'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                    >
                        <X size={24} className="text-stone-400" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {/* Group Name */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-stone-700 mb-2">
                            Group Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Close Family, Work Team, Friends"
                            className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300"
                            maxLength={50}
                            required
                        />
                        <p className="text-xs text-stone-400 mt-1">{name.length}/50 characters</p>
                    </div>

                    {/* Description */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-stone-700 mb-2">
                            Description (Optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What's this group for?"
                            className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 resize-none"
                            rows={3}
                            maxLength={500}
                        />
                        <p className="text-xs text-stone-400 mt-1">{description.length}/500 characters</p>
                    </div>

                    {/* Color Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-stone-700 mb-3">
                            Group Color
                        </label>
                        <div className="flex gap-3">
                            {GROUP_COLORS.map((color) => (
                                <button
                                    key={color.value}
                                    type="button"
                                    onClick={() => setSelectedColor(color.value)}
                                    className={`w-10 h-10 rounded-full transition-transform ${selectedColor === color.value ? 'ring-4 ring-offset-2 ring-stone-300 scale-110' : 'hover:scale-105'
                                        }`}
                                    style={{ backgroundColor: color.value }}
                                    title={color.name}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Icon Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-stone-700 mb-3">
                            Group Icon
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {GROUP_ICONS.map((icon) => (
                                <button
                                    key={icon}
                                    type="button"
                                    onClick={() => setSelectedIcon(icon)}
                                    className={`w-12 h-12 text-2xl rounded-xl transition-all ${selectedIcon === icon
                                        ? 'bg-orange-100 ring-2 ring-orange-300 scale-110'
                                        : 'bg-stone-50 hover:bg-stone-100'
                                        }`}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Members Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-stone-700 mb-3">
                            Add Members ({selectedMembers.length} selected)
                        </label>
                        {loadingUsers ? (
                            <div className="text-center py-6">
                                <div className="w-6 h-6 border-2 border-stone-200 border-t-orange-400 rounded-full animate-spin mx-auto" />
                            </div>
                        ) : (
                            <div className="border border-stone-200 rounded-xl max-h-64 overflow-y-auto">
                                {allUsers.length === 0 ? (
                                    <p className="text-center py-6 text-stone-400 text-sm">No other users found</p>
                                ) : (
                                    allUsers.map((user) => (
                                        <label
                                            key={user.id}
                                            className="flex items-center gap-3 p-3 hover:bg-stone-50 cursor-pointer border-b border-stone-100 last:border-0"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedMembers.includes(user.id)}
                                                onChange={() => toggleMember(user.id)}
                                                className="w-5 h-5 rounded border-stone-300 text-orange-500 focus:ring-orange-200"
                                            />
                                            <img
                                                src={user.avatar}
                                                alt={user.name}
                                                className="w-10 h-10 rounded-full"
                                            />
                                            <div className="flex-1">
                                                <p className="font-semibold text-stone-800">{user.name}</p>
                                                {user.email && (
                                                    <p className="text-xs text-stone-500">{user.email}</p>
                                                )}
                                            </div>
                                            {selectedMembers.includes(user.id) && (
                                                <Check size={20} className="text-orange-500" />
                                            )}
                                        </label>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </form>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-stone-100 bg-stone-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-6 py-3 bg-white border border-stone-200 text-stone-700 rounded-xl hover:bg-stone-100 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim() || loading}
                        className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:opacity-50 disabled:shadow-none transition-all font-medium"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                        ) : editGroup ? (
                            'Update Group'
                        ) : (
                            'Create Group'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
