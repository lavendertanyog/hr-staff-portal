"use client";

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!token) { setError('This reset link is missing its token.'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/reset-password-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const payload = await res.json();
      if (!res.ok) { setError(payload.error || 'Failed to reset password.'); setLoading(false); return; }
      setDone(true);
      setLoading(false);
    } catch {
      setError(`Unable to reach server (${API_BASE}). Check backend status and try again.`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#d6e4f7' }}>
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl bg-white p-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Reset Password</h1>
        <p className="text-slate-500 text-base mb-8">Choose a new password for your account.</p>

        {done ? (
          <div>
            <p className="text-emerald-700 text-sm mb-6">Password updated. You can now log in.</p>
            <button type="button" onClick={() => router.push('/')}
              className="w-full py-3.5 rounded-xl font-bold text-white text-base transition"
              style={{ background: '#0c3b8f' }}>
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
              <input type="password" placeholder="Enter your new password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
              <input type="password" placeholder="Confirm your new password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white text-base transition"
              style={{ background: '#0c3b8f' }}>
              {loading ? 'Please wait…' : 'RESET PASSWORD'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
