import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Key, Plus, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { familyService } from '../services/familyService';
import { toBase64 } from '../lib/crypto/masterKey';

export const FamilySetupModal: React.FC = () => {
    const { t } = useTranslation();
    const { setupFamily, user, signOut, refreshDriveToken, googleAccessToken, hasLocalKey, unlockFamilyLocally } = useAuth();
    const [mode, setMode] = useState<'selection' | 'create' | 'recover'>('selection');
    const [loading, setLoading] = useState(false);
    const [recoveryKey, setRecoveryKey] = useState('');
    const [error, setError] = useState('');

    const handleCreate = async () => {
        setLoading(true);
        setError('');
        try {
            await setupFamily();
            // AuthContext state update will close this modal automatically (if App logic hides it)
        } catch (err: any) {
            console.error('Setup failed:', err);
            setError(err.message || "Failed to create family vault.");

            // If token expired, prompts to refresh
            if (err.message?.includes('access') || err.message?.includes('token')) {
                const newToken = await refreshDriveToken();
                if (newToken) handleCreate(); // Retry once
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRecover = async () => {
        if (!recoveryKey.trim()) return;
        setLoading(true);
        setError('');
        try {
            // Save manually entered key
            // Note: In real flow, they might just copy-paste from a backup file content
            // We assume Base64 string input
            let keyString = recoveryKey.trim();
            // Handle if they pasted the full JSON content or just the key
            if (keyString.startsWith('{')) {
                try {
                    const parsed = JSON.parse(keyString);
                    if (parsed.key) keyString = parsed.key;
                } catch (e) { /* ignore JSON parse error, treat as raw string */ }
            }

            // Save to IDB and Drive
            await familyService.acceptFamilyInvite(keyString, googleAccessToken || undefined);

            // Reload to pick up the key in AuthContext
            window.location.reload();
        } catch (err: any) {
            console.error('Recovery failed:', err);
            setError(t('invalid_recovery_key'));
        } finally {
            setLoading(false);
        }
    };

    const handleSyncFromDrive = async () => {
        setLoading(true);
        setError('');
        try {
            // 1. Force refresh token to ensure we have Drive scope
            // We need to be sure we can access AppData
            const token = await refreshDriveToken();
            if (!token) {
                throw new Error("Google Drive access required.");
            }

            // 2. Attempt restore
            const key = await familyService.restoreKeyFromDrive(token);

            if (key) {
                // Success! Reload to allow AuthContext to init normally
                // (Since key is now in IDB)
                window.location.reload();
            } else {
                throw new Error("No Family Key found in your Google Drive.");
            }
        } catch (err: any) {
            console.error('Sync failed:', err);
            setError(err.message || t('sync_failed'));
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/90 backdrop-blur-md p-4">
                <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                    <div className="w-16 h-16 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin mx-auto mb-6" />
                    <h3 className="text-xl font-bold text-stone-800 mb-2">{t('setting_up_vault')}</h3>
                    <p className="text-stone-500">{t('please_wait_encryption')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/90 backdrop-blur-md p-4 animate-in fade-in duration-500">
            <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-stone-100/20">
                {/* Header Graphic */}
                <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                    <div className="bg-white/20 backdrop-blur-sm w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl rotate-3">
                        <Shield size={40} className="text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white relative z-10">
                        {hasLocalKey ? t('vault_locked') : t('family_vault_setup')}
                    </h2>
                    <p className="text-orange-50 text-sm mt-2 relative z-10 max-w-xs mx-auto">
                        {hasLocalKey ? t('vault_locked_desc') : t('vault_setup_desc')}
                    </p>
                </div>

                <div className="p-8">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 flex items-start gap-3">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    {mode === 'selection' && (
                        <div className="space-y-4">
                            {hasLocalKey ? (
                                <button
                                    onClick={unlockFamilyLocally}
                                    className="w-full flex items-center gap-4 p-6 rounded-2xl bg-orange-500 text-white shadow-xl shadow-orange-200 hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all group text-left"
                                >
                                    <div className="bg-white/20 p-3 rounded-xl group-hover:rotate-12 transition-transform">
                                        <Key size={28} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{t('unlock_vault')}</h3>
                                        <p className="text-orange-50 text-sm opacity-90">{t('unlock_vault_desc')}</p>
                                    </div>
                                </button>
                            ) : (
                                <button
                                    onClick={handleCreate}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-stone-100 hover:border-orange-200 hover:bg-orange-50 transition-all group text-left"
                                >
                                    <div className="bg-orange-100 text-orange-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                                        <Plus size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-stone-800">{t('create_new_family')}</h3>
                                        <p className="text-xs text-stone-500 mt-1">{t('create_family_desc')}</p>
                                    </div>
                                </button>
                            )}

                            {/* Divider for secondary options if already has local key */}
                            {hasLocalKey && (
                                <div className="relative py-4">
                                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-100" /></div>
                                    <div className="relative flex justify-center text-xs uppercase tracking-widest text-stone-400"><span className="bg-white px-2">{t('secondary_options')}</span></div>
                                </div>
                            )}

                            <button
                                onClick={() => setMode('recover')}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-stone-100 hover:border-blue-200 hover:bg-blue-50 transition-all group text-left ${hasLocalKey ? 'p-3' : 'p-4'}`}
                            >
                                <div className="bg-blue-100 text-blue-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                                    <Key size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-stone-800">{t('enter_recovery_key')}</h3>
                                    <p className="text-xs text-stone-500 mt-1">{t('recover_family_desc')}</p>
                                </div>
                            </button>

                            <button
                                onClick={handleSyncFromDrive}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-stone-100 hover:border-green-200 hover:bg-green-50 transition-all group text-left ${hasLocalKey ? 'p-3' : 'p-4'}`}
                            >
                                <div className="bg-green-100 text-green-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                                    <RefreshCw size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-stone-800">{t('sync_from_drive')}</h3>
                                    <p className="text-xs text-stone-500 mt-1">{t('sync_drive_desc')}</p>
                                </div>
                            </button>

                            <div className="pt-4 border-t border-stone-100 mt-6 flex justify-center">
                                <button onClick={signOut} className="text-stone-400 hover:text-stone-600 text-sm flex items-center gap-2 transition-colors">
                                    <LogOut size={16} />
                                    {t('sign_out')}
                                </button>
                            </div>
                        </div>
                    )}

                    {mode === 'recover' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-stone-700 mb-2">
                                    {t('paste_key_instruction')}
                                </label>
                                <textarea
                                    value={recoveryKey}
                                    onChange={(e) => setRecoveryKey(e.target.value)}
                                    placeholder="eyJ2ZXJzaW9uIjoxLCJrZXki..."
                                    className="w-full h-32 p-4 bg-stone-50 border border-stone-200 rounded-xl text-stone-600 text-xs font-mono focus:ring-2 focus:ring-orange-100 focus:border-orange-300 outline-none resize-none"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setMode('selection')}
                                    className="flex-1 py-3 bg-stone-100 text-stone-600 font-semibold rounded-xl hover:bg-stone-200 transition-colors"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={handleRecover}
                                    disabled={!recoveryKey.trim()}
                                    className="flex-1 py-3 bg-stone-900 text-white font-semibold rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50"
                                >
                                    {t('unlock_vault')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
