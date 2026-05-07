'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

function AdminLoginForm() {
  const router       = useRouter();
  const params       = useSearchParams();
  const from         = params.get('from') || '/admin';

  const [password, setPassword]   = useState('');
  const [showPw,   setShowPw]     = useState(false);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        setLoading(false);
        return;
      }

      router.push(from);
      router.refresh();
    } catch {
      setError('Network error — please try again.');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm"
    >
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-[0_8px_32px_rgba(124,58,237,0.4)] mb-4">
          <Zap size={28} className="text-primary-foreground fill-primary-foreground" />
        </div>
        <h1 className="font-display text-2xl font-black text-foreground tracking-tight">
          Two<span className="text-primary">Sure</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Control Center</p>
      </div>

      {/* Card */}
      <div className="card-base p-8">
        <div className="flex items-center gap-2 mb-6">
          <Lock size={16} className="text-primary" />
          <h2 className="font-semibold text-foreground text-sm">Authenticate</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="section-label block mb-2">Admin Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your admin password"
                className="form-input pr-11"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPw(v => !v)}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="btn-primary w-full justify-center"
          >
            {loading
              ? <><Loader2 size={15} className="animate-spin" /> Verifying…</>
              : <><Lock size={15} /> Access Admin Panel</>
            }
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Protected by TwoSure session authentication.
      </p>
    </motion.div>
  );
}

export default function AdminLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      {/* Decorative blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="blob-purple w-[500px] h-[500px] -top-24 -left-24 animate-blob opacity-30" />
        <div className="blob-cyan   w-[400px] h-[400px] bottom-0  right-0  animate-blob-slow opacity-20" />
      </div>

      <Suspense fallback={
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Initializing secure session...</p>
        </div>
      }>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
