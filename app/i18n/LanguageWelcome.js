"use client";

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { LANGUAGES, translate, useT } from './LanguageProvider';

// Shown once, the first time someone enters the portal after their account is created: confirm the
// language they want. It starts on whatever they picked at sign-up. Choosing "Continue" saves it to
// the account (it can be changed later from the top bar or Profile).
export default function LanguageWelcome() {
  const { lang, confirmed, setLanguage } = useT();
  const pathname = usePathname();
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);
  const choice = picked || lang;

  if (confirmed || !pathname || pathname === '/') return null;
  const tr = (text) => translate(choice, text);

  const submit = async () => {
    setSaving(true);
    await setLanguage(choice);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="language-welcome-title"
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: '#E6F1FB', color: '#1a3a8f' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <h2 id="language-welcome-title" className="mt-3 text-lg font-semibold text-slate-900">{tr('Choose your language')}</h2>

        <div className="mt-4 flex gap-3">
          {LANGUAGES.map((item) => {
            const active = choice === item.code;
            return (
              <button key={item.code} type="button" onClick={() => setPicked(item.code)} lang={item.code} aria-pressed={active}
                className="flex-1 rounded-2xl px-3 py-4 text-sm font-medium transition"
                style={{
                  border: active ? '1.5px solid #1a3a8f' : '1px solid #cbd5e1',
                  background: active ? '#E6F1FB' : '#ffffff',
                  color: active ? '#0C447C' : '#0f172a',
                }}>
                {item.code === 'zh' ? '中文 (简体)' : 'English'}
                {active && <span className="mt-1 block text-xs">✓</span>}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-slate-500">{tr('You can change this anytime in Settings.')}</p>
        <button type="button" onClick={submit} disabled={saving}
          className="mt-4 w-full rounded-2xl py-3.5 text-sm font-bold text-white transition disabled:opacity-60"
          style={{ background: '#0c3b8f' }}>
          {tr('Continue')}
        </button>
      </div>
    </div>
  );
}
