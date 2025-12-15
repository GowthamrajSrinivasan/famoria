import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface FilterOption {
    id: string;
    name: string;
}

interface SelectedFilters {
    tags: string[];
    uploaders: string[];
    albums: string[];
}

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    filters: {
        tags: FilterOption[];
        uploaders: FilterOption[];
        albums?: FilterOption[];
    };
    selectedFilters: SelectedFilters;
    onApply: (filters: SelectedFilters) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
    isOpen,
    onClose,
    filters,
    selectedFilters,
    onApply
}) => {
    const [tempFilters, setTempFilters] = React.useState<SelectedFilters>(selectedFilters);

    // Update temp filters when selectedFilters change or modal opens
    useEffect(() => {
        if (isOpen) {
            setTempFilters(selectedFilters);
        }
    }, [isOpen, selectedFilters]);

    // Handle ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const toggleFilter = (type: keyof SelectedFilters, id: string) => {
        setTempFilters(prev => ({
            ...prev,
            [type]: prev[type].includes(id)
                ? prev[type].filter(item => item !== id)
                : [...prev[type], id]
        }));
    };

    const handleApply = () => {
        onApply(tempFilters);
        onClose();
    };

    const handleReset = () => {
        const resetFilters: SelectedFilters = {
            tags: [],
            uploaders: [],
            albums: []
        };
        setTempFilters(resetFilters);
        onApply(resetFilters);
        onClose();
    };

    const hasActiveFilters = tempFilters.tags.length > 0 ||
        tempFilters.uploaders.length > 0 ||
        tempFilters.albums.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-stone-200">
                    <h2 className="text-xl font-semibold text-stone-800">Filters</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-stone-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
                    <div className="space-y-6">
                        {/* Tagged People */}
                        <div>
                            <label className="block text-sm font-semibold text-stone-800 mb-3">
                                Tagged People
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {filters.tags.length === 0 ? (
                                    <p className="text-sm text-stone-400">No tags available</p>
                                ) : (
                                    filters.tags.map(tag => {
                                        const isSelected = tempFilters.tags.includes(tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                onClick={() => toggleFilter('tags', tag.id)}
                                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${isSelected
                                                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                                                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                                    }`}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Uploaded By */}
                        <div>
                            <label className="block text-sm font-semibold text-stone-800 mb-3">
                                Uploaded By
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {filters.uploaders.map(user => {
                                    const isSelected = tempFilters.uploaders.includes(user.id);
                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => toggleFilter('uploaders', user.id)}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${isSelected
                                                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                                }`}
                                        >
                                            {user.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Albums (if provided) */}
                        {filters.albums && filters.albums.length > 0 && (
                            <div>
                                <label className="block text-sm font-semibold text-stone-800 mb-3">
                                    Albums
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {filters.albums.map(album => {
                                        const isSelected = tempFilters.albums.includes(album.id);
                                        return (
                                            <button
                                                key={album.id}
                                                onClick={() => toggleFilter('albums', album.id)}
                                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${isSelected
                                                        ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30'
                                                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                                    }`}
                                            >
                                                {album.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-stone-200 bg-stone-50">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-800 transition-colors"
                        disabled={!hasActiveFilters}
                    >
                        Reset
                    </button>
                    <button
                        onClick={handleApply}
                        className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/30"
                    >
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>
    );
};
