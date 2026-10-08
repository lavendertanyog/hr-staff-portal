"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { authHeaders, endSession } from './authSession';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: 'grid' },
  { label: 'Attendance', href: '/attendance', icon: 'clock' },
  { label: 'Leave', href: '/leave', icon: 'calendar' },
  { label: 'Calendar', href: '/calendar', icon: 'calendar-days' },
  { label: 'Progress', href: '/progress', icon: 'trending' },
  { label: 'Inbox', href: '/inbox', icon: 'inbox' },
];

function NavIcon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'grid':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case 'calendar-days':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" /></svg>;
    case 'trending':
      return <svg {...common}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
    case 'inbox':
      return <svg {...common}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>;
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default:
      return null;
  }
}

// Module-level: resets on every full page reload.
let _staff_lastVerified = 0;

export default function SidebarClient({ isDrawer = false, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoMissing, setLogoMissing] = useState(false);
  // Desktop rail can collapse to icons only; the choice is remembered in this browser.
  const [collapsed, setCollapsed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
    return next;
  });
  const menuRef = useRef(null);

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
    fetch(`${API_BASE}/api/v1/auth/verify-session?userId=${u.user_id}`, { headers: authHeaders() })
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
      fetch(`${API_BASE}/api/v1/auth/verify-session?userId=${u.user_id}`, { headers: authHeaders() })
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

  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = () => {
    endSession();
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

  // Mobile drawer keeps the original full-width list layout — the icon rail below is desktop-only.
  if (isDrawer) {
    return (
      <aside className="flex flex-col bg-white" style={{ width: 280, minHeight: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50, boxShadow: '0 20px 60px rgba(15,23,42,0.18)' }}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Navigation</span>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-center" style={{ padding: '28px 24px 20px' }}>
          <img src="/nextan-logo.png" alt="Nextan" width={150} height={45} className="object-contain" />
        </div>

        <nav className="flex-1 px-3" style={{ paddingTop: 8 }}>
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 rounded-2xl text-sm font-medium transition-colors"
                style={{
                  padding: '13px 18px',
                  marginBottom: 6,
                  background: active ? '#e8edf8' : 'white',
                  color: active ? '#1a3a8f' : '#374151',
                  fontWeight: active ? 600 : 500,
                }}>
                <NavIcon name={item.icon} size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-5 pt-3" style={{ borderTop: '1px solid #f0f0f0' }}>
          <div className="flex items-center gap-3 rounded-2xl" style={{ background: '#f5f7fc', padding: '12px 14px' }}>
            <Link href="/profile" className="flex items-center gap-3 flex-1 overflow-hidden" title="View profile">
              <div className="flex items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0"
                style={{ width: 38, height: 38, background: '#1a3a8f', fontSize: 13 }}>
                {initials}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold truncate" style={{ color: '#111827', lineHeight: 1.3 }}>{displayName}</p>
                <p className="text-xs truncate" style={{ color: '#6b7280', marginTop: 1 }}>Staff</p>
              </div>
            </Link>
            <button onClick={handleLogout} title="Log out"
              className="flex-shrink-0 flex items-center justify-center rounded-lg transition hover:bg-red-50"
              style={{ width: 30, height: 30, color: '#9ca3af' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Desktop: pill-shaped icon rail, floating with a tight margin, pure-CSS stadium (no SVG,
  // no JS-measured height — the fixed top/bottom offsets alone define its shape, so nothing
  // can drift out of sync). Nav items cluster near the top. The active item is a modestly
  // wider capsule, same color as the content pane, that pokes just past the rail's edge —
  // a small, restrained highlight rather than a large separate shape. Settings sits pinned to
  // the very bottom of this SAME element so the navy always shows behind/around it, clipped by
  // its own overflow wrapper so only the top half is visible.
  const PAGE_BG = '#ffffff';
  const RAIL_W = collapsed ? 64 : 140;
  const MARGIN = 10;
  const PILL_W = collapsed ? 48 : 72;

  return (
    <div style={{ width: MARGIN + RAIL_W, flexShrink: 0, position: 'relative', transition: 'width 200ms ease' }}>
      {/* No background of its own — the page behind it is already navy (see AppShell),
          so there's no seam between this rail and the rest of the backdrop to misalign. */}
      <aside
        className="flex flex-col"
        style={{
          position: 'fixed', top: MARGIN, bottom: MARGIN, left: MARGIN, width: RAIL_W, transition: 'width 200ms ease',
          zIndex: 30,
        }}
      >
        {/* Collapse / expand the rail (icons only when collapsed) — remembered per browser */}
        <button type="button" onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="absolute flex items-center justify-center rounded-lg text-[#aab8e0] transition hover:bg-white/10 hover:text-white"
          style={{ top: 12, right: collapsed ? (RAIL_W - 32) / 2 : 8, width: 32, height: 32, zIndex: 31 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" style={{ transform: collapsed ? 'scaleX(-1)' : 'none', transition: 'transform 200ms ease' }}>
            <line x1="11" y1="6" x2="21" y2="6" /><line x1="11" y1="12" x2="21" y2="12" /><line x1="11" y1="18" x2="21" y2="18" /><polyline points="7 8 3 12 7 16" />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center justify-center" style={{ paddingTop: collapsed ? 28 : 50, paddingBottom: 4 }}>
          {collapsed ? (
            <span aria-hidden="true" style={{ display: 'block', height: 20 }} />
          ) : !logoMissing ? (
            <img src="/nextan-logo.png" alt="Nextan" width={156} height={48}
              className="object-contain brightness-0 invert"
              onError={() => setLogoMissing(true)} />
          ) : (
            <span className="text-sm font-bold text-white tracking-tight">nextan</span>
          )}
        </div>

        <nav className="flex flex-col items-center" style={{ paddingTop: 20 }}>
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                title={item.label}
                aria-label={item.label}
                className="flex flex-col items-center justify-center transition-all"
                style={{
                  width: collapsed ? (active ? 44 : 40) : (active ? 80 : 69),
                  height: collapsed ? (active ? 44 : 40) : (active ? 132 : 69),
                  borderRadius: collapsed ? (active ? 14 : 12) : (active ? 40 : 18),
                  margin: collapsed ? (active ? '6px 0' : '4px 0') : (active ? '18px 0' : '6px 0'),
                  gap: 7,
                  background: active ? PAGE_BG : 'transparent',
                  color: active ? '#16307a' : '#aab8e0',
                }}>
                <NavIcon name={item.icon} size={active ? 20 : 18} />
                {!collapsed && <span style={{ fontSize: 11, fontWeight: active ? 600 : 500, lineHeight: 1 }}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Settings / profile — a half pill flush against the bottom edge: rounded top,
            flat bottom, no gap, so it reads as cut off by the screen's edge. */}
        <div ref={menuRef}>
          <div style={{ position: 'absolute', bottom: 0, left: (RAIL_W - PILL_W) / 2, width: PILL_W }}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Settings"
              className="flex items-center justify-center"
              style={{
                width: PILL_W, height: collapsed ? 64 : 93, borderRadius: collapsed ? '24px 24px 0 0' : '36px 36px 0 0',
                background: '#f0c9dc', color: '#16307a', border: 'none', cursor: 'pointer',
              }}>
              <NavIcon name="settings" size={18} />
            </button>
          </div>
          {menuOpen && (
            <div className="absolute rounded-2xl border border-slate-200 bg-white shadow-lg py-2 z-30"
              style={{ bottom: collapsed ? 72 : 101, left: (RAIL_W - PILL_W) / 2, width: 150 }}>
              <Link href="/profile" onClick={() => setMenuOpen(false)}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Profile</Link>
              <button type="button" onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Log out</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
