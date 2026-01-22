import React, { useMemo, useState, useEffect } from 'react';
import { Post, User, ViewState } from '../types';
import { DashboardHero } from './DashboardHero';
import { DashboardSidebar } from './DashboardSidebar';
import { useAuth } from '../context/AuthContext'; // Import useAuth if needed for logic here
import { useTranslation } from 'react-i18next';
import { Camera, Grid, FolderOpen, Film, Users, Plus } from 'lucide-react';

interface ImmersiveDashboardProps {
    currentUser: User | null;
    posts: Post[];
    onNavigate: (view: ViewState) => void;
    onSignOut: () => void;
    onAddNewMemory: () => void;
    isFamilyAuthenticated: boolean;
}

export const ImmersiveDashboard: React.FC<ImmersiveDashboardProps> = ({
    currentUser,
    posts,
    onNavigate,
    onSignOut,
    onAddNewMemory,
    onShowFamilySetup,
    isFamilyAuthenticated
}) => {
    const { t } = useTranslation();
    // Pick a random featured post on mount
    // We use useMemo but with a dependency on posts.length to re-roll if posts change significantly 
    // or actually just once on mount to avoid jitter.
    const featuredPost = useMemo(() => {
        if (posts.length === 0) return undefined;

        // Filter posts that have content (photoIds or coverPhotoId)
        const validPosts = posts.filter(p => (p.photoIds && p.photoIds.length > 0) || p.coverPhotoId);

        if (validPosts.length === 0) return undefined;

        const randomIndex = Math.floor(Math.random() * validPosts.length);
        return validPosts[randomIndex];
    }, [posts.length > 0]); // Dependency trick: only re-roll if we go from 0 to >0 posts

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-stone-900">
            {/* Main Hero Area - Background Layer */}
            <div className="absolute inset-0 w-full h-full z-10">
                {/* Top Left Welcome Message */}
                <div className="absolute top-8 left-8 z-20 animate-fade-in-down">
                    <h2 className="text-white text-3xl md:text-5xl font-serif font-bold drop-shadow-lg shadow-black/20 tracking-tight leading-tight">
                        {t('welcome_user', { name: currentUser?.name?.split(' ')[0] || 'Member' })}
                    </h2>
                </div>

                <div loaded-post={featuredPost?.id} className="absolute top-24 left-8 right-8 z-20 flex md:hidden items-center gap-1 bg-black/20 backdrop-blur-md p-1 rounded-xl overflow-x-auto scrollbar-none animate-fade-in-up">
                    <button
                        onClick={() => onNavigate(ViewState.GALLERY)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap text-white/70 hover:text-white"
                    >
                        <Grid size={14} />
                        <span>{t('nav_gallery')}</span>
                    </button>
                    <button
                        onClick={() => onNavigate(ViewState.ALBUMS)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap text-white/70 hover:text-white"
                    >
                        <FolderOpen size={14} />
                        <span>{t('nav_albums')}</span>
                    </button>
                    <button
                        onClick={() => onNavigate(ViewState.VIDEOS)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap text-white/70 hover:text-white"
                    >
                        <Film size={14} />
                        <span>{t('nav_videos')}</span>
                    </button>
                    <button
                        onClick={() => onNavigate(ViewState.MEMBERS)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap text-white/70 hover:text-white"
                    >
                        <Users size={14} />
                        <span>{t('nav_members')}</span>
                    </button>
                </div>

                <DashboardHero
                    post={featuredPost}
                />
            </div>

            {/* Sidebar - Overlay Layer (Right Side) */}
            <div className="absolute top-0 right-0 h-full z-30">
                <DashboardSidebar
                    currentView={ViewState.DASHBOARD}
                    onNavigate={onNavigate}
                    onSignOut={onSignOut}
                    onAddNewMemory={onAddNewMemory}
                    isFamilyAuthenticated={isFamilyAuthenticated}
                    currentUser={currentUser || undefined}
                />
            </div>
        </div>
    );
};
