import React, { useState, useEffect, useRef } from 'react';
import { Check, Search, User as UserIcon, X } from 'lucide-react';
import { userService } from '../services/userService';

interface UserOption {
    id: string;
    name: string;
    avatar: string;
}

interface FamilyMemberSelectorProps {
    selectedUserIds: string[];
    onSelectionChange: (users: UserOption[]) => void;
    className?: string;
}

export const FamilyMemberSelector: React.FC<FamilyMemberSelectorProps> = ({
    selectedUserIds,
    onSelectionChange,
    className = ''
}) => {
    const [users, setUsers] = useState<UserOption[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const allUsers = await userService.getAllUsers();
                setUsers(allUsers);
            } catch (error) {
                console.error("Failed to load users", error);
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleUser = (user: UserOption) => {
        const isSelected = selectedUserIds.includes(user.id);
        let newSelectedIds: string[];

        if (isSelected) {
            newSelectedIds = selectedUserIds.filter(id => id !== user.id);
        } else {
            newSelectedIds = [...selectedUserIds, user.id];
        }

        // Map ids back to full user objects for the parent
        const selectedUsers = users.filter(u => newSelectedIds.includes(u.id));
        onSelectionChange(selectedUsers);
    };

    const removeUser = (userId: string) => {
        const newSelectedIds = selectedUserIds.filter(id => id !== userId);
        const selectedUsers = users.filter(u => newSelectedIds.includes(u.id));
        onSelectionChange(selectedUsers);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div className="flex flex-wrap gap-2 mb-2">
                {selectedUserIds.map(userId => {
                    const user = users.find(u => u.id === userId);
                    if (!user) return null;
                    return (
                        <span key={userId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 text-sm font-medium border border-orange-100">
                            <img src={user.avatar} alt={user.name} className="w-4 h-4 rounded-full object-cover" />
                            {user.name}
                            <button
                                onClick={() => removeUser(userId)}
                                className="hover:bg-orange-100 rounded-full p-0.5 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    );
                })}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 text-stone-600 text-sm font-medium hover:bg-stone-200 transition-colors"
                >
                    <UserIcon size={14} />
                    Tag People
                </button>
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-2 w-72 bg-white rounded-xl shadow-xl border border-stone-100 overflow-hidden animate-fade-in-up">
                    <div className="p-3 border-b border-stone-50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                                type="text"
                                placeholder="Search family..."
                                className="w-full pl-9 pr-3 py-2 bg-stone-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-orange-100 outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto p-2">
                        {loading ? (
                            <div className="p-4 text-center text-stone-400 text-sm">Loading...</div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="p-4 text-center text-stone-400 text-sm">No one found</div>
                        ) : (
                            <div className="space-y-1">
                                {filteredUsers.map(user => {
                                    const isSelected = selectedUserIds.includes(user.id);
                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => toggleUser(user)}
                                            className={`w-full flex items-center justify-between p-2 rounded-lg text-sm transition-colors ${isSelected ? 'bg-orange-50 text-orange-900' : 'hover:bg-stone-50 text-stone-700'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover border border-stone-100" />
                                                <span className="font-medium">{user.name}</span>
                                            </div>
                                            {isSelected && <Check size={16} className="text-orange-500" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
