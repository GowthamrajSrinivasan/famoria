import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Link as LinkIcon, Check, Copy, MessageCircle } from 'lucide-react';
import { invitationService } from '../services/invitationService';
import { userService } from '../services/userService';
import { getFamilyKey } from '../lib/crypto/keyStore';
import { toBase64 } from '../lib/crypto/masterKey';

interface InviteMemberModalProps {
    onClose: () => void;
    albumId?: string; // Optional: if inviting to a specific album
    currUserId: string;
    familyId: string;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ onClose, albumId, currUserId, familyId }) => {
    console.log('[InviteMemberModal] Rendered with:', { currUserId, familyId, albumId });
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [copied, setCopied] = useState(false);

    // Auto-generate link when props are ready
    React.useEffect(() => {
        if (currUserId) {
            generateLink();
        }
    }, [familyId, currUserId, albumId]);

    const generateLink = async () => {
        console.log('[InviteMemberModal] generateLink START');
        setLoading(true);
        setError('');

        try {
            let effectiveFamilyId = familyId;

            if (!effectiveFamilyId) {
                console.log('[InviteMemberModal] familyId MISSING. Auto-fixing...');
                const { nanoid } = await import('nanoid');
                effectiveFamilyId = nanoid(12);
                console.log('[InviteMemberModal] Generated new FID:', effectiveFamilyId);

                await userService.updateUserFamily(currUserId, effectiveFamilyId, true);
                console.log('[InviteMemberModal] FID saved to Firestore for user:', currUserId);
            }

            // 1. Get Family Master Key
            const familyKey = await getFamilyKey();
            if (!familyKey) {
                throw new Error("Family Master Key not found. Please log out and back in.");
            }
            const keyBase64 = toBase64(familyKey);

            // 2. Create Invite Record
            // albumId is now optional for app-level invite
            console.log('[InviteMemberModal] Calling createInvitation with:', { currUserId, familyId: effectiveFamilyId, albumId });
            const token = await invitationService.createInvitation(currUserId, keyBase64, effectiveFamilyId, albumId);

            // 3. Construct Invite Link
            const baseUrl = window.location.origin;
            const link = `${baseUrl}/?invite=${token}#key=${encodeURIComponent(keyBase64)}`;
            setInviteLink(link);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to create invitation');
        } finally {
            setLoading(false);
        }
    };

    const handleShareWhatsapp = () => {
        if (!inviteLink) return;
        const message = t('invite_app_message', { link: inviteLink });
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    const copyLink = () => {
        if (!inviteLink) return;
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                    <h2 className="text-lg font-semibold text-stone-800">{t('invite_modal_title')}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="space-y-6">
                        <p className="text-stone-600 text-sm">
                            {t('invite_desc')}
                        </p>

                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                <X size={16} />
                                {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                <div className="w-10 h-10 border-4 border-stone-100 border-t-orange-500 rounded-full animate-spin" />
                                <p className="text-stone-400 text-sm font-medium">{t('generating_link') || 'Generating link...'}</p>
                            </div>
                        ) : inviteLink ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                {/* Link Preview Box */}
                                <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={inviteLink}
                                            className="flex-1 bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-600 outline-none"
                                        />
                                        <button
                                            onClick={copyLink}
                                            className="p-2 hover:bg-stone-200 rounded-lg transition-colors text-stone-600"
                                            title={t('copy_link')}
                                        >
                                            {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Primary Actions */}
                                <div className="grid grid-cols-1 gap-3">
                                    <button
                                        onClick={handleShareWhatsapp}
                                        className="w-full py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3"
                                    >
                                        <MessageCircle size={22} fill="white" className="text-white" />
                                        {t('share_whatsapp')}
                                    </button>

                                    <button
                                        onClick={copyLink}
                                        className="w-full py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-all flex items-center justify-center gap-3"
                                    >
                                        {copied ? (
                                            <>
                                                <Check size={20} className="text-green-600" />
                                                {t('copied') || 'Copied!'}
                                            </>
                                        ) : (
                                            <>
                                                <LinkIcon size={20} />
                                                {t('copy_link')}
                                            </>
                                        )}
                                    </button>
                                </div>

                                <p className="text-xs text-center text-stone-400 pt-2">
                                    {t('whatsapp_note')}
                                </p>
                            </div>
                        ) : null}

                        <button
                            onClick={onClose}
                            className="w-full py-3 mt-4 bg-white border border-stone-200 text-stone-600 rounded-xl font-medium hover:bg-stone-50 transition-colors"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
