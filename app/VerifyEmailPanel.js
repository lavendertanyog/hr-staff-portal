"use client";

import React, { useEffect, useState } from 'react';

const COOLDOWN_SECONDS = 60;
const HR_CONTACT = 'hr.admin@nextan.com.sg';

// Shown in place of the login form while an account is waiting for email verification: right
// after signup, and when a login is refused because the email isn't verified yet. The resend
// button waits 60 seconds between sends so a slow inbox doesn't turn into a flood of emails.
// `initialStatus`: 'sent' (we just sent it), 'unverified' (nothing sent yet), or 'failed'.
export default function VerifyEmailPanel({ apiBase, email, initialStatus = 'sent', onBack }) {
  const [status, setStatus] = useState(initialStatus);
  const [sending, setSending] = useState(false);
  const [left, setLeft] = useState(initialStatus === 'sent' ? COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const resend = async () => {
    setSending(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, portalUrl: window.location.origin }),
      });
      if (res.ok) { setStatus('sent'); setLeft(COOLDOWN_SECONDS); } else { setStatus('failed'); }
    } catch {
      setStatus('failed');
    } finally {
      setSending(false);
    }
  };

  const waiting = left > 0;
  const label = sending ? 'Sending…' : waiting ? `Resend in ${left}s` : status === 'failed' ? 'Try again' : 'Resend email';

  return (
    <div className="space-y-5 text-center" role="status" aria-live="polite">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: '#E6F1FB', color: '#1a3a8f' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" />
        </svg>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {status === 'unverified' ? 'This email hasn’t been verified yet. Use the link we sent to' : 'We sent a verification link to'}
          <br />
          <span className="font-semibold text-slate-800 break-all">{email}</span>
        </p>
      </div>

      <div className="min-h-[20px] text-sm">
        {status === 'sent' && <p className="text-emerald-700">Email sent. Check your inbox.</p>}
        {status === 'failed' && <p className="text-red-500">We couldn’t send the email. Try again, or contact HR.</p>}
      </div>

      <button type="button" onClick={resend} disabled={sending || waiting}
        className="w-full rounded-xl py-3.5 text-base font-bold text-white transition disabled:opacity-60"
        style={{ background: '#0c3b8f' }}>
        {label}
      </button>

      <div className="rounded-xl bg-slate-50 px-4 py-3 text-left text-xs leading-relaxed text-slate-500">
        <p className="mb-1 font-semibold text-slate-700">Can’t find it?</p>
        <p>
          Check your Junk or Spam folder for mail from <span className="font-mono">noreply@mail.nextantech.com</span>.
          Still nothing after 5 minutes? Contact HR at {HR_CONTACT} and they can activate your account.
        </p>
      </div>

      <button type="button" onClick={onBack} className="text-sm font-semibold text-blue-700 hover:underline">
        Back to log in
      </button>
    </div>
  );
}
