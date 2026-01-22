import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Mail, Calendar, Shield, ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { User, Group } from '../types';
import { userService } from '../services/userService';
import { useAuth } from '../context/AuthContext';
import { subscribeToGroups, deleteGroup } from '../services/groupService';
import { CreateGroupModal } from './CreateGroupModal';

interface MembersPageProps {
    onBack: () => void;
    currentUserId?: string;
    onInvite?: () => void;
}

export const MembersPage: React.FC<MembersPageProps> = ({ onBack, currentUserId, onInvite }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'members' | 'groups'>('members');
    const [members, setMembers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [editGroup, setEditGroup] = useState<Group | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        loadMembers();
    }, [user?.familyId]);

    useEffect(() => {
        if (currentUserId && activeTab === 'groups') {
            const unsubscribe = subscribeToGroups(
                currentUserId,
                (loadedGroups) => {
                    setGroups(loadedGroups);
                    setLoading(false);
                },
                (error) => {
                    if (!error.message?.includes('permission')) {
                        console.warn('Error loading groups:', error);
                        setError(t('error_loading_groups'));
                    }
                    setLoading(false);
                }
            );
            return () => unsubscribe();
        } else if (activeTab === 'groups') {
            setGroups([]);
            setLoading(false);
        }
    }, [currentUserId, user?.familyId, activeTab]);

    const loadMembers = async () => {
        try {
            setLoading(true);
            setError(null);
            if (user?.familyId) {
                const familyUsers = await userService.getFamilyMembers(user.familyId);
                setMembers(familyUsers);
            } else {
                setMembers([]);
            }
        } catch (err) {
            console.error('Error loading members:', err);
            setError(t('error_loading_members'));
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        try {
            await deleteGroup(groupId);
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting group:', error);
            alert('Failed to delete group');
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getPlanColor = (plan?: string) => {
        switch (plan) {
            case 'Ultimate': return 'bg-purple-100 text-purple-700 border-purple-200';
            case 'Pro': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'Lite': return 'bg-stone-100 text-stone-700 border-stone-200';
            default: return 'bg-stone-100 text-stone-700 border-stone-200';
        }
    };

    const getMembersByIds = (memberIds: string[]) => {
        return members.filter(m => memberIds.includes(m.id));
    };

    const activeMembers = members.filter(m => m.hasKeyAccess);
    const pendingMembers = members.filter(m => !m.hasKeyAccess);

    if (loading && activeTab === 'members') {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
            {/* Header section with Stats */}
            <div className="mb-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-4xl font-serif font-bold text-stone-900 tracking-tight mb-2">
                            {activeTab === 'members' ? t('title_family_members') : t('title_groups')}
                        </h1>
                        <p className="text-stone-500 font-medium">
                            {user?.familyId
                                ? (activeTab === 'members'
                                    ? t('members_count_subtitle', { count: members.length })
                                    : t('groups_count_subtitle', { count: groups.length }))
                                : t('setup_family_subtitle')}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="p-3 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-colors"
                            title={t('back')}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        {activeTab === 'groups' ? (
                            <button
                                onClick={() => {
                                    setEditGroup(null);
                                    setShowCreateGroupModal(true);
                                }}
                                className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                            >
                                <Plus size={20} />
                                {t('create_group')}
                            </button>
                        ) : (
                            <button
                                onClick={onInvite}
                                className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                            >
                                <Plus size={20} />
                                {t('add_new_member')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 bg-stone-100 p-1.5 rounded-2xl w-fit">
                <button
                    onClick={() => setActiveTab('members')}
                    className={`px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${activeTab === 'members'
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                        }`}
                >
                    {t('tab_members')}
                </button>
                <button
                    onClick={() => setActiveTab('groups')}
                    className={`px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${activeTab === 'groups'
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                        }`}
                >
                    {t('tab_groups')}
                </button>
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-8 flex items-center justify-between">
                    <p className="text-red-700 text-sm font-medium">{error}</p>
                    <button
                        onClick={loadMembers}
                        className="text-sm font-bold text-red-600 hover:text-red-700 underline"
                    >
                        {t('try_again')}
                    </button>
                </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
                <div className="space-y-12">
                    {activeMembers.length === 0 && pendingMembers.length === 0 ? (
                        <div className="text-center py-24 bg-white rounded-[2.5rem] border border-stone-100 shadow-sm">
                            <div className="inline-flex items-center justify-center w-24 h-24 bg-stone-50 rounded-3xl mb-6">
                                <Users size={40} className="text-stone-300" />
                            </div>
                            <h3 className="text-2xl font-bold text-stone-800 mb-2">{t('no_members_found')}</h3>
                            <p className="text-stone-500 max-w-sm mx-auto">{t('no_members_desc')}</p>
                        </div>
                    ) : (
                        <>
                            {/* Active Members Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {activeMembers.map((member) => (
                                    <div
                                        key={member.id}
                                        className="bg-white rounded-3xl border border-stone-100 p-6 hover:shadow-xl hover:border-orange-100 transition-all duration-500 group"
                                    >
                                        <div className="flex items-start gap-4 mb-6">
                                            <div className="relative">
                                                <img
                                                    src={member.avatar}
                                                    alt={member.name}
                                                    className="w-20 h-20 rounded-[2rem] border-2 border-white shadow-lg object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 border-4 border-white rounded-full shadow-sm" />
                                            </div>
                                            <div className="flex-1 min-w-0 pt-2">
                                                <h3 className="text-xl font-bold text-stone-900 truncate tracking-tight">
                                                    {member.name}
                                                </h3>
                                                {member.email && (
                                                    <p className="text-sm text-stone-400 truncate mt-0.5 font-medium">
                                                        {member.email}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {member.plan && (
                                                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-100/50">
                                                    <div className="flex items-center gap-2 text-stone-500">
                                                        <Shield size={16} />
                                                        <span className="text-xs font-bold uppercase tracking-wider">{t('plan')}</span>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getPlanColor(member.plan)}`}>
                                                        {member.plan}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between px-1">
                                                <div className="text-xs font-bold text-stone-400 flex items-center gap-1.5">
                                                    <Calendar size={14} />
                                                    {t('member_since')}
                                                </div>
                                                <span className="text-xs font-bold text-stone-600">{formatDate(member.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Pending Invitations */}
                            {pendingMembers.length > 0 && (
                                <div className="pt-12 border-t border-stone-100">
                                    <h3 className="text-2xl font-serif font-bold text-stone-900 mb-8 flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center">
                                            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                                        </span>
                                        {t('pending_invitations')}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {pendingMembers.map((member) => (
                                            <div key={member.id} className="opacity-60 grayscale-[0.8] hover:opacity-100 hover:grayscale-0 transition-all duration-500">
                                                <div className="bg-white rounded-3xl border border-stone-100 p-6">
                                                    <div className="flex items-center gap-4">
                                                        <img
                                                            src={member.avatar}
                                                            alt={member.name}
                                                            className="w-14 h-14 rounded-2xl object-cover"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-bold text-stone-800 truncate">{member.name}</h3>
                                                            <p className="text-sm text-stone-400 truncate">{member.email}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Summary Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-12">
                                {[
                                    { label: t('total_members'), value: members.length, color: 'orange' },
                                    { label: t('plan_ultimate'), value: members.filter(m => m.plan === 'Ultimate').length, color: 'purple' },
                                    { label: t('plan_pro'), value: members.filter(m => m.plan === 'Pro').length, color: 'orange' },
                                    { label: t('plan_lite_free'), value: members.filter(m => m.plan === 'Lite' || !m.plan).length, color: 'stone' }
                                ].map((stat) => (
                                    <div key={stat.label} className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm text-center">
                                        <p className={`text-3xl font-bold mb-1 text-${stat.color}-500`}>{stat.value}</p>
                                        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Groups Tab */}
            {activeTab === 'groups' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groups.length === 0 ? (
                        <div className="col-span-full text-center py-24 bg-white rounded-[2.5rem] border border-stone-100 shadow-sm">
                            <div className="inline-flex items-center justify-center w-24 h-24 bg-stone-50 rounded-3xl mb-6">
                                <Users size={40} className="text-stone-300" />
                            </div>
                            <h3 className="text-2xl font-bold text-stone-800 mb-2">{t('no_groups_yet')}</h3>
                            <p className="text-stone-500 max-w-sm mx-auto mb-8">{t('create_first_group_desc')}</p>
                            <button
                                onClick={() => setShowCreateGroupModal(true)}
                                className="px-8 py-3.5 bg-orange-500 text-white rounded-2xl shadow-xl shadow-orange-500/20 hover:bg-orange-600 transition-all inline-flex items-center gap-2 font-bold"
                            >
                                <Plus size={20} />
                                {t('create_first_group')}
                            </button>
                        </div>
                    ) : (
                        groups.map((group) => {
                            const groupMembers = getMembersByIds(group.members);
                            const isOwner = currentUserId === group.createdBy;

                            return (
                                <div
                                    key={group.id}
                                    className="bg-white rounded-[2rem] border border-stone-100 p-8 hover:shadow-xl hover:border-orange-100 transition-all duration-500 relative group flex flex-col"
                                >
                                    {/* Group Icon & Name */}
                                    <div className="flex items-start gap-5 mb-8">
                                        <div
                                            className="w-20 h-20 rounded-[2rem] flex items-center justify-center text-4xl shadow-lg shrink-0"
                                            style={{ backgroundColor: group.color + '15', color: group.color }}
                                        >
                                            {group.icon || '👥'}
                                        </div>
                                        <div className="pt-2">
                                            <h3 className="text-2xl font-bold text-stone-900 tracking-tight">{group.name}</h3>
                                            {group.description && (
                                                <p className="text-sm text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                                                    {group.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Members Section */}
                                    <div className="mt-auto pt-6 border-t border-stone-50">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                                                {t('members')}
                                            </span>
                                            <span className="text-sm font-bold text-stone-900">
                                                {group.members.length}
                                            </span>
                                        </div>
                                        <div className="flex -space-x-3">
                                            {groupMembers.slice(0, 5).map((member) => (
                                                <img
                                                    key={member.id}
                                                    src={member.avatar}
                                                    alt={member.name}
                                                    className="w-10 h-10 rounded-xl border-4 border-white shadow-sm object-cover"
                                                    title={member.name}
                                                />
                                            ))}
                                            {group.members.length > 5 && (
                                                <div className="w-10 h-10 rounded-xl border-4 border-white bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-400 shadow-sm">
                                                    +{group.members.length - 5}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions Overlay */}
                                    {isOwner && (
                                        <div className="flex gap-2 mt-8">
                                            <button
                                                onClick={() => {
                                                    setEditGroup(group);
                                                    setShowCreateGroupModal(true);
                                                }}
                                                className="flex-1 px-4 py-2.5 bg-stone-50 text-stone-600 rounded-xl hover:bg-stone-100 transition-colors text-sm font-bold flex items-center justify-center gap-2 border border-stone-100"
                                            >
                                                <Edit size={16} /> {t('edit')}
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(group.id)}
                                                className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors text-sm font-bold flex items-center justify-center border border-red-100"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Modals outside main layout flow */}
            {currentUserId && (
                <CreateGroupModal
                    isOpen={showCreateGroupModal}
                    onClose={() => {
                        setShowCreateGroupModal(false);
                        setEditGroup(null);
                    }}
                    onSuccess={() => {
                        setShowCreateGroupModal(false);
                        setEditGroup(null);
                    }}
                    currentUserId={currentUserId}
                    editGroup={editGroup}
                />
            )}

            {deleteConfirm && (
                <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl border border-stone-100 animate-in zoom-in-95 duration-300">
                        <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
                            <Trash2 size={32} className="text-red-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-stone-900 text-center mb-3">
                            {t('delete_group_title')}
                        </h3>
                        <p className="text-stone-500 text-center mb-10 leading-relaxed font-medium">
                            {t('delete_group_message')}
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleDeleteGroup(deleteConfirm)}
                                className="w-full py-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all font-bold shadow-xl shadow-red-500/20 active:scale-[0.98]"
                            >
                                {t('delete')}
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="w-full py-4 bg-stone-100 text-stone-600 rounded-2xl hover:bg-stone-200 transition-all font-bold active:scale-[0.98]"
                            >
                                {t('cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
