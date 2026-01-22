import React, { useState } from 'react';
import { ViewState } from '../types';
import { Camera, Grid, FolderOpen, Film, Users, LogOut, ChevronRight, ChevronLeft, Plus, ChevronDown, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { userService } from '../services/userService';
import { useEffect } from 'react';

interface DashboardSidebarProps {
    currentView: ViewState;
    onNavigate: (view: ViewState) => void;
    onSignOut: () => void;
    onAddNewMemory: () => void;
    isFamilyAuthenticated: boolean;
    currentUser?: { name: string; avatar: string; plan?: string; hasKeyAccess?: boolean };
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
    currentView,
    onNavigate,
    onSignOut,
    onAddNewMemory,
    isFamilyAuthenticated,
    currentUser
}) => {
    const { t } = useTranslation();
    const { user, switchFamily, setupFamily } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isSwitchMenuOpen, setIsSwitchMenuOpen] = useState(false);
    const [familyNames, setFamilyNames] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchFamilyNames = async () => {
            if (user?.families) {
                const names: Record<string, string> = {};
                for (const fid of user.families) {
                    if (!familyNames[fid]) { // Only fetch if not already in state
                        const name = await userService.getFamilyDisplayName(fid);
                        names[fid] = name;
                    }
                }
                if (Object.keys(names).length > 0) {
                    setFamilyNames(prev => ({ ...prev, ...names }));
                }
            }
        };
        fetchFamilyNames();
    }, [user?.families]);

    const navItems = [
        { view: ViewState.GALLERY, label: t('nav_gallery'), icon: Grid },
        { view: ViewState.ALBUMS, label: t('nav_albums'), icon: FolderOpen },
        { view: ViewState.VIDEOS, label: t('nav_videos'), icon: Film },
        { view: ViewState.MEMBERS, label: t('nav_members'), icon: Users },
        { view: ViewState.OCCASION_PLANNER, label: 'Occasion Planner', icon: Camera }, // Using Camera since I don't have Sparkles from imports yet
    ];

    const handleSwitch = async (fid: string) => {
        setIsSwitchMenuOpen(false);
        await switchFamily(fid);
    };

    const hasPendingInvite = !!(sessionStorage.getItem('pendingInviteToken') && sessionStorage.getItem('pendingInviteKey'));
    const isLockedWithoutInvite = user?.familyId && !isFamilyAuthenticated && !hasPendingInvite;

    const handleAcceptInvite = () => {
        // App.tsx handles the actual logic if we reload or trigger a state change
        // For now, we can just reload to trigger the App.tsx invitation effect
        window.location.reload();
    };

    const { syncFromDrive, unlockFamilyLocally, hasLocalKey } = useAuth();
    const [isRecovering, setIsRecovering] = useState(false);

    const handleOpenFamily = async () => {
        setIsRecovering(true);
        try {
            if (hasLocalKey) {
                await unlockFamilyLocally();
            } else {
                await syncFromDrive();
            }
        } catch (err) {
            console.error('Failed to open family:', err);
            alert(t('error_recover_failed') || 'Failed to restore access. Please ensure Google Drive sync is active.');
        } finally {
            setIsRecovering(false);
        }
    };

    const handleCreateNewFamily = async () => {
        try {
            await setupFamily();
        } catch (err) {
            console.error('Failed to create family:', err);
        }
    };

    return (
        <div
            className={`
        h-full bg-white/10 backdrop-blur-xl border-l border-white/20 
        transition-all duration-300 ease-in-out flex flex-col
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}
        >
            {/* Brand Section */}
            <div className="h-20 flex items-center px-6 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-orange-400 to-orange-500 p-2 rounded-lg text-white shadow-lg shadow-orange-500/20">
                        <Camera size={20} fill="currentColor" className="opacity-95" strokeWidth={1.5} />
                    </div>
                    {!isCollapsed && (
                        <span className="text-xl font-bold tracking-tight text-white font-serif">Famoria</span>
                    )}
                </div>
            </div>

            {/* Family Switcher */}
            {!isCollapsed && user && user.families && user.families.length > 0 && (
                <div className="px-4 py-3 border-b border-white/10">
                    <div className="relative">
                        <button
                            onClick={() => setIsSwitchMenuOpen(!isSwitchMenuOpen)}
                            className="w-full flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-white text-sm"
                        >
                            <div className="flex items-center gap-2 truncate">
                                <div className="bg-orange-500/20 p-1.5 rounded-lg text-orange-400">
                                    <Shield size={14} />
                                </div>
                                <span className="font-semibold truncate">
                                    {(user.familyId ? familyNames[user.familyId] : null) || user.familyId || 'Select Family'}
                                </span>
                            </div>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isSwitchMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isSwitchMenuOpen && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-stone-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                <div className="p-1">
                                    {user.families.map((fid) => (
                                        <button
                                            key={fid}
                                            onClick={() => handleSwitch(fid)}
                                            className={`
                                                w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all
                                                ${user.familyId === fid
                                                    ? 'bg-orange-500 text-white shadow-lg'
                                                    : 'text-white/70 hover:bg-white/10 hover:text-white'}
                                            `}
                                        >
                                            <Shield size={16} className={user.familyId === fid ? 'text-white' : 'text-orange-400'} />
                                            <span className="text-sm font-medium truncate">{familyNames[fid] || fid}</span>
                                            {user.familyId === fid && (
                                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                            )}
                                        </button>
                                    ))}

                                    <div className="border-t border-white/10 mt-1 pt-1">
                                        <button
                                            onClick={() => { setIsSwitchMenuOpen(false); handleCreateNewFamily(); }}
                                            className="w-full flex items-center gap-3 p-3 rounded-lg text-white/50 hover:bg-white/5 hover:text-white transition-all text-left"
                                        >
                                            <Plus size={16} />
                                            <span className="text-sm font-medium">{t('add_new_family') || '+ Add Family'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Memory Button - Only if authenticated */}
            {isFamilyAuthenticated && (
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
            )}

            {/* Automated Onboarding Actions */}
            {!isFamilyAuthenticated && (
                <div className="px-4 pt-6 pb-2">
                    {hasPendingInvite ? (
                        <button
                            onClick={handleAcceptInvite}
                            className={`
                                w-full flex flex-col items-center justify-center gap-1 p-4 rounded-xl 
                                bg-gradient-to-br from-teal-400 to-teal-600 hover:from-teal-500 hover:to-teal-700
                                active:scale-95 transition-all text-white shadow-xl shadow-teal-500/20
                                ${isCollapsed ? 'aspect-square p-2' : ''}
                            `}
                        >
                            <Users size={isCollapsed ? 24 : 20} strokeWidth={2.5} />
                            {!isCollapsed && (
                                <span className="text-sm font-bold leading-tight text-center">
                                    Join Invited Family
                                    <span className="block text-[10px] font-medium opacity-80 mt-0.5">
                                        Accept invitation & unlock
                                    </span>
                                </span>
                            )}
                        </button>
                    ) : isLockedWithoutInvite ? (
                        <button
                            onClick={handleOpenFamily}
                            disabled={isRecovering}
                            className={`
                                w-full flex flex-col items-center justify-center gap-1 p-4 rounded-xl 
                                bg-gradient-to-br from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700
                                active:scale-95 transition-all text-white shadow-xl shadow-orange-500/20
                                ${isCollapsed ? 'aspect-square p-2' : ''}
                                ${isRecovering ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        >
                            {isRecovering ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Shield size={isCollapsed ? 24 : 20} strokeWidth={2.5} />
                            )}
                            {!isCollapsed && (
                                <span className="text-sm font-bold leading-tight text-center">
                                    {isRecovering ? 'Restoring...' : 'Open My Family'}
                                    <span className="block text-[10px] font-medium opacity-80 mt-0.5">
                                        Restore vault from Drive
                                    </span>
                                </span>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={handleCreateNewFamily}
                            className={`
                                w-full flex flex-col items-center justify-center gap-1 p-4 rounded-xl 
                                bg-gradient-to-br from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700
                                active:scale-95 transition-all text-white shadow-xl shadow-blue-500/20
                                ${isCollapsed ? 'aspect-square p-2' : ''}
                            `}
                        >
                            <Plus size={isCollapsed ? 24 : 20} strokeWidth={2.5} />
                            {!isCollapsed && (
                                <span className="text-sm font-bold leading-tight text-center">
                                    Create New Family
                                    <span className="block text-[10px] font-medium opacity-80 mt-0.5">
                                        Start your fresh vault
                                    </span>
                                </span>
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Navigation Links - Only if authenticated */}
            <div className="flex-1 py-4 px-4 space-y-2">
                {isFamilyAuthenticated && navItems.map((item) => (
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

                {!isFamilyAuthenticated && !isCollapsed && (
                    <div className="py-8 px-4 text-center">
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Grid size={24} className="text-white/20" />
                        </div>
                        <p className="text-xs text-white/30 font-medium">
                            {t('nav_locked_hint')}
                        </p>
                    </div>
                )}
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
