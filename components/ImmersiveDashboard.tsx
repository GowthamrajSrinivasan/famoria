import React, { useMemo, useState, useEffect } from 'react';
import { Post, User, ViewState } from '../types';
import { DashboardHero } from './DashboardHero';
import { DashboardSidebar } from './DashboardSidebar';
import { useAuth } from '../context/AuthContext'; // Import useAuth if needed for logic here

interface ImmersiveDashboardProps {
    currentUser: User | null;
    posts: Post[];
    onNavigate: (view: ViewState) => void;
    onSignOut: () => void;
    onAddNewMemory: () => void;
}

export const ImmersiveDashboard: React.FC<ImmersiveDashboardProps> = ({
    currentUser,
    posts,
    onNavigate,
    onSignOut,
    onAddNewMemory
}) => {
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
                    currentUser={currentUser || undefined}
                />
            </div>
        </div>
    );
};
