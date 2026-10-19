"use client";

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './NoticeIcon';
import {
  WHATS_NEW,
  WHATS_NEW_LATEST_ID,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_NOTICE,
} from './whatsNewData';
import { useT, translateDate } from './i18n/LanguageProvider';

// Shown once, on the first page after login, whenever the latest What's New entry hasn't been
// seen in this browser. Closing it (or opening What's New) marks the entry seen, which also
// clears the red dot. It shows a short summary; the full list lives on /whats-new.
const NOT_ON = ['/', '/whats-new', '/reset-password', '/verify-email'];

export default function UpdateNotice({ sessionKey }) {
  const { t, confirmed } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!pathname || NOT_ON.includes(pathname)) { setOpen(false); return; }
    try {
      if (!sessionStorage.getItem(sessionKey)) { setOpen(false); return; }
      const seen = Number(localStorage.getItem(WHATS_NEW_SEEN_KEY)) || 0;
      setOpen(confirmed && seen < WHATS_NEW_LATEST_ID);
    } catch { setOpen(false); }
  }, [pathname, sessionKey, confirmed]);

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
  const version = WHATS_NEW[0]?.version;
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
            <p className="text-xs" style={{ color: '#b5d4f4' }}>{version ? t("Version {version} · ", { version: version }) : ''}{translateDate(date)}</p>
            <h2 id="update-notice-title" className="text-base font-semibold text-white leading-snug">{t("What's new in the {portal}", { portal: t(WHATS_NEW_NOTICE.portal) })}</h2>
          </div>
        </div>

        <ul className="space-y-3 px-6 pt-5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-slate-800">
              <span className="mt-0.5 flex-shrink-0" style={{ color: '#1a3a8f' }}><Icon name={item.icon} size={18} /></span>
              <span><span className="font-semibold">{t(item.lead)}</span>{item.text ? ` ${t(item.text)}` : ''}</span>
            </li>
          ))}
        </ul>

        <div className="px-6 pb-4 pt-4">
          <button type="button"
            onClick={() => { markSeen(); router.push('/whats-new'); }}
            className="text-sm underline-offset-2 hover:underline" style={{ color: '#1a3a8f' }}>{t("See all updates")}</button>
        </div>

        <div className="border-t border-slate-100">
          <button ref={closeRef} type="button" onClick={markSeen}
            className="w-full py-4 text-sm font-semibold transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50"
            style={{ color: '#1a3a8f' }}>{t("Got it")}</button>
        </div>
      </div>
    </div>
  );
}
