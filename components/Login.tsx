import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Camera, Sparkles, ShieldCheck, Users, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { signIn, loading, error } = useAuth();

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#fafaf9] flex flex-col items-center justify-center p-6">
      {/* Background Decorative Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-orange-200/40 rounded-full blur-[100px] pointer-events-none mix-blend-multiply animate-spin-slow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-teal-200/40 rounded-full blur-[100px] pointer-events-none mix-blend-multiply animate-spin-slow" style={{ animationDirection: 'reverse' }} />

      <div className="w-full max-w-[420px] bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white/50 p-10 md:p-12 text-center animate-fade-in-up relative z-10">
        
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-100 to-orange-50 rounded-3xl text-orange-500 shadow-sm mb-8 transform rotate-3 hover:rotate-6 transition-transform duration-300">
          <Camera size={40} strokeWidth={1.5} />
        </div>

        <h1 className="text-4xl font-bold text-stone-800 mb-3 tracking-tight font-serif">Famoria</h1>
        <p className="text-stone-500 mb-10 text-lg leading-relaxed">
          Your family's digital living room. <br/>
          <span className="text-orange-400 font-medium">Safe. Smart. Shared.</span>
        </p>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <button 
          onClick={signIn}
          disabled={loading}
          className="group w-full relative overflow-hidden bg-stone-900 text-white font-medium py-4 px-6 rounded-2xl transition-all shadow-lg shadow-stone-200 hover:shadow-xl hover:shadow-stone-300 active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed"
        >
          {loading ? (
             <div className="flex items-center justify-center gap-3">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span className="opacity-90">Connecting...</span>
             </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Sign in with Google</span>
            </div>
          )}
        </button>

        <div className="mt-12 grid grid-cols-3 gap-2">
          <Feature icon={<Sparkles size={18} />} label="AI Magic" />
          <Feature icon={<ShieldCheck size={18} />} label="Private" />
          <Feature icon={<Users size={18} />} label="Family" />
        </div>
      </div>
    </div>
  );
};

const Feature = ({ icon, label }: { icon: React.ReactNode, label: string }) => (
  <div className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-stone-50 transition-colors cursor-default group">
    <div className="text-stone-400 group-hover:text-orange-500 transition-colors">{icon}</div>
    <span className="text-xs font-semibold text-stone-400 group-hover:text-stone-600 transition-colors">{label}</span>
  </div>
);