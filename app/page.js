"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

export default function StaffLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [logoMissing, setLogoMissing] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resending, setResending] = useState(false);

  const handleResendVerification = async () => {
    setResending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail, portalUrl: window.location.origin }),
      });
      const payload = await res.json();
      setInfoMessage(res.ok ? 'If an unverified account exists for that email, a new verification link has been sent.' : (payload.error || 'Failed to resend.'));
      setUnverifiedEmail('');
    } catch {
      setError('Unable to reach server. Try again.');
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    try { sessionStorage.removeItem('staff_portal_user'); } catch {}
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfoMessage(''); setUnverifiedEmail('');
    const norm = email.trim().toLowerCase();
    if (!norm.endsWith('@nextan.com.sg')) { setError('Only @nextan.com.sg emails are allowed.'); return; }
    if (mode !== 'reset' && (!password || password.length < 6)) { setError('Password must be at least 6 characters.'); return; }
    if (mode === 'signup' && password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const endpoint = mode === 'signup' ? '/api/v1/auth/signup'
        : mode === 'reset' ? '/api/v1/auth/forgot-password'
        : '/api/v1/auth/login';
      const body = mode === 'reset'
        ? { email: norm, portalUrl: window.location.origin }
        : mode === 'signup'
          ? { email: norm, password, userRole: 'staff', portalUrl: window.location.origin }
          : { email: norm, password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.unverified) {
          setUnverifiedEmail(norm);
        }
        setError(payload.error || payload.detail || 'Authentication failed.');
        setLoading(false);
        return;
      }

      if (mode === 'reset') {
        setMode('login'); setPassword(''); setConfirmPassword(''); setLoading(false);
        setInfoMessage('If an account exists for that email, a temporary password has been sent — check your inbox and log in with it.');
        return;
      }
      if (mode === 'signup') {
        setMode('login'); setPassword(''); setConfirmPassword(''); setLoading(false);
        setInfoMessage('Account created. Check your email for a link to verify your account before signing in.');
        return;
      }
      const user = { ...payload.data, full_name: deriveNameFromEmail(norm) };
      const roles = Array.isArray(user.user_roles) ? user.user_roles.map((r) => String(r).toLowerCase()) : [String(user.user_role || '').toLowerCase()];
      if (!roles.some((r) => ['staff', 'manager', 'account_manager', 'hr'].includes(r))) {
        setError('No valid role found for this account.'); setLoading(false); return;
      }
      sessionStorage.setItem('staff_portal_user', JSON.stringify(user));
      // Clear any stale clock-in state from a previous user's session
      sessionStorage.removeItem('staff_attendance_id');
      sessionStorage.removeItem('staff_attendance_project');
      sessionStorage.removeItem('staff_attendance_user_id');
      router.push('/dashboard');
    } catch {
      setError(`Unable to reach server (${API_BASE}). Check backend status and try again.`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#d6e4f7' }}>
      <div className="flex w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl" style={{ minHeight: 480 }}>

        {/* Left blue panel */}
        <div className="relative hidden md:flex flex-col justify-center items-center text-center w-1/2 p-12 text-white"
          style={{ background: 'linear-gradient(160deg, #1a56db 0%, #1235a8 60%, #0c2075 100%)' }}>
          <div className="absolute left-10 top-10">
            {!logoMissing ? (
              <Image src="/nextan-logo.png" alt="Nextan" width={150} height={50}
                className="object-contain brightness-0 invert" onError={() => setLogoMissing(true)} />
            ) : (
              <span className="text-xs uppercase tracking-[0.24em] text-white/80">NEXTAN</span>
            )}
          </div>
          <div className="flex flex-col items-center justify-center h-full">
            <h2 className="text-3xl font-bold mb-3">Nextan Staff Portal</h2>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfoMessage(''); setUnverifiedEmail(''); }}
              className="mt-8 px-5 py-2 rounded-full border border-white/40 text-sm font-medium hover:bg-white/10 transition">
              {mode === 'login' ? 'Create Account' : 'Back to Sign In'}
            </button>
          </div>
        </div>

        {/* Right white panel */}
        <div className="flex flex-col justify-center w-full md:w-1/2 bg-white p-10 md:p-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            {mode === 'login' ? 'Hello Again!' : mode === 'signup' ? 'Create Account' : 'Forgot Password'}
          </h1>
          <p className="text-slate-500 text-base mb-8">
            {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Register with your Nextan email' : 'Enter your email and we’ll send you a temporary password'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email ID</label>
              <div className="relative">
                <span className="absolute left-3 top-3.5 text-slate-400" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                </span>
                <input type="email" placeholder="Enter your email id" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
            </div>

            {/* Password */}
            {mode !== 'reset' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-slate-400" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <button type="button" className="absolute right-3 top-3.5 text-slate-400"
                    onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              </div>
            )}

            {/* Confirm password */}
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-slate-400" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <button type="button" className="absolute right-3 top-3.5 text-slate-400"
                    onClick={() => setShowConfirmPassword((v) => !v)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <input type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-4 py-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              </div>
            )}

            {/* Remember me + Forgot password */}
            {mode === 'login' && (
              <div className="flex items-center justify-between text-sm text-slate-500">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className="rounded border-slate-300" />
                  Remember Me
                </label>
                <button type="button" className="text-cyan-700 hover:underline"
                  onClick={() => { setMode('reset'); setError(''); setInfoMessage(''); setUnverifiedEmail(''); }}>Forgot password</button>
              </div>
            )}

            {error && <p className="text-red-500 text-xs">{error}</p>}
            {unverifiedEmail && (
              <button type="button" onClick={handleResendVerification} disabled={resending}
                className="text-cyan-700 hover:underline text-xs disabled:opacity-60">
                {resending ? 'Sending…' : 'Resend verification email'}
              </button>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white text-base transition"
              style={{ background: '#0c3b8f' }}>
              {loading ? 'Please wait\u2026' : mode === 'login' ? 'LOGIN' : mode === 'signup' ? 'SIGN UP' : 'SEND TEMPORARY PASSWORD'}
            </button>
          </form>

          {infoMessage && <p className="text-center text-emerald-700 text-sm mt-4">{infoMessage}</p>}

          <p className="text-center text-base text-slate-700 mt-6">
            {mode === 'login' ? (
              <>No account?{' '}
                <button className="text-blue-700 font-semibold" onClick={() => { setMode('signup'); setError(''); setInfoMessage(''); setUnverifiedEmail(''); }}>Sign up</button>
              </>
            ) : mode === 'signup' ? (
              <>Already have an account?{' '}
                <button className="text-blue-700 font-semibold" onClick={() => { setMode('login'); setError(''); setInfoMessage(''); setUnverifiedEmail(''); }}>Sign in</button>
              </>
            ) : (
              <>Remember your password?{' '}
                <button className="text-blue-700 font-semibold" onClick={() => { setMode('login'); setError(''); setInfoMessage(''); setUnverifiedEmail(''); }}>Back to login</button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
