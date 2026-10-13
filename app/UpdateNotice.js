"use client";

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  WHATS_NEW,
  WHATS_NEW_LATEST_ID,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_NOTICE,
} from './whatsNewData';

// Shown once, on the first page after login, whenever the latest What's New entry hasn't been
// seen in this browser. Closing it (or opening What's New) marks the entry seen, which also
// clears the red dot. It shows a short summary; the full list lives on /whats-new.
const NOT_ON = ['/', '/whats-new', '/reset-password', '/verify-email'];

const ICON_PATHS = {
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  chart: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
  check: <><circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  sparkles: <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />,
};

function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || ICON_PATHS.sparkles}
    </svg>
  );
}

export default function UpdateNotice({ sessionKey }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!pathname || NOT_ON.includes(pathname)) { setOpen(false); return; }
    try {
      if (!sessionStorage.getItem(sessionKey)) { setOpen(false); return; }
      const seen = Number(localStorage.getItem(WHATS_NEW_SEEN_KEY)) || 0;
      setOpen(seen < WHATS_NEW_LATEST_ID);
    } catch { setOpen(false); }
  }, [pathname, sessionKey]);

  const markSeen = () => {
    try { localStorage.setItem(WHATS_NEW_SEEN_KEY, String(WHATS_NEW_LATEST_ID)); } catch {}
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') markSeen(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const date = WHATS_NEW[0]?.date || '';
  const items = WHATS_NEW_NOTICE.highlights;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={markSeen}>
      <div role="dialog" aria-modal="true" aria-labelledby="update-notice-title"
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-5" style={{ background: '#1a3a8f' }}>
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Icon name="sparkles" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs" style={{ color: '#b5d4f4' }}>{date}</p>
            <h2 id="update-notice-title" className="text-base font-semibold text-white leading-snug">
              What&apos;s new in the {WHATS_NEW_NOTICE.portal}
            </h2>
          </div>
        </div>

        <ul className="space-y-3 px-6 pt-5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-slate-800">
              <span className="mt-0.5 flex-shrink-0" style={{ color: '#1a3a8f' }}><Icon name={item.icon} size={18} /></span>
              <span><span className="font-semibold">{item.lead}</span>{item.text ? ` ${item.text}` : ''}</span>
            </li>
          ))}
        </ul>

        <div className="px-6 pb-4 pt-4">
          <button type="button"
            onClick={() => { markSeen(); router.push('/whats-new'); }}
            className="text-sm underline-offset-2 hover:underline" style={{ color: '#1a3a8f' }}>
            See all updates
          </button>
        </div>

        <div className="border-t border-slate-100">
          <button ref={closeRef} type="button" onClick={markSeen}
            className="w-full py-4 text-sm font-semibold transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50"
            style={{ color: '#1a3a8f' }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
