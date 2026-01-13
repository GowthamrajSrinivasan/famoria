import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Link as LinkIcon, Check, Copy, MessageCircle } from 'lucide-react';
import { invitationService } from '../services/invitationService';
import { getFamilyKey } from '../lib/crypto/keyStore';
import { toBase64 } from '../lib/crypto/masterKey';

interface InviteMemberModalProps {
    onClose: () => void;
    albumId?: string; // Optional: if inviting to a specific album
    currUserId: string;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ onClose, albumId, currUserId }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [copied, setCopied] = useState(false);

    const handleShareWhatsapp = async () => {
        setLoading(true);
        setError('');

        try {
            // 1. Get Family Master Key
            const familyKey = await getFamilyKey();
            if (!familyKey) {
                throw new Error("Family Master Key not found. Please log out and back in.");
            }
            const keyBase64 = toBase64(familyKey);

            if (!albumId) throw new Error("Please select an album to invite to.");


            // 2. Create Invite Record (No email needed)
            const token = await invitationService.createInvitation(currUserId, keyBase64, albumId);

            // 3. Construct Invite Link
            const baseUrl = window.location.origin;
            // The key is in the Hash Fragment #key=...
            const link = `${baseUrl}/?invite=${token}#key=${keyBase64}`;
            setInviteLink(link);

            // 4. Open WhatsApp
            const message = `Join my private album on Famoria: ${link}`;
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to create invitation');
        } finally {
            setLoading(false);
        }
    };

    const copyLink = () => {
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
                    {/* Main Action or Result */}
                    {!inviteLink ? (
                        <div className="space-y-4">
                            <p className="text-stone-600 text-sm">
                                {t('invite_desc')}
                            </p>

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                    <X size={16} />
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleShareWhatsapp}
                                disabled={loading}
                                className="w-full py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <MessageCircle size={22} fill="white" className="text-white" />
                                        {t('share_whatsapp')}
                                    </>
                                )}
                            </button>

                            <p className="text-xs text-center text-stone-400">
                                {t('whatsapp_note')}
                            </p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check size={32} strokeWidth={3} />
                            </div>
                            <h3 className="text-center text-lg font-semibold text-stone-800 mb-2">{t('link_created')}</h3>
                            <p className="text-center text-stone-500 text-sm mb-6">
                                {t('link_copy_help')}
                            </p>

                            <div className="bg-stone-50 p-4 rounded-xl mb-6 border border-stone-100">
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
                                        title="Copy Link"
                                    >
                                        {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
                            >
                                {t('done_btn')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
