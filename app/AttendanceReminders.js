"use client";

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Short beep via Web Audio API — no audio asset needed.
function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

function showBrowserNotification(title, body) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {}
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const CONTINUE_PROMPT_HOURS = 4;
const LUNCH_START_HOUR = 12;
const LUNCH_END_HOUR = 14;
const HARD_CUTOFF_HOUR = 17.5; // 5:30pm — no "still working?" reminder ever shows after this, wall-clock SGT.

function sgtNow() {
  // Singapore has no DST, so a fixed +8h offset from UTC is always correct. IMPORTANT: the
  // returned Date's *UTC* getters (getUTCHours, getUTCDate, etc.) hold the SGT wall-clock
  // value — never call the local-timezone getters (getHours, getDate, ...) on it, since those
  // re-apply whatever timezone the device itself is set to (e.g. a Singapore-based staff
  // member's own laptop is already UTC+8, which would double-shift the result by 16 hours).
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}
function todaySGTString() {
  return sgtNow().toISOString().slice(0, 10);
}
// Lunch (12pm-2pm) pauses the reminder, and it never shows again after 5:30pm that day.
function isSuppressedWindow(sgt) {
  const hourDecimal = sgt.getUTCHours() + sgt.getUTCMinutes() / 60;
  if (hourDecimal >= LUNCH_START_HOUR && hourDecimal < LUNCH_END_HOUR) return true;
  if (hourDecimal >= HARD_CUTOFF_HOUR) return true;
  return false;
}

export default function AttendanceReminders() {
  const [clockInReminder, setClockInReminder] = useState(false);
  const [stillWorkingSession, setStillWorkingSession] = useState(null); // { attendanceId, userId, slot }
  const [confirming, setConfirming] = useState(false);
  const notifiedSlotRef = useRef(new Map()); // attendanceId -> last slot already beeped/notified for

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      let user;
      try { user = JSON.parse(sessionStorage.getItem('staff_portal_user') || 'null'); } catch { user = null; }
      if (!user?.user_id) return;

      try {
        const res = await axios.get(`${API_BASE}/api/v1/attendance/active-session/${user.user_id}`);
        const session = res.data?.data;

        if (!session) {
          setStillWorkingSession(null);
          // 8:30am clock-in reminder — only if not already dismissed today and no hours logged yet today.
          const today = todaySGTString();
          const dismissKey = `staff_clockin_reminder_dismissed_${today}`;
          const alreadyDismissed = sessionStorage.getItem(dismissKey) === '1';
          const sgt = sgtNow();
          const pastReminderTime = sgt.getUTCHours() > 8 || (sgt.getUTCHours() === 8 && sgt.getUTCMinutes() >= 30);
          if (pastReminderTime && !alreadyDismissed) {
            try {
              const logRes = await axios.get(`${API_BASE}/api/v1/attendance/project-log/${user.user_id}?start=${today}&end=${today}`);
              const hasLoggedToday = (logRes.data?.data || []).length > 0;
              setClockInReminder(!hasLoggedToday);
            } catch { setClockInReminder(true); }
          } else {
            setClockInReminder(false);
          }
          return;
        }

        setClockInReminder(false);
        // Only one check-in is needed per clocked-in session/day — the 4-hour countdown is
        // always measured from clock-in, and once the user has genuinely pressed Continue at
        // any point during this session, no further "still working?" prompts show for the rest
        // of it (confirmed = last_activity_confirmed_at was bumped meaningfully past clock-in;
        // it's only ever equal to clock-in when nobody has confirmed yet this session).
        const clockInMs = new Date(session.clock_in_time).getTime();
        const confirmedMs = new Date(session.last_activity_confirmed_at || session.clock_in_time).getTime();
        const hasConfirmedThisSession = confirmedMs - clockInMs > 1000;
        const hoursSinceClockIn = (Date.now() - clockInMs) / 3600000;

        if (hoursSinceClockIn >= CONTINUE_PROMPT_HOURS && !hasConfirmedThisSession) {
          // One "slot" per elapsed hour past the 4-hour mark (4, 5, 6, ...). Dismissing only
          // silences the current slot — it reappears once the next hour's slot begins, unless
          // that slot falls in the lunch pause or past the hard evening cutoff.
          const slot = Math.floor(hoursSinceClockIn);
          const dismissKey = `staff_stillworking_dismissed_slot_${session.attendance_id}`;
          const dismissedSlot = parseInt(sessionStorage.getItem(dismissKey) || '-1', 10);
          if (!isSuppressedWindow(sgtNow()) && slot > dismissedSlot) {
            setStillWorkingSession({ attendanceId: session.attendance_id, userId: user.user_id, slot });
            // Beep + native notification exactly once per new slot, not on every 60s poll —
            // otherwise it'd re-fire every minute for as long as the modal stays on screen.
            const lastNotifiedSlot = notifiedSlotRef.current.get(session.attendance_id) ?? -1;
            if (slot > lastNotifiedSlot) {
              notifiedSlotRef.current.set(session.attendance_id, slot);
              playBeep();
              showBrowserNotification('Still working?', "You've been clocked in for over 4 hours. Press Continue to resume working.");
            }
          } else {
            setStillWorkingSession(null);
          }
        } else {
          setStillWorkingSession(null);
        }
      } catch { /* offline/transient — try again next poll */ }
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  const dismissClockInReminder = () => {
    sessionStorage.setItem(`staff_clockin_reminder_dismissed_${todaySGTString()}`, '1');
    setClockInReminder(false);
  };

  const dismissStillWorking = () => {
    if (!stillWorkingSession) return;
    sessionStorage.setItem(`staff_stillworking_dismissed_slot_${stillWorkingSession.attendanceId}`, String(stillWorkingSession.slot));
    setStillWorkingSession(null);
  };

  const confirmStillWorking = async () => {
    if (!stillWorkingSession) return;
    setConfirming(true);
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/${stillWorkingSession.attendanceId}/confirm-continue`, { userId: stillWorkingSession.userId });
      sessionStorage.removeItem(`staff_stillworking_dismissed_slot_${stillWorkingSession.attendanceId}`);
      setStillWorkingSession(null);
    } catch { /* leave the prompt up, will retry next poll too */ }
    finally { setConfirming(false); }
  };

  return (
    <>
      {clockInReminder && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-6 py-2.5">
          <p className="text-sm font-semibold text-amber-800">
            It's past 8:30am and you haven't clocked in yet today.{' '}
            <a href="/attendance" className="underline">Clock in now</a>
          </p>
          <button type="button" onClick={dismissClockInReminder}
            className="flex-shrink-0 text-amber-600 hover:text-amber-800" aria-label="Dismiss">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {stillWorkingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center">
            <button type="button" onClick={dismissStillWorking} aria-label="Dismiss"
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Still working?</h2>
            <p className="text-sm text-slate-500 mb-6">
              You've been clocked in for over {CONTINUE_PROMPT_HOURS} hours.<br />Press Continue to resume working.
            </p>
            <button type="button" onClick={confirmStillWorking} disabled={confirming}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
              style={{ background: '#0c3b8f' }}>
              {confirming ? 'Please wait…' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
