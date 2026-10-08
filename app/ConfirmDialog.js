"use client";

// App-style confirmation window, used instead of the browser's window.confirm pop-up.
// This file is identical in the Staff and Manager portals — change every copy together.
//
//   const [confirm, confirmDialog] = useConfirm();
//   if (!(await confirm({ title: 'Delete leave request', message: '…', confirmLabel: 'Delete', danger: true }))) return;
//   …and render {confirmDialog} once in the page.

import React, { useCallback, useEffect, useRef, useState } from 'react';

export function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setOptions(opts);
  }), []);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [options, close]);

  const dialog = options ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <div role="alertdialog" aria-modal="true" aria-label={options.title || 'Confirm'}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{options.title || 'Please confirm'}</p>
          <button type="button" onClick={() => close(false)} aria-label="Close"
            className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-700">{options.message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => close(false)}
            className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="button" autoFocus onClick={() => close(true)}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white ${options.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1540A8] hover:bg-[#12378F]'}`}>
            {options.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, dialog];
}
