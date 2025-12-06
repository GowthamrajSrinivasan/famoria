import React, { useState } from 'react';
import { Smile } from 'lucide-react';

interface EmojiPickerProps {
    onEmojiSelect: (emoji: string) => void;
}

const EMOJI_CATEGORIES = {
    'Smileys': ['😀', '😃', '😄', '😁', '😊', '😍', '🥰', '😘', '😂', '🤣', '😅', '😆', '😉', '😋', '😎', '🤗', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😮', '😯', '😪', '😫', '🥱', '😴'],
    'Gestures': ['👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '👐', '🤲', '🙏', '✊', '👊', '🤛', '🤜', '👋', '🤚', '👆', '👇', '☝️', '👉', '👈'],
    'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    'Symbols': ['✨', '⭐', '🌟', '💫', '🔥', '💯', '✅', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉']
};

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onEmojiSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>('Smileys');

    const handleEmojiClick = (emoji: string) => {
        onEmojiSelect(emoji);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            >
                <Smile size={20} className="text-stone-400 hover:text-orange-500 transition-colors" />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Picker */}
                    <div className="absolute bottom-full right-0 mb-2 bg-white rounded-2xl shadow-2xl border border-stone-200 p-3 w-80 z-50 animate-fade-in-up">
                        {/* Category Tabs */}
                        <div className="flex gap-2 mb-3 pb-3 border-b border-stone-100 overflow-x-auto">
                            {Object.keys(EMOJI_CATEGORIES).map((category) => (
                                <button
                                    key={category}
                                    onClick={() => setActiveCategory(category as keyof typeof EMOJI_CATEGORIES)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${activeCategory === category
                                            ? 'bg-orange-500 text-white'
                                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                                        }`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>

                        {/* Emoji Grid */}
                        <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                            {EMOJI_CATEGORIES[activeCategory].map((emoji, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleEmojiClick(emoji)}
                                    className="text-2xl p-2 hover:bg-stone-100 rounded-lg transition-colors active:scale-95"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
