import React, { useState, useEffect } from 'react';
import { X, Heart } from 'lucide-react';
import { User } from '../types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface LikesModalProps {
    likes: string[]; // Array of user IDs
    onClose: () => void;
}

interface UserDetails {
    id: string;
    name: string;
    avatar: string;
    email?: string;
}

export const LikesModal: React.FC<LikesModalProps> = ({ likes, onClose }) => {
    const [users, setUsers] = useState<UserDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'filtered'>('all');

    useEffect(() => {
        const fetchUsers = async () => {
            if (!likes || likes.length === 0) {
                setLoading(false);
                return;
            }

            try {
                // Fetch user details for all likes
                const usersRef = collection(db, 'users');
                const userDetails: UserDetails[] = [];

                // Firestore 'in' query limit is 10, so batch if needed
                const batches = [];
                for (let i = 0; i < likes.length; i += 10) {
                    const batch = likes.slice(i, i + 10);
                    batches.push(batch);
                }

                for (const batch of batches) {
                    const q = query(usersRef, where('__name__', 'in', batch));
                    const snapshot = await getDocs(q);
                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        userDetails.push({
                            id: doc.id,
                            name: data.name || 'Unknown User',
                            avatar: data.avatar || data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'U')}&background=f97316&color=fff`,
                            email: data.email
                        });
                    });
                }

                setUsers(userDetails);
            } catch (error) {
                console.error('Failed to fetch user details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [likes]);

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl animate-fade-in-up m-4">
                {/* Header */}
                <div className="p-6 border-b border-stone-100">
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-xl font-bold text-stone-800">Reactions</h2>
                        <button
                            onClick={onClose}
                            className="text-stone-400 hover:text-stone-600 p-2 hover:bg-stone-100 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <p className="text-sm text-stone-500">All {likes.length}</p>
                </div>

                {/* User List */}
                <div className="overflow-y-auto max-h-[60vh] custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-3 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-20 text-stone-400">
                            <Heart size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="text-sm">No reactions yet</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-stone-100">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex items-center gap-4 p-4 hover:bg-stone-50 transition-colors"
                                >
                                    {/* Avatar */}
                                    <img
                                        src={user.avatar}
                                        alt={user.name}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-stone-100 shadow-sm flex-shrink-0"
                                    />

                                    {/* User Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-stone-800 text-base truncate">
                                            {user.name}
                                        </h3>
                                        {user.email && (
                                            <p className="text-sm text-stone-500 truncate">{user.email}</p>
                                        )}
                                    </div>

                                    {/* Heart Icon */}
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
                                            <Heart size={24} fill="white" className="text-white" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
