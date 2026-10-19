"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { authHeaders } from './authSession';
import { TOUR_PORTAL, TOUR_SESSION_KEY, TOUR_STEPS } from './tourSteps';

// First-login walkthrough. This file is identical in all four portals — change every copy
// together; each portal's steps live in its own tourSteps.js.
//
// It opens once per account per portal: login returns `tours_completed` (the portals whose tour
// the person has finished or skipped), and finishing or skipping adds this portal to it via
// POST /auth/tours/complete. "Take the tour again" on the Profile page reopens it by firing
// START_TOUR_EVENT. Each step points at one element (a sidebar tab, the search box…) by CSS
// selector; when that element isn't on screen (the phone layout hides the sidebar) the step
// shows as a centred card instead.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
export const START_TOUR_EVENT = 'nextan:start-tour';

const CARD_W = 340;
const GAP = 16;
const EDGE = 16;
const PAD = 6;

function readUser() {
  try { return JSON.parse(sessionStorage.getItem(TOUR_SESSION_KEY) || 'null'); } catch { return null; }
}

function findTarget(selector) {
  if (!selector) return null;
  const el = Array.from(document.querySelectorAll(selector))
    .find((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return el || null;
}

// Beside the target when there's room (the sidebar tabs), else below it (the top bar), else centred.
function placeCard(rect, cardH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (top) => Math.max(EDGE, Math.min(top, vh - cardH - EDGE));
  const clampLeft = (left) => Math.max(EDGE, Math.min(left, vw - CARD_W - EDGE));
  if (!rect) return null;
  if (rect.right + GAP + CARD_W + EDGE <= vw) {
    return { left: rect.right + GAP, top: clampTop(rect.top + rect.height / 2 - cardH / 2) };
  }
  if (rect.bottom + GAP + cardH + EDGE <= vh) {
    return { left: clampLeft(rect.left + rect.width / 2 - CARD_W / 2), top: rect.bottom + GAP };
  }
  return null;
}

export default function WalkthroughTour() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const nextRef = useRef(null);

  // Auto-start for anyone who hasn't seen this portal's tour. An older login without
  // `tours_completed` (or a backend that doesn't send it yet) never auto-starts.
  useEffect(() => {
    if (open) return;
    const user = readUser();
    if (!user || !Array.isArray(user.tours_completed)) return;
    if (user.tours_completed.includes(TOUR_PORTAL)) return;
    setIndex(0);
    setOpen(true);
  }, [pathname, open]);

  useEffect(() => {
    const start = () => { setIndex(0); setOpen(true); };
    window.addEventListener(START_TOUR_EVENT, start);
    return () => window.removeEventListener(START_TOUR_EVENT, start);
  }, []);

  const step = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  // Saved straight into the session copy of the user so the tour never reopens on the next page,
  // even if the request fails (it then shows again at the next login).
  const close = useCallback(() => {
    setOpen(false);
    const user = readUser();
    if (!user) return;
    const done = Array.isArray(user.tours_completed) ? user.tours_completed : [];
    if (done.includes(TOUR_PORTAL)) return;
    try {
      sessionStorage.setItem(TOUR_SESSION_KEY, JSON.stringify({ ...user, tours_completed: [...done, TOUR_PORTAL] }));
    } catch {}
    fetch(`${API_BASE}/api/v1/auth/tours/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ portal: TOUR_PORTAL }),
    }).catch(() => {});
  }, []);

  const next = useCallback(() => { if (isLast) close(); else setIndex((i) => i + 1); }, [isLast, close]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Find and measure this step's element. The sidebar renders a moment after the page and its
  // tab list can scroll, so measure again shortly after and whenever the window changes size.
  useEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const el = findTarget(step?.target);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    findTarget(step?.target)?.scrollIntoView({ block: 'nearest' });
    measure();
    const t = setTimeout(measure, 250);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [open, step, pathname]);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    setPos(placeCard(rect, cardRef.current.offsetHeight));
  }, [open, rect, index]);

  useEffect(() => {
    if (!open) return undefined;
    nextRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, index, close, next, back]);

  if (!open || !step) return null;

  const spotlight = rect && pos;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Blocks clicks on the page while the tour is open; Skip tour is the way out. */}
      <div className={`absolute inset-0 ${spotlight ? '' : 'bg-slate-950/40'}`} />

      {spotlight && (
        <div className="pointer-events-none absolute transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 18,
            boxShadow: '0 0 0 3px #ffffff, 0 0 0 9999px rgba(2, 6, 23, 0.45)',
          }} />
      )}

      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="absolute rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
        style={spotlight
          ? { left: pos.left, top: pos.top, width: CARD_W, maxWidth: `calc(100vw - ${EDGE * 2}px)` }
          : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: CARD_W, maxWidth: `calc(100vw - ${EDGE * 2}px)` }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            {index === 0 ? 'Welcome' : `${index} of ${TOUR_STEPS.length - 1}`}
          </p>
          <button type="button" onClick={close} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
            Skip tour
          </button>
        </div>

        <h2 id="tour-title" className="mt-3 text-lg font-semibold text-slate-950">{step.title}</h2>
        <p id="tour-body" className="mt-2 text-sm leading-relaxed text-slate-500">{step.body}</p>

        {/* Dots get their own line: HR has 13 steps, which leaves no room beside the buttons. */}
        <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className="h-1.5 rounded-full transition-all"
              style={{ width: i === index ? 16 : 6, background: i === index ? '#1540A8' : '#cbd5e1' }} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-end">
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={back}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Back
              </button>
            )}
            <button ref={nextRef} type="button" onClick={next}
              className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F]">
              {index === 0 ? 'Show me around' : isLast ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
