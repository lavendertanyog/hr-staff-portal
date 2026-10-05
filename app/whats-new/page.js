"use client";

import React, { useEffect, useState } from 'react';
import { WHATS_NEW, WHATS_NEW_LATEST_ID, WHATS_NEW_SEEN_KEY } from '../whatsNewData';

export default function WhatsNewPage() {
  useEffect(() => {
    try { localStorage.setItem(WHATS_NEW_SEEN_KEY, String(WHATS_NEW_LATEST_ID)); } catch {}
  }, []);

  const [active, setActive] = useState(null);
  const [latest, ...older] = WHATS_NEW;

  return (
    <div className="p-8">
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">What's new</h1>
        <p className="mt-2 text-sm text-slate-500">Recent updates to the staff portal.</p>
      </div>

      <div className="max-w-4xl">
        {latest && (
          <button type="button" onClick={() => setActive(latest)}
            className="w-full text-left rounded-3xl p-6 hover:brightness-[0.98] transition" style={{ background: '#EEF4FF' }}>
            <span className="inline-block rounded-full px-3 py-1 text-[11px] font-semibold text-white" style={{ background: '#1a3a8f' }}>
              Latest
            </span>
            <p className="mt-3 text-xl font-semibold text-slate-900">{latest.title}</p>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{latest.body}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{latest.date}</p>
          </button>
        )}

        {older.length > 0 && (
          <div className="mt-2 border-t border-slate-100">
            {older.map((item) => (
              <button type="button" key={item.id} onClick={() => setActive(item)}
                className="w-full flex items-center justify-between gap-4 py-3 border-b border-slate-100 text-left hover:bg-slate-50 transition rounded-lg px-2 -mx-2">
                <span className="text-sm text-slate-700">{item.title}</span>
                <span className="flex-shrink-0 text-xs text-slate-400">{item.date}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setActive(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{active.date}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{active.title}</h2>
              </div>
              <button type="button" onClick={() => setActive(null)} aria-label="Close"
                className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {Array.isArray(active.points) && active.points.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {active.points.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#1a3a8f' }} />
                    {point}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-600 leading-relaxed">{active.body}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
