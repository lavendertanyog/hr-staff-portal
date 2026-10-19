"use client";

import React, { useEffect, useState } from 'react';
import { authHeaders } from '../authSession';
import RememberedDevices from './RememberedDevices';
import { useT } from '../i18n/LanguageProvider';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function formatRole(role) {
  return String(role || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export default function SettingsPage() {
  const { t, lang, setLanguage } = useT();
  const [user, setUser] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [languageSaved, setLanguageSaved] = useState(false);
  const showLanguageSaved = () => {
    setLanguageSaved(true);
    setTimeout(() => setLanguageSaved(false), 3000);
  };
  const [devicesRefreshKey, setDevicesRefreshKey] = useState(0);
  const SECTIONS = ['password', 'profile', 'language', 'devices'];
  const [section, setSection] = useState('password');
  const chooseSection = (id) => {
    setSection(id);
    try { window.history.replaceState(null, '', '#' + id); } catch {}
  };

  useEffect(() => {
    const wanted = window.location.hash.replace('#', '');
    if (SECTIONS.includes(wanted)) setSection(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setError(t("Please fill in all fields."));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("New password must be at least 6 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("New passwords do not match."));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ userId: user?.user_id, currentPassword, newPassword }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(t(payload.error || 'Failed to change password.'));
        setLoading(false);
        return;
      }
      setSuccess(t("Password updated successfully. Your other devices have been signed out."));
      setDevicesRefreshKey((k) => k + 1);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    } catch {
      setError(t("Unable to reach server."));
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
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">{t("Account")}</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">{t("Settings")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("Your password, profile, language and saved devices.")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:self-start" aria-label={t("Settings")}>
          <button key="password" type="button" onClick={() => chooseSection('password')}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${section === 'password' ? 'bg-[#e8edf8] font-semibold text-[#1a3a8f]' : 'text-slate-500 hover:bg-slate-100'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
            {t("Password")}
          </button>
          <button key="profile" type="button" onClick={() => chooseSection('profile')}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${section === 'profile' ? 'bg-[#e8edf8] font-semibold text-[#1a3a8f]' : 'text-slate-500 hover:bg-slate-100'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
            {t("Profile")}
          </button>
          <button key="language" type="button" onClick={() => chooseSection('language')}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${section === 'language' ? 'bg-[#e8edf8] font-semibold text-[#1a3a8f]' : 'text-slate-500 hover:bg-slate-100'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>
            {t("Language")}
          </button>
          <button key="devices" type="button" onClick={() => chooseSection('devices')}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${section === 'devices' ? 'bg-[#e8edf8] font-semibold text-[#1a3a8f]' : 'text-slate-500 hover:bg-slate-100'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            {t("Saved devices")}
          </button>
        </nav>
        <div className="min-w-0">
        {section === 'password' && (
          <div>
              {/* Change password card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{t("Change Password")}</p>
                <p className="mt-2 text-sm text-slate-500">{t("If you logged in with a temporary password sent by email, set a new password here.")}</p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-5 max-w-md">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t("Current Password")}</label>
                    <input type="password" placeholder={t("Enter your current password")} value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t("New Password")}</label>
                    <input type="password" placeholder={t("Enter a new password")} value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t("Confirm New Password")}</label>
                    <input type="password" placeholder={t("Confirm your new password")} value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>

                  {error && <p className="text-red-500 text-xs">{error}</p>}
                  {success && <p className="text-emerald-600 text-xs">{success}</p>}

                  <button type="submit" disabled={loading}
                    className="rounded-xl font-bold text-white text-sm px-6 py-3 transition"
                    style={{ background: '#0c3b8f' }}>
                    {loading ? t("Please wait…") : t("Update Password")}
                  </button>
                </form>
              </div>
          </div>
        )}
        {section === 'profile' && (
          <div>
              {/* Account info card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
                      {t(formatRole(r))}
                    </span>
                  )) : (
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#e8edf8', color: '#1a3a8f' }}>{t("Staff")}</span>
                  )}
                </div>
              </div>
          </div>
        )}
        {section === 'language' && (
          <div>
              {/* Language card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{t("Language")}</p>
                <p className="mt-2 text-sm text-slate-500">{t("Used for menus, buttons and emails")}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => { setLanguage('en'); showLanguageSaved(); }} aria-pressed={lang === 'en'}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition ${lang === 'en' ? 'border-2 border-[#1a3a8f] bg-[#f4f7ff]' : 'border border-slate-200 hover:bg-slate-50'}`}>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">English</span>
                      <span className="block text-xs text-slate-500">{t("Default")}</span>
                    </span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={lang === 'en' ? '#1a3a8f' : '#cbd5e1'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/>{lang === 'en' && <path d="M8 12l3 3 5-6"/>}</svg>
                  </button>
                  <button type="button" onClick={() => { setLanguage('zh'); showLanguageSaved(); }} aria-pressed={lang === 'zh'}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition ${lang === 'zh' ? 'border-2 border-[#1a3a8f] bg-[#f4f7ff]' : 'border border-slate-200 hover:bg-slate-50'}`}>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">中文</span>
                      <span className="block text-xs text-slate-500">{t("Mandarin, simplified")}</span>
                    </span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={lang === 'zh' ? '#1a3a8f' : '#cbd5e1'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/>{lang === 'zh' && <path d="M8 12l3 3 5-6"/>}</svg>
                  </button>
                </div>
              </div>
          </div>
        )}
        {section === 'devices' && (
          <div>
              <RememberedDevices refreshKey={devicesRefreshKey} />
          </div>
        )}
        </div>
      </div>
      {languageSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className="rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border bg-slate-900 border-slate-950 text-white">{t("Language saved")}</div>
        </div>
      )}
    </div>
  );
}
