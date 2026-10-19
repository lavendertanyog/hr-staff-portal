"use client";

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import zh from './zh';
import { PATTERNS, convertDate } from './zh-patterns';
import { authHeaders, getSessionToken } from '../authSession';

// Language of the portal: 'en' or 'zh' (Mandarin, simplified). The account's own choice is saved on
// the server (users.preferred_language) and arrives with the login, so it follows the person across
// devices. Before anyone has signed in (the login page) the choice is remembered in this browser.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
];
const LANG_KEY = 'nextan_language';
const USER_KEY = 'staff_portal_user';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const DICTIONARIES = { zh };
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// The language currently shown, kept here so date helpers outside components follow it too.
let currentLanguage = 'en';
export function getLocale() {
  return currentLanguage === 'zh' ? 'zh-CN' : 'en-SG';
}

// Dates written like "12 Oct 2026" (What's New and server text) as "2026年10月12日" in Mandarin.
export function translateDate(text) {
  return currentLanguage === 'zh' ? convertDate(text) : text;
}

// English text is the key. Anything without a translation shows as written, so a missing line never
// breaks a screen. `{name}` placeholders are filled from `params`.
// Values kept in capitals or lower case in the data (SICK, pending, IN_PROGRESS) match the entry written as
// "Sick", "Pending", "In progress".
function enumKey(dictionary, text) {
  const spaced = text.replace(/_/g, ' ').trim().toLowerCase();
  const plain = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  return Object.prototype.hasOwnProperty.call(dictionary, plain) ? plain : null;
}

export function translate(lang, text, params) {
  let out = text;
  if (typeof text === 'string') {
    const dictionary = DICTIONARIES[lang];
    if (dictionary && Object.prototype.hasOwnProperty.call(dictionary, text)) out = dictionary[text];
    else if (lang === 'zh' && dictionary && /^[A-Za-z][A-Za-z_ ]*$/.test(text) && /^[A-Z_ ]+$|^[a-z_ ]+$/.test(text) && enumKey(dictionary, text)) out = dictionary[enumKey(dictionary, text)];
    else if (lang === 'zh') {
      // sentences the server writes with names, dates and amounts filled in
      for (const [pattern, build] of PATTERNS) {
        const match = text.match(pattern);
        if (match) { out = build(match); break; }
      }
    }
  }
  if (params && typeof out === 'string') {
    out = out.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
  }
  return out;
}

function readUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

function detectLanguage() {
  try {
    const user = readUser();
    if (user?.preferred_language === 'zh' || user?.preferred_language === 'en') return user.preferred_language;
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
    if (String(navigator.language || '').toLowerCase().startsWith('zh')) return 'zh';
  } catch {}
  return 'en';
}

// True unless a signed-in account has not yet seen the language welcome card.
function readConfirmed() {
  const user = readUser();
  return !user || user.language_confirmed !== false;
}

const LanguageContext = createContext({
  lang: 'en',
  t: (text, params) => translate('en', text, params),
  setLanguage: async () => {},
  syncFromAccount: () => {},
  confirmed: true,
});

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en'); // the first render matches the server; the saved choice applies before paint
  const [confirmed, setConfirmed] = useState(true);
  currentLanguage = lang;

  useIsoLayoutEffect(() => {
    setLang(detectLanguage());
    setConfirmed(readConfirmed());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  // Called after a login, so the portal switches to the account's own language.
  const syncFromAccount = useCallback(() => {
    setLang(detectLanguage());
    setConfirmed(readConfirmed());
  }, []);

  const setLanguage = useCallback(async (next) => {
    if (next !== 'en' && next !== 'zh') return;
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch {}
    const user = readUser();
    if (user) {
      try { sessionStorage.setItem(USER_KEY, JSON.stringify({ ...user, preferred_language: next, language_confirmed: true })); } catch {}
      setConfirmed(true);
    }
    if (user && getSessionToken()) {
      try {
        await fetch(`${API_BASE}/api/v1/auth/language`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ language: next, confirmed: true }),
        });
      } catch { /* the choice still applies on this device; it saves to the account on the next change */ }
    }
  }, []);

  const value = useMemo(() => ({
    lang,
    t: (text, params) => translate(lang, text, params),
    setLanguage,
    syncFromAccount,
    confirmed,
  }), [lang, setLanguage, syncFromAccount, confirmed]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
