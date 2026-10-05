"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WHATS_NEW_LATEST_ID, WHATS_NEW_SEEN_KEY } from './whatsNewData';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function WhatsNewButton() {
  const [seenId, setSeenId] = useState(0);

  useEffect(() => {
    try { setSeenId(Number(localStorage.getItem(WHATS_NEW_SEEN_KEY)) || 0); } catch {}
  }, []);

  const hasUnseen = seenId < WHATS_NEW_LATEST_ID;

  const markSeen = () => {
    try { localStorage.setItem(WHATS_NEW_SEEN_KEY, String(WHATS_NEW_LATEST_ID)); } catch {}
    setSeenId(WHATS_NEW_LATEST_ID);
  };

  return (
    <Link href="/whats-new" onClick={markSeen} aria-label="What's new"
      className="relative flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
      style={{ width: 36, height: 36 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
      </svg>
      {hasUnseen && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />}
    </Link>
  );
}

// Every page, and every named feature/action on those pages, so typing "clock in" or
// "budget" finds the right place even if the user doesn't know which page it lives on.
const SEARCH_INDEX = [
  { label: 'Dashboard', href: '/dashboard', section: 'Page', keywords: 'home overview welcome' },
  { label: 'Attendance', href: '/attendance', section: 'Page', keywords: 'clock in out logs timesheet' },
  { label: 'Leave', href: '/leave', section: 'Page', keywords: 'apply leave calendar time off' },
  { label: 'Progress', href: '/progress', section: 'Page', keywords: 'weekly log budget project' },
  { label: 'Inbox', href: '/inbox', section: 'Page', keywords: 'notifications messages' },
  { label: 'Profile', href: '/profile', section: 'Page', keywords: 'account settings password change' },
  { label: 'Clock In / Clock Out', href: '/attendance', section: 'Action', keywords: 'clock in out attendance start end session live' },
  { label: 'Apply Leave', href: '/leave', section: 'Action', keywords: 'apply for leave request time off new' },
  { label: 'Log Progress', href: '/progress', section: 'Action', keywords: 'weekly project log update hours' },
  { label: 'Request Budget', href: '/progress?tab=budget', section: 'Action', keywords: 'budget request hours new' },
  { label: 'Manual Entry', href: '/attendance', section: 'Action', keywords: 'attendance manual backdate forgot clock in' },
  { label: 'Recent Entries', href: '/attendance', section: 'Section', keywords: 'attendance history log recent' },
  { label: 'Leave Calendar', href: '/leave', section: 'Section', keywords: 'calendar holidays leave month' },
  { label: 'Annual & Emergency Leave', href: '/leave', section: 'Section', keywords: 'annual emergency balance days' },
  { label: 'Sick Leave', href: '/leave', section: 'Section', keywords: 'sick mc medical' },
  { label: 'Weekly Project Log', href: '/progress', section: 'Section', keywords: 'progress hours logged project' },
  { label: 'Budget Requests', href: '/progress?tab=budget', section: 'Section', keywords: 'budget pending approved rejected' },
  { label: 'Change Password', href: '/profile', section: 'Action', keywords: 'password security account' },
  { label: 'Reset Password', href: '/profile', section: 'Action', keywords: 'password security account' },
  { label: 'Update Password', href: '/profile', section: 'Action', keywords: 'password security account' },
];

// Bolds/darkens the fragment of the label that actually matched what was typed and leaves
// the rest muted, so the row itself explains why it matched — no separate tag needed. When
// the match only came from a hidden keyword (not present in the label text), there's nothing
// to localize, so the whole label renders at normal weight instead of looking half-empty.
function HighlightedLabel({ label, query }) {
  if (!query) return <span>{label}</span>;
  const idx = label.toLowerCase().indexOf(query);
  if (idx === -1) return <span className="text-slate-900">{label}</span>;
  return (
    <span className="text-slate-400">
      {label.slice(0, idx)}
      <span className="text-slate-900 font-semibold">{label.slice(idx, idx + query.length)}</span>
      {label.slice(idx + query.length)}
    </span>
  );
}

function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? SEARCH_INDEX.filter((item) => item.label.toLowerCase().includes(q) || item.keywords.includes(q)).slice(0, 8)
    : [];

  useEffect(() => { setActiveIndex(0); }, [query]);

  const go = (item) => {
    setQuery('');
    setOpen(false);
    router.push(item.href);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIndex]) go(results[activeIndex]);
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 max-w-md">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" placeholder="Search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none" />
      </div>
      {open && q && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-lg py-2 z-30 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">No matches for "{query}"</p>
          ) : results.map((item, i) => (
            <button key={`${item.href}-${item.label}`} type="button"
              onClick={() => go(item)} onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left rounded-xl ${i === activeIndex ? 'bg-slate-50' : ''}`}>
              <span className="text-sm"><HighlightedLabel label={item.label} query={q} /></span>
              {i === activeIndex && (
                <kbd className="flex-shrink-0 text-[10px] border border-slate-300 rounded px-1.5 py-0.5 text-slate-400">↵</kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ onMenuClick }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('staff_portal_user');
    sessionStorage.removeItem('staff_attendance_id');
    sessionStorage.removeItem('staff_attendance_project');
    sessionStorage.removeItem('staff_attendance_user_id');
    router.push('/');
  };

  const displayName = deriveNameFromEmail(user?.email) || user?.full_name || 'Staff';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || 'ST';

  return (
    <div className="sticky top-0 z-20 px-8 pt-4 pb-2 bg-white">
      <div className="flex items-center gap-3 rounded-full bg-white border border-slate-200 shadow-sm px-4 py-2.5">
        {/* Hamburger */}
        <button type="button" onClick={onMenuClick} aria-label="Toggle menu"
          className="flex-shrink-0 flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          style={{ width: 36, height: 36 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Search */}
        <div className="flex-1 min-w-0">
          <SearchBox />
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <WhatsNewButton />
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button type="button" onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications"
              className="flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
              style={{ width: 36, height: 36 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-lg p-4 z-30">
                <p className="text-sm font-semibold text-slate-800 mb-1">Notifications</p>
                <p className="text-xs text-slate-500">Check your Inbox for updates.</p>
                <Link href="/inbox" onClick={() => setNotifOpen(false)}
                  className="mt-3 inline-block text-xs font-semibold" style={{ color: '#1a3a8f' }}>
                  Go to Inbox →
                </Link>
              </div>
            )}
          </div>

          {/* Calendar / leave shortcut */}
          <Link href="/leave" aria-label="Leave calendar"
            className="flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
            style={{ width: 36, height: 36 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </Link>

          <div className="w-px self-stretch bg-slate-200 mx-1" />

          {/* Avatar + name dropdown */}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition hover:bg-slate-100">
              <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
                style={{ width: 30, height: 30, background: '#1a3a8f' }}>
                {initials}
              </div>
              <span className="hidden sm:block text-sm font-semibold text-slate-800 truncate max-w-[120px]">{displayName}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-slate-200 bg-white shadow-lg py-2 z-30">
                <Link href="/profile" onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Profile</Link>
                <button type="button" onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
