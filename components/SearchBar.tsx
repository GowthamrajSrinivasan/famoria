import React from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onFilterClick: () => void;
    activeFilterCount: number;
    placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
    searchQuery,
    onSearchChange,
    onFilterClick,
    activeFilterCount,
    placeholder
}) => {
    const { t } = useTranslation();
    const finalPlaceholder = placeholder || t('search_default_placeholder');

    return (
        <div className="relative flex items-center">
            {/* Search Icon */}
            <Search size={20} className="absolute left-4 text-stone-400 pointer-events-none" />

            {/* Search Input */}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={finalPlaceholder}
            className="w-full pl-12 pr-14 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all"
            />

            {/* Filter Button */}
            <button
                onClick={onFilterClick}
                className={`absolute right-2 p-2 rounded-lg transition-all ${activeFilterCount > 0
                    ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                    : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                    }`}
                title={t('open_filters')}
            >
                <SlidersHorizontal size={20} />
                {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {activeFilterCount}
                    </span>
                )}
            </button>
        </div>
    );
};
