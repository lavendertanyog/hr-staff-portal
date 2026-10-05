"use client";

import React, { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function formatRole(role) {
  return String(role || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.user_id, currentPassword, newPassword }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || 'Failed to change password.');
        setLoading(false);
        return;
      }
      setSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    } catch {
      setError(`Unable to reach server (${API_BASE}). Check backend status and try again.`);
      setLoading(false);
    }
  };

  const displayName = deriveNameFromEmail(user?.email) || user?.full_name || 'Staff';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || 'ST';
  const roles = Array.isArray(user?.user_roles) && user.user_roles.length > 0 ? user.user_roles : [user?.user_role].filter(Boolean);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Account</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Profile</h1>
        <p className="mt-2 text-sm text-slate-500">Manage your account details and password.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Account info card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center rounded-full text-white text-lg font-bold flex-shrink-0"
              style={{ width: 56, height: 56, background: '#1a3a8f' }}>
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-base font-semibold text-slate-950 truncate">{displayName}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email || '—'}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {roles.length > 0 ? roles.map((r) => (
              <span key={r} className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: '#e8edf8', color: '#1a3a8f' }}>
                {formatRole(r)}
              </span>
            )) : (
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#e8edf8', color: '#1a3a8f' }}>Staff</span>
            )}
          </div>
        </div>

        {/* Change password card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Change Password</p>
          <p className="mt-2 text-sm text-slate-500">
            If you logged in with a temporary password sent by email, set a new password here.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5 max-w-md">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Current Password</label>
              <input type="password" placeholder="Enter your current password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
              <input type="password" placeholder="Enter a new password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm New Password</label>
              <input type="password" placeholder="Confirm your new password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>

            {error && <p className="text-red-500 text-xs">{error}</p>}
            {success && <p className="text-emerald-600 text-xs">{success}</p>}

            <button type="submit" disabled={loading}
              className="rounded-xl font-bold text-white text-sm px-6 py-3 transition"
              style={{ background: '#0c3b8f' }}>
              {loading ? 'Please wait…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
