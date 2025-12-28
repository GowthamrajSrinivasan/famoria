import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface LikesPreviewProps {
    photoId: string;
    likes: string[];
    onClick: () => void;
}

interface UserAvatar {
    id: string;
    avatar: string;
}

export const LikesPreview: React.FC<LikesPreviewProps> = ({ photoId, likes, onClick }) => {
    const displayLimit = 2;
    const [userAvatars, setUserAvatars] = useState<UserAvatar[]>([]);

    useEffect(() => {
        const fetchUserAvatars = async () => {
            if (!likes || likes.length === 0) {
                setUserAvatars([]);
                return;
            }

            try {
                const usersToFetch = likes.slice(0, displayLimit);
                const usersRef = collection(db, 'users');

                // Fetch in batches (Firestore 'in' limit is 10)
                const avatars: UserAvatar[] = [];
                for (let i = 0; i < usersToFetch.length; i += 10) {
                    const batch = usersToFetch.slice(i, i + 10);
                    const q = query(usersRef, where('__name__', 'in', batch));
                    const snapshot = await getDocs(q);

                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        avatars.push({
                            id: doc.id,
                            avatar: data.avatar || data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'U')}&background=e63946&color=fff`
                        });
                    });
                }

                setUserAvatars(avatars);
            } catch (error) {
                console.error('Failed to fetch user avatars:', error);
            }
        };

        fetchUserAvatars();
    }, [likes, displayLimit]);

    if (!likes || likes.length === 0) return null;

    return (
        <div className="w-full">
            {/* Header Row */}
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-stone-800">Reactions</h3>
                <button
                    onClick={onClick}
                    className="text-xs font-medium text-stone-600 hover:text-stone-800 transition-colors"
                >
                    All {likes.length}
                </button>
            </div>

            {/* Avatars Row */}
            <div className="flex items-center gap-1.5">
                {userAvatars.map((user) => (
                    <div
                        key={user.id}
                        className="relative cursor-pointer"
                        onClick={onClick}
                    >
                        <img
                            src={user.avatar}
                            alt=""
                            className="w-9 h-9 rounded-full border-2 border-stone-100 shadow-sm hover:border-red-200 transition-colors object-cover"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5 bg-red-500 rounded-full p-1 border-2 border-white">
                            <Heart size={9} fill="white" className="text-white" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
