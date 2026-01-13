import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';

interface LanguageSwitcherProps {
    variant?: 'default' | 'ghost'; // 'ghost' for dark backgrounds (Sidebar)
    direction?: 'up' | 'down'; // Dropdown direction
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ variant = 'default', direction = 'down' }) => {
    const { i18n, t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const languages = [
        { code: 'en', label: 'English', nativeName: 'English' },
        { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்' }
    ];

    const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0];

    const handleLanguageChange = (langCode: string) => {
        i18n.changeLanguage(langCode);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const buttonClass = variant === 'ghost'
        ? "flex items-center gap-2 p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
        : "flex items-center gap-2 p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-600";

    const dropdownClass = direction === 'up'
        ? "absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-lg border border-stone-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200"
        : "absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-stone-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200";

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={buttonClass}
                title={t('select_language')}
            >
                <Globe size={20} strokeWidth={1.5} />
                <span className={`hidden md:block text-sm font-medium ${variant === 'ghost' ? 'text-inherit' : ''}`}>
                    {currentLanguage.nativeName}
                </span>
            </button>

            {isOpen && (
                <div className={dropdownClass}>
                    <div className="px-3 py-2 border-b border-stone-100 mb-1">
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('language')}</span>
                    </div>
                    {languages.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50 transition-colors flex items-center justify-between group"
                        >
                            <div className="flex flex-col">
                                <span className={`font-medium ${i18n.language === lang.code ? 'text-orange-600' : 'text-stone-700'}`}>
                                    {lang.nativeName}
                                </span>
                                <span className="text-xs text-stone-400">{lang.label}</span>
                            </div>
                            {i18n.language === lang.code && (
                                <Check size={16} className="text-orange-500" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
