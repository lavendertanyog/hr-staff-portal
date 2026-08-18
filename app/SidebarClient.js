"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function formatRole(role) {
  return String(role || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Attendance', href: '/attendance' },
  { label: 'Leave', href: '/leave' },
  { label: 'Progress', href: '/progress' },
  { label: 'Inbox', href: '/inbox' },
];

// Module-level: resets on every full page reload.
let _staff_lastVerified = 0;

export default function SidebarClient({ isDrawer = false, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, [pathname]);

  // Re-verify roles against DB on each navigation (always on page load, throttled 3 min in-page)
  useEffect(() => {
    const stored = sessionStorage.getItem('staff_portal_user');
    if (!stored) return;
    const u = JSON.parse(stored);
    if (!u?.user_id) return;
    if (Date.now() - _staff_lastVerified < 3 * 60 * 1000) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
    fetch(`${API_BASE}/api/v1/auth/verify-session?userId=${u.user_id}`)
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) { handleLogout(); return; }
        const { user_roles, user_role, account_status } = payload.data;
        const roles = Array.isArray(user_roles) && user_roles.length > 0 ? user_roles : [user_role].filter(Boolean);
        const active = String(account_status || 'active').toLowerCase() === 'active';
        const VALID = ['staff', 'manager', 'account_manager', 'hr'];
        const hasAccess = active && roles.some((r) => VALID.includes(r));
        _staff_lastVerified = Date.now();
        if (!hasAccess) handleLogout();
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
    const VALID = ['staff', 'manager', 'account_manager', 'hr'];
    const id = setInterval(() => {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) return;
      const u = JSON.parse(stored);
      if (!u?.user_id) return;
      fetch(`${API_BASE}/api/v1/auth/verify-session?userId=${u.user_id}`)
        .then((r) => r.json())
        .then((payload) => {
          if (!payload.success) { handleLogout(); return; }
          const { user_roles, user_role, account_status } = payload.data;
          const roles = Array.isArray(user_roles) && user_roles.length > 0 ? user_roles : [user_role].filter(Boolean);
          const hasAccess = String(account_status || 'active').toLowerCase() === 'active' && roles.some((r) => VALID.includes(r));
          _staff_lastVerified = Date.now();
          if (!hasAccess) handleLogout();
        }).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    // Clear user session AND any stale clock-in state so the next login starts clean
    sessionStorage.removeItem('staff_portal_user');
    sessionStorage.removeItem('staff_attendance_id');
    sessionStorage.removeItem('staff_attendance_project');
    sessionStorage.removeItem('staff_attendance_user_id');
    router.push('/');
  };

  if (!user) return null;

  const displayName = deriveNameFromEmail(user?.email) || user?.full_name || 'Staff';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || 'ST';
  const roles = Array.isArray(user?.user_roles) && user.user_roles.length > 0 ? user.user_roles : [user?.user_role].filter(Boolean);

  const sidebarStyle = isDrawer
    ? { width: 280, minHeight: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50, boxShadow: '0 20px 60px rgba(15,23,42,0.18)' }
    : { width: 240, minHeight: '100vh', borderRight: '1px solid #e5e7eb' };

  return (
    <aside className="flex flex-col bg-white" style={sidebarStyle}>
      {isDrawer && (
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Navigation</span>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Logo */}
      <div className="flex items-center justify-center" style={{ padding: '28px 24px 20px' }}>
        {!logoMissing ? (
          <img src="/nextan-logo.png" alt="Nextan" width={150} height={45}
            className="object-contain"
            onError={() => setLogoMissing(true)} />
        ) : (
          <span className="text-lg font-bold text-blue-900 tracking-tight">nextan</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3" style={{ paddingTop: 8 }}>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className="flex items-center rounded-2xl text-sm font-medium transition-colors"
              style={{
                padding: '13px 18px',
                marginBottom: 6,
                background: active ? '#e8edf8' : 'white',
                color: active ? '#1a3a8f' : '#374151',
                fontWeight: active ? 600 : 500,
              }}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile block */}
      <div className="px-3 pb-5 pt-3" style={{ borderTop: '1px solid #f0f0f0' }}>
        <div className="flex items-center gap-3 rounded-2xl" style={{ background: '#f5f7fc', padding: '12px 14px' }}>
          <div className="flex items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0"
            style={{ width: 38, height: 38, background: '#1a3a8f', fontSize: 13 }}>
            {initials}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold truncate" style={{ color: '#111827', lineHeight: 1.3 }}>{displayName}</p>
            <p className="text-xs truncate" style={{ color: '#6b7280', marginTop: 1 }}>Staff</p>
          </div>
          <button onClick={handleLogout} title="Log out"
            className="flex-shrink-0 flex items-center justify-center rounded-lg transition hover:bg-red-50"
            style={{ width: 30, height: 30, color: '#9ca3af' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
