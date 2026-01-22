import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';

interface Occasion {
    id: string;
    name: string;
}

interface PlannerItem {
    id: string;
    name: string;
    images: string[];
}

const OCCASIONS: Occasion[] = [
    { id: 'reception', name: 'Reception' },
    { id: 'haldi', name: 'Haldi' },
    { id: 'sangeet', name: 'Sangeet' },
    { id: 'marriage', name: 'Marriage' },
    { id: 'vacation', name: 'Vacation' },
];

const PLANNER_CATEGORIES = [
    { id: 'outfit', name: 'Leghana & Saree' },
    { id: 'necklace', name: 'Necklace' },
    { id: 'earrings', name: 'Earrings' },
    { id: 'bangles', name: 'Bangles' },
    { id: 'makeup', name: 'Makeup' },
];

interface OccasionPlannerProps {
    onBack: () => void;
}

export const OccasionPlanner: React.FC<OccasionPlannerProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const [selectedOccasion, setSelectedOccasion] = useState(OCCASIONS[0].id);
    const [selections, setSelections] = useState<Record<string, number>>({
        outfit: 0,
        necklace: 0,
        earrings: 0,
        bangles: 0,
        makeup: 0,
    });

    const handleSelectImage = (categoryId: string, index: number) => {
        setSelections(prev => ({
            ...prev,
            [categoryId]: index
        }));
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-12 animate-fade-in-down">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 group"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span>{t('back_to_dashboard')}</span>
                </button>

                <h1 className="text-4xl md:text-5xl font-serif font-bold mb-8 text-white tracking-tight">
                    Occasion Planner
                </h1>

                {/* Occasion Selector */}
                <div className="flex flex-wrap gap-3">
                    {OCCASIONS.map(occasion => (
                        <button
                            key={occasion.id}
                            onClick={() => setSelectedOccasion(occasion.id)}
                            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${selectedOccasion === occasion.id
                                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                }`}
                        >
                            {occasion.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Horizontal Cards Area */}
            <div className="flex overflow-x-auto gap-8 pb-10 px-4 -mx-4 no-scrollbar animate-fade-in-up">
                {PLANNER_CATEGORIES.map((category) => (
                    <div
                        key={category.id}
                        className="flex-shrink-0 w-80 md:w-96 bg-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col relative"
                    >
                        {/* Selected Image Preview (Large) */}
                        <div className="aspect-[3/4] relative bg-slate-700">
                            <img
                                src={`https://picsum.photos/seed/${selectedOccasion}-${category.id}-${selections[category.id]}/800/1200`}
                                alt={category.name}
                                className="w-full h-full object-cover transition-all duration-700 ease-in-out"
                                key={`${selectedOccasion}-${category.id}-${selections[category.id]}`} // Force animation on change
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
                            <div className="absolute bottom-6 left-6">
                                <h3 className="text-2xl font-serif font-bold text-white drop-shadow-md">
                                    {category.name}
                                </h3>
                            </div>
                        </div>

                        {/* Thumbnail Selector Area */}
                        <div className="p-6 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50">
                            <div className="grid grid-cols-4 gap-3">
                                {[0, 1, 2, 3].map((idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectImage(category.id, idx)}
                                        className={`aspect-square rounded-xl overflow-hidden relative group transition-all duration-300 ring-2 ${selections[category.id] === idx ? 'ring-orange-500 scale-105' : 'ring-transparent hover:ring-slate-500'}`}
                                    >
                                        <img
                                            src={`https://picsum.photos/seed/${selectedOccasion}-${category.id}-${idx}/200/200`}
                                            alt={`${category.name} option ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                        {selections[category.id] === idx && (
                                            <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                                                <CheckCircle2 size={16} className="text-white drop-shadow" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* CTA */}
            <div className="max-w-7xl mx-auto mt-12 flex justify-center pb-20">
                <Button className="px-10 py-4 shadow-2xl shadow-orange-500/20">
                    Save Planner Configuration
                </Button>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
};
