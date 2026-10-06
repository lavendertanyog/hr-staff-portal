"use client";

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'done' | 'error'
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('This verification link is missing its token.'); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const payload = await res.json();
        if (!res.ok) { setStatus('error'); setMessage(payload.error || 'Failed to verify email.'); return; }
        setStatus('done'); setMessage(payload.message || 'Email verified. You can now log in.');
      } catch {
        setStatus('error'); setMessage("Unable to reach server.");
      }
    })();
  }, [token]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim().toLowerCase(), portalUrl: window.location.origin }),
      });
      await res.json();
      setResendDone(true);
    } catch {
      setMessage("Unable to reach server.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#d6e4f7' }}>
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl bg-white p-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Verify email</h1>

        {status === 'verifying' && (
          <p className="text-slate-500 text-base">Verifying your email…</p>
        )}

        {status === 'done' && (
          <div>
            <p className="text-emerald-700 text-sm mb-6">{message}</p>
            <button type="button" onClick={() => router.push('/')}
              className="w-full py-3.5 rounded-xl font-bold text-white text-base transition"
              style={{ background: '#0c3b8f' }}>
              Back to login
            </button>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p className="text-red-500 text-sm mb-6">{message}</p>
            {resendDone ? (
              <p className="text-emerald-700 text-sm">If an unverified account exists for that email, a new verification link has been sent.</p>
            ) : (
              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Resend to your email</label>
                  <input type="email" placeholder="you@nextan.com.sg" value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <button type="submit" disabled={resending}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-base transition disabled:opacity-60"
                  style={{ background: '#0c3b8f' }}>
                  {resending ? 'Sending…' : 'Resend verification email'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
