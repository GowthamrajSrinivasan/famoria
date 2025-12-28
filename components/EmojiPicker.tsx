import React, { useState, useRef, useEffect } from 'react';
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
    const [position, setPosition] = useState({ top: 0, right: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.top - 360, // Position above the button (emoji picker height ~350px)
                right: window.innerWidth - rect.right
            });
        }
    }, [isOpen]);

    const handleEmojiClick = (emoji: string) => {
        onEmojiSelect(emoji);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                ref={buttonRef}
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
                        className="fixed inset-0 z-[70]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Picker */}
                    <div
                        className="fixed bg-white rounded-2xl shadow-2xl border border-stone-200 p-3 w-80 z-[80] animate-fade-in-up"
                        style={{
                            top: `${position.top}px`,
                            right: `${position.right}px`,
                            maxHeight: '350px'
                        }}
                    >
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
                        <div
                            className="grid grid-cols-8 gap-1 max-h-[240px] overflow-y-auto overflow-x-hidden custom-scrollbar"
                            style={{
                                scrollBehavior: 'smooth',
                                WebkitOverflowScrolling: 'touch'
                            }}
                        >
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
