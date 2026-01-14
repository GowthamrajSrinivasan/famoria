import React, { useState } from 'react';
import { ViewState } from '../types';
import { Camera, Grid, FolderOpen, Film, Users, LogOut, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { signOut as firebaseSignOut } from 'firebase/auth'; // Direct import or pass via props?
import { LanguageSwitcher } from './LanguageSwitcher';
// Better to pass signOut via props to keep it pure-ish or stick to pattern in App.tsx usage

interface DashboardSidebarProps {
    currentView: ViewState;
    onNavigate: (view: ViewState) => void;
    onSignOut: () => void;
    onAddNewMemory: () => void;
    currentUser?: { name: string; avatar: string; plan?: string };
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
    currentView,
    onNavigate,
    onSignOut,
    onAddNewMemory,
    currentUser
}) => {
    const { t } = useTranslation();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const navItems = [
        { view: ViewState.GALLERY, label: t('nav_gallery'), icon: Grid },
        { view: ViewState.ALBUMS, label: t('nav_albums'), icon: FolderOpen },
        { view: ViewState.VIDEOS, label: t('nav_videos'), icon: Film },
        { view: ViewState.MEMBERS, label: t('nav_members'), icon: Users },
    ];

    return (
        <div
            className={`
        h-full bg-white/10 backdrop-blur-xl border-l border-white/20 
        transition-all duration-300 ease-in-out flex flex-col
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}
        >
            {/* Brand Section */}
            <div className="h-20 flex items-center px-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-orange-400 to-orange-500 p-2 rounded-lg text-white shadow-lg shadow-orange-500/20">
                        <Camera size={20} fill="currentColor" className="opacity-95" strokeWidth={1.5} />
                    </div>
                    {!isCollapsed && (
                        <span className="text-xl font-bold tracking-tight text-white font-serif">Famoria</span>
                    )}
                </div>
            </div>

            {/* Add Memory Button */}
            <div className="px-4 pt-6 pb-2">
                <button
                    onClick={onAddNewMemory}
                    className={`
                        w-full flex items-center justify-center gap-2 p-3 rounded-xl 
                        bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all
                        text-white font-medium shadow-lg shadow-orange-500/20
                        ${isCollapsed ? 'aspect-square p-0' : ''}
                    `}
                    title={isCollapsed ? t('add_memory') : undefined}
                >
                    <Plus size={20} strokeWidth={2.5} />
                    {!isCollapsed && <span>{t('add_memory')}</span>}
                </button>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 py-4 px-4 space-y-2">
                {navItems.map((item) => (
                    <button
                        key={item.view}
                        onClick={() => onNavigate(item.view)}
                        className={`
              w-full flex items-center p-3 rounded-xl transition-all duration-200 group
              ${currentView === item.view
                                ? 'bg-white/20 text-white shadow-sm'
                                : 'text-white/70 hover:bg-white/10 hover:text-white'}
            `}
                        title={isCollapsed ? item.label : undefined}
                    >
                        <item.icon size={20} strokeWidth={2} className={`${isCollapsed ? 'mx-auto' : 'mr-3'}`} />
                        {!isCollapsed && <span className="font-medium">{item.label}</span>}
                        {!isCollapsed && currentView === item.view && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                        )}
                    </button>
                ))}
            </div>

            {/* User Section (Bottom) */}
            <div className="p-4 border-t border-white/10 bg-black/20 flex flex-col gap-3">

                {/* Language Switcher (Moved Above) */}
                <div className={`flex ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
                    <LanguageSwitcher variant="ghost" direction="up" />
                </div>

                {/* User Profile */}
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                    <img
                        src={currentUser?.avatar || 'https://api.dicebear.com/9.x/avataaars/svg?seed=fallback'}
                        alt={currentUser?.name}
                        className="w-10 h-10 rounded-full border-2 border-white/50 object-cover"
                    />

                    {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{currentUser?.name}</p>
                            <p className="text-xs text-white/50 truncate uppercase">{currentUser?.plan || 'Member'}</p>
                        </div>
                    )}

                    {!isCollapsed && (
                        <button
                            onClick={onSignOut}
                            className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                            title={t('sign_out')}
                        >
                            <LogOut size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Collapse Toggle */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -left-3 top-24 bg-white text-stone-800 rounded-full p-1 shadow-md hover:bg-stone-100 transition-colors"
            >
                {isCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>

        </div>
    );
};
