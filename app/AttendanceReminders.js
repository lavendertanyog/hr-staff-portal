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
// Warning checkpoints leading up to the hard auto-clockout deadline, both measured from the
// last confirmation (or clock-in, if never confirmed) — so this whole cycle re-arms every time
// Continue is pressed and keeps repeating for as long as someone stays clocked in, rather than
// firing once per day. Each checkpoint beeps/notifies once per cycle.
const WARNING_CHECKPOINTS_HOURS = [3.5, 3.75];
const AUTO_CLOCKOUT_HOURS = 4;
const LUNCH_START_HOUR = 12;
const LUNCH_END_HOUR = 14;

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
// Weekdays only for now — no public holiday calendar wired up yet, so a holiday that falls on
// a weekday will still show reminders until that's scoped separately.
function isWeekday(sgt) {
  const day = sgt.getUTCDay(); // sgt's UTC getters hold the SGT wall-clock value (see sgtNow)
  return day !== 0 && day !== 6;
}
// Weekends pause the whole sequence — no prompts, no auto clock-out. No evening cutoff — with
// the midnight backstop removed, this cycle is the only thing preventing an overnight session,
// so it has to keep running for as long as someone is actually clocked in, into the evening.
function isSuppressedWindow(sgt) {
  return !isWeekday(sgt);
}
// Lunch (12pm-2pm) only pauses the hard auto clock-out — people are reasonably away from their
// desk then. The "still working?" prompt keeps appearing and the countdown keeps running as
// normal through lunch, so a 9am clock-in still gets its first checkpoint around 12:30pm; it's
// only the forced clock-out at the 4-hour mark that's held off until lunch ends.
function isLunchWindow(sgt) {
  const hourDecimal = sgt.getUTCHours() + sgt.getUTCMinutes() / 60;
  return hourDecimal >= LUNCH_START_HOUR && hourDecimal < LUNCH_END_HOUR;
}

export default function AttendanceReminders() {
  const [clockInReminder, setClockInReminder] = useState(false);
  const [stillWorkingSession, setStillWorkingSession] = useState(null); // { attendanceId, userId }
  const [autoClockedOutNotice, setAutoClockedOutNotice] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const notifiedCheckpointsRef = useRef(new Map()); // attendanceId -> Set of checkpoint hours already beeped for
  const autoClockingOutRef = useRef(new Set()); // attendanceId currently being auto-clocked-out (guards against double-fire)

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
          // 8:30am clock-in reminder — repeats hourly (8:30, 9:30, 10:30, 11:30) until noon, when
          // it stops entirely rather than continuing to nag past the point a normal shift would
          // reasonably start. Dismissing only silences the current hourly slot, same pattern as
          // the "still working?" checkpoints.
          const today = todaySGTString();
          const sgt = sgtNow();
          const hourDecimal = sgt.getUTCHours() + sgt.getUTCMinutes() / 60;
          const pastReminderTime = hourDecimal >= 8.5;
          const beforeNoon = hourDecimal < 12;
          if (pastReminderTime && beforeNoon && isWeekday(sgt)) {
            const slot = Math.floor(hourDecimal - 8.5); // 0 = 8:30-9:29, 1 = 9:30-10:29, 2 = 10:30-11:29, 3 = 11:30-11:59
            const dismissKey = `staff_clockin_dismissed_slot_${today}`;
            const dismissedSlot = parseInt(sessionStorage.getItem(dismissKey) || '-1', 10);
            if (slot > dismissedSlot) {
              try {
                const logRes = await axios.get(`${API_BASE}/api/v1/attendance/project-log/${user.user_id}?start=${today}&end=${today}`);
                const hasLoggedToday = (logRes.data?.data || []).length > 0;
                setClockInReminder(!hasLoggedToday);
              } catch { setClockInReminder(true); }
            } else {
              setClockInReminder(false);
            }
          } else {
            setClockInReminder(false);
          }
          return;
        }

        setClockInReminder(false);
        // The 3.5h/3.75h/4h cycle is anchored to last_activity_confirmed_at, which resets every
        // time Continue is pressed — so it keeps repeating for as long as someone stays clocked
        // in (covers overtime), rather than firing once and going quiet for the rest of the day.
        const confirmedMs = new Date(session.last_activity_confirmed_at || session.clock_in_time).getTime();
        const hoursSinceConfirm = (Date.now() - confirmedMs) / 3600000;

        if (isSuppressedWindow(sgtNow())) {
          setStillWorkingSession(null);
          return;
        }

        const duringLunch = isLunchWindow(sgtNow());

        if (hoursSinceConfirm >= AUTO_CLOCKOUT_HOURS && !duringLunch) {
          // Hard deadline missed, and it's not lunch — auto clock-out, once.
          if (!autoClockingOutRef.current.has(session.attendance_id)) {
            autoClockingOutRef.current.add(session.attendance_id);
            try {
              await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, { userId: user.user_id, attendanceId: session.attendance_id });
              setStillWorkingSession(null);
              setAutoClockedOutNotice(true);
              sessionStorage.removeItem('staff_attendance_id');
              sessionStorage.removeItem('staff_attendance_project');
              sessionStorage.removeItem('staff_attendance_user_id');
            } catch {
              autoClockingOutRef.current.delete(session.attendance_id); // retry on next poll
            }
          }
          return;
        }

        // During lunch, the 4-hour mark (and beyond) is treated as just another checkpoint —
        // the prompt keeps nagging, but the forced clock-out waits until lunch ends and the
        // block above fires on the next poll.
        const checkpoints = duringLunch ? [...WARNING_CHECKPOINTS_HOURS, AUTO_CLOCKOUT_HOURS] : WARNING_CHECKPOINTS_HOURS;
        const dueCheckpoint = [...checkpoints].reverse().find((h) => hoursSinceConfirm >= h);
        if (dueCheckpoint != null) {
          setStillWorkingSession({ attendanceId: session.attendance_id, userId: user.user_id });
          // Keyed by (attendanceId, confirmedMs) rather than just attendanceId, so each new
          // confirm cycle gets its own fresh set of checkpoints to notify for.
          const cycleKey = `${session.attendance_id}:${confirmedMs}`;
          const notified = notifiedCheckpointsRef.current.get(cycleKey) || new Set();
          if (!notified.has(dueCheckpoint)) {
            notified.add(dueCheckpoint);
            notifiedCheckpointsRef.current.set(cycleKey, notified);
            playBeep();
            showBrowserNotification('Still working?', "It's been 3.5 hours since your last check-in. Press Continue to keep working — you'll be automatically clocked out at 4 hours.");
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
    const sgt = sgtNow();
    const hourDecimal = sgt.getUTCHours() + sgt.getUTCMinutes() / 60;
    const slot = Math.floor(hourDecimal - 8.5);
    sessionStorage.setItem(`staff_clockin_dismissed_slot_${todaySGTString()}`, String(slot));
    setClockInReminder(false);
  };

  const dismissStillWorking = () => {
    setStillWorkingSession(null); // reappears on the next 60s poll if still due — just hides it for now
  };

  const confirmStillWorking = async () => {
    if (!stillWorkingSession) return;
    setConfirming(true);
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/${stillWorkingSession.attendanceId}/confirm-continue`, { userId: stillWorkingSession.userId });
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
              It's been 3.5 hours since your last check-in.<br />Press Continue to keep working — you'll be
              automatically clocked out at 4 hours if you don't. This checks in again every few hours if you're
              still working.
            </p>
            <button type="button" onClick={confirmStillWorking} disabled={confirming}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
              style={{ background: '#0c3b8f' }}>
              {confirming ? 'Please wait…' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {autoClockedOutNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
          <div className="rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border bg-slate-900 border-slate-950 text-white flex items-center gap-3">
            You were automatically clocked out after 4 hours of inactivity.
            <button type="button" onClick={() => setAutoClockedOutNotice(false)} className="text-slate-300 hover:text-white" aria-label="Dismiss">×</button>
          </div>
        </div>
      )}
    </>
  );
}
