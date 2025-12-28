import React, { useState, useEffect } from 'react';
import { Users, Mail, Calendar, Shield, ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { User, Group } from '../types';
import { userService } from '../services/userService';
import { subscribeToGroups, deleteGroup } from '../services/groupService';
import { CreateGroupModal } from './CreateGroupModal';

interface MembersPageProps {
    onBack: () => void;
    currentUserId?: string;
}

export const MembersPage: React.FC<MembersPageProps> = ({ onBack, currentUserId }) => {
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
    }, []);

    useEffect(() => {
        if (currentUserId && activeTab === 'groups') {
            const unsubscribe = subscribeToGroups(
                currentUserId,
                (loadedGroups) => {
                    setGroups(loadedGroups);
                    setLoading(false);
                },
                (error) => {
                    // Suppress permission errors (normal when not logged in)
                    if (!error.message?.includes('permission')) {
                        console.warn('Error loading groups:', error);
                        setError('Failed to load groups');
                    }
                    setLoading(false);
                }
            );
            return () => unsubscribe();
        }
    }, [currentUserId, activeTab]);

    const loadMembers = async () => {
        try {
            setLoading(true);
            setError(null);
            const users = await userService.getAllUsers();
            setMembers(users);
        } catch (err) {
            console.error('Error loading members:', err);
            setError('Failed to load members. Please try again.');
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

    if (loading && activeTab === 'members') {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full animate-fade-in-up">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={onBack}
                    className="group flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors mb-6"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    Back
                </button>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-gradient-to-br from-orange-400 to-orange-500 p-3 rounded-xl text-white shadow-lg shadow-orange-500/20">
                            <Users size={28} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-stone-800">
                                {activeTab === 'members' ? 'Family Members' : 'Groups'}
                            </h1>
                            <p className="text-stone-500 mt-1">
                                {activeTab === 'members'
                                    ? `${members.length} ${members.length === 1 ? 'member' : 'members'} in your family app`
                                    : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} created`}
                            </p>
                        </div>
                    </div>

                    {activeTab === 'groups' && (
                        <button
                            onClick={() => {
                                setEditGroup(null);
                                setShowCreateGroupModal(true);
                            }}
                            className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95 flex items-center gap-2 font-medium"
                        >
                            <Plus size={20} />
                            Create Group
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-stone-100 p-1.5 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('members')}
                    className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'members'
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                        }`}
                >
                    Members
                </button>
                <button
                    onClick={() => setActiveTab('groups')}
                    className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'groups'
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                        }`}
                >
                    Groups
                </button>
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                    <p className="text-red-700 text-sm">{error}</p>
                    <button
                        onClick={loadMembers}
                        className="mt-2 text-sm font-medium text-red-600 hover:text-red-700 underline"
                    >
                        Try again
                    </button>
                </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
                <>
                    {members.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-3xl border border-stone-100">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                                <Users size={40} className="text-stone-300" />
                            </div>
                            <h3 className="text-xl font-semibold text-stone-700 mb-2">No members found</h3>
                            <p className="text-stone-500">There are no registered members in your app yet.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {members.map((member) => (
                                    <div
                                        key={member.id}
                                        className="bg-white rounded-2xl border border-stone-100 p-6 hover:shadow-lg hover:border-orange-200 transition-all duration-300 group"
                                    >
                                        <div className="flex items-start gap-4 mb-4">
                                            <div className="relative">
                                                <img
                                                    src={member.avatar}
                                                    alt={member.name}
                                                    className="w-16 h-16 rounded-full border-2 border-white shadow-md object-cover group-hover:scale-105 transition-transform"
                                                />
                                                <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-bold text-stone-800 truncate">
                                                    {member.name}
                                                </h3>
                                                {member.email && (
                                                    <p className="text-sm text-stone-500 truncate flex items-center gap-1 mt-1">
                                                        <Mail size={14} />
                                                        {member.email}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {member.plan && (
                                                <div className="flex items-center gap-2">
                                                    <Shield size={16} className="text-stone-400" />
                                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPlanColor(member.plan)}`}>
                                                        {member.plan} Plan
                                                    </span>
                                                </div>
                                            )}

                                            {member.createdAt && (
                                                <div className="flex items-center gap-2 text-sm text-stone-600">
                                                    <Calendar size={16} className="text-stone-400" />
                                                    <span>Joined {formatDate(member.createdAt)}</span>
                                                </div>
                                            )}

                                            {member.lastLogin && (
                                                <div className="text-xs text-stone-500 pt-2 border-t border-stone-100">
                                                    Last active: {formatDate(member.lastLogin)}
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-stone-100">
                                            <p className="text-xs font-mono text-stone-400 truncate">
                                                ID: {member.id}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {members.length > 0 && (
                                <div className="mt-8 bg-white rounded-2xl border border-stone-100 p-6">
                                    <h3 className="text-lg font-bold text-stone-800 mb-4">Summary</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="text-center">
                                            <p className="text-2xl font-bold text-orange-500">{members.length}</p>
                                            <p className="text-sm text-stone-500 mt-1">Total Members</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-2xl font-bold text-purple-500">
                                                {members.filter(m => m.plan === 'Ultimate').length}
                                            </p>
                                            <p className="text-sm text-stone-500 mt-1">Ultimate</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-2xl font-bold text-orange-500">
                                                {members.filter(m => m.plan === 'Pro').length}
                                            </p>
                                            <p className="text-sm text-stone-500 mt-1">Pro</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-2xl font-bold text-stone-500">
                                                {members.filter(m => m.plan === 'Lite' || !m.plan).length}
                                            </p>
                                            <p className="text-sm text-stone-500 mt-1">Lite/Free</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* Groups Tab */}
            {activeTab === 'groups' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groups.length === 0 ? (
                        <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-stone-100">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-stone-100 rounded-full mb-4">
                                <Users size={40} className="text-stone-300" />
                            </div>
                            <h3 className="text-xl font-semibold text-stone-700 mb-2">No groups yet</h3>
                            <p className="text-stone-500 mb-6">Create your first group to organize your family members</p>
                            <button
                                onClick={() => setShowCreateGroupModal(true)}
                                className="px-6 py-3 bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all inline-flex items-center gap-2 font-medium"
                            >
                                <Plus size={20} />
                                Create First Group
                            </button>
                        </div>
                    ) : (
                        groups.map((group) => {
                            const groupMembers = getMembersByIds(group.members);
                            const isOwner = currentUserId === group.createdBy;

                            return (
                                <div
                                    key={group.id}
                                    className="bg-white rounded-2xl border border-stone-100 p-6 hover:shadow-lg hover:border-orange-200 transition-all duration-300 relative group"
                                >
                                    {/* Group Icon & Name */}
                                    <div className="flex items-start gap-4 mb-4">
                                        <div
                                            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg"
                                            style={{ backgroundColor: group.color + '20', color: group.color }}
                                        >
                                            {group.icon}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-stone-800">{group.name}</h3>
                                            {group.description && (
                                                <p className="text-sm text-stone-500 mt-1 line-clamp-2">{group.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Members */}
                                    <div className="mb-4">
                                        <p className="text-xs font-semibold text-stone-400 uppercase mb-2">
                                            {group.members.length} Members
                                        </p>
                                        <div className="flex -space-x-2">
                                            {groupMembers.slice(0, 5).map((member) => (
                                                <img
                                                    key={member.id}
                                                    src={member.avatar}
                                                    alt={member.name}
                                                    className="w-8 h-8 rounded-full border-2 border-white"
                                                    title={member.name}
                                                />
                                            ))}
                                            {group.members.length > 5 && (
                                                <div className="w-8 h-8 rounded-full border-2 border-white bg-stone-200 flex items-center justify-center text-xs font-semibold text-stone-600">
                                                    +{group.members.length - 5}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {isOwner && (
                                        <div className="flex gap-2 pt-4 border-t border-stone-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => {
                                                    setEditGroup(group);
                                                    setShowCreateGroupModal(true);
                                                }}
                                                className="flex-1 px-3 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                                            >
                                                <Edit size={14} /> Edit
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(group.id)}
                                                className="flex-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Create Group Modal */}
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

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-bold text-stone-800 mb-2">Delete Group?</h3>
                        <p className="text-stone-600 mb-6">
                            This will permanently delete this group. Members will not be affected.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl hover:bg-stone-200 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteGroup(deleteConfirm)}
                                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
