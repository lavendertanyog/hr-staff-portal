"use client";

// Profile card listing the devices where the user ticked "Remember me on this device".
// This file is identical in all four portals — change every copy together.

import React, { useCallback, useEffect, useState } from 'react';
import { authHeaders, getSessionToken } from '../authSession';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

const PORTAL_NAMES = {
  staff: 'Staff portal',
  manager: 'Manager portal',
  account_manager: 'Account Manager portal',
  hr: 'HR portal',
};

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RememberedDevices({ refreshKey }) {
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'signed-out' | 'error'
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    if (!getSessionToken()) { setStatus('signed-out'); return; }
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/sessions`, { headers: authHeaders() });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 401) { setStatus('signed-out'); return; }
      if (!res.ok) { setStatus('error'); return; }
      setDevices(payload.data || []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const revoke = async (body, busy, doneText) => {
    setBusyId(busy);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/sessions/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(payload.error || 'Could not sign out the device.', 'error'); return; }
      showToast(doneText);
      await load();
    } catch {
      showToast('Unable to reach server.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const others = devices.filter((d) => !d.is_current);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Remembered Devices</p>
          <p className="mt-2 text-sm text-slate-500">
            Devices where you ticked “Remember me on this device”. They sign in without a password until the date shown.
          </p>
        </div>
        {status === 'ready' && others.length > 0 && (
          <button type="button" disabled={Boolean(busyId)}
            onClick={() => revoke({ allOthers: true }, 'all', 'Signed out of all other devices.')}
            className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            {busyId === 'all' ? 'Signing out…' : 'Sign out all other devices'}
          </button>
        )}
      </div>

      <div className="mt-5">
        {status === 'loading' && <p className="text-sm text-slate-400">Loading…</p>}
        {status === 'signed-out' && <p className="text-sm text-slate-400">Log out and log in again to see your remembered devices.</p>}
        {status === 'error' && <p className="text-sm text-slate-400">Could not load your devices. Refresh the page to try again.</p>}
        {status === 'ready' && devices.length === 0 && (
          <p className="text-sm text-slate-400">No remembered devices. Tick “Remember me on this device” when you log in to add one.</p>
        )}
        {status === 'ready' && devices.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {devices.map((d) => (
              <li key={d.session_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {d.device_label || 'Unknown device'}
                    <span className="font-normal text-slate-500"> · {PORTAL_NAMES[d.portal] || 'Portal'}</span>
                    {d.is_current && (
                      <span className="ml-2 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#E8EEFF', color: '#1a3a8f' }}>This device</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Last signed in {formatDate(d.created_at)} · Remembered until {formatDate(d.expires_at)}
                  </p>
                </div>
                {d.is_current ? (
                  <p className="text-xs text-slate-400">Use Log out to sign out here</p>
                ) : (
                  <button type="button" disabled={Boolean(busyId)}
                    onClick={() => revoke({ sessionId: d.session_id }, d.session_id, 'Device signed out.')}
                    className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                    {busyId === d.session_id ? 'Signing out…' : 'Sign out'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white' : 'bg-slate-900 border-slate-950 text-white'
          }`}>{toast.text}</div>
        </div>
      )}
    </div>
  );
}
