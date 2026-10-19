"use client";

import React from 'react';
import { LANGUAGES, useT } from './LanguageProvider';

// "English | 中文" as plain text: the chosen language is underlined, the other is dimmed. Real buttons
// have a visible background in some places, so these are text with a role of button instead.
// `variant="dark"` is for the blue panel on the login page (white text).
export default function LanguageSwitch({ variant = 'light', size = 14, className = '', onChange }) {
  const { lang, setLanguage, t } = useT();
  const on = variant === 'dark' ? '#ffffff' : '#0f172a';
  const off = variant === 'dark' ? 'rgba(255,255,255,0.65)' : '#64748b';
  const sep = variant === 'dark' ? 'rgba(255,255,255,0.4)' : '#cbd5e1';
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} style={{ fontSize: size }} role="group" aria-label={t('Language')}>
      {LANGUAGES.map((item, index) => {
        const active = lang === item.code;
        return (
          <React.Fragment key={item.code}>
            {index > 0 && <span aria-hidden="true" style={{ color: sep }}>|</span>}
            <span
              role="button" tabIndex={0} lang={item.code} aria-pressed={active}
              onClick={() => { setLanguage(item.code); if (onChange) onChange(item.code); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLanguage(item.code); if (onChange) onChange(item.code); } }}
              style={{
                cursor: 'pointer', paddingBottom: 2, color: active ? on : off, fontWeight: active ? 600 : 400,
                borderBottom: `2px solid ${active ? (variant === 'dark' ? '#ffffff' : '#1a3a8f') : 'transparent'}`,
              }}>
              {item.label}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
}
