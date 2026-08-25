"use client";

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const CONTINUE_PROMPT_HOURS = 4;
const AUTO_CLOCKOUT_HOURS = 6;

function sgtNow() {
  // Singapore has no DST, so a fixed +8h offset from UTC is always correct.
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}
function todaySGTString() {
  return sgtNow().toISOString().slice(0, 10);
}

export default function AttendanceReminders() {
  const [clockInReminder, setClockInReminder] = useState(false);
  const [stillWorkingSession, setStillWorkingSession] = useState(null); // { attendanceId }
  const [autoClockedOutNotice, setAutoClockedOutNotice] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dismissedTodayRef = useRef(null);

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
          const alreadyDismissed = dismissedTodayRef.current === today || sessionStorage.getItem(dismissKey) === '1';
          const sgt = sgtNow();
          const pastReminderTime = sgt.getHours() > 8 || (sgt.getHours() === 8 && sgt.getMinutes() >= 30);
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
        const anchor = new Date(session.last_activity_confirmed_at || session.clock_in_time);
        const hoursSince = (Date.now() - anchor.getTime()) / 3600000;

        if (hoursSince >= AUTO_CLOCKOUT_HOURS) {
          try {
            await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, { userId: user.user_id, attendanceId: session.attendance_id });
            setStillWorkingSession(null);
            setAutoClockedOutNotice(true);
            sessionStorage.removeItem('staff_attendance_id');
            sessionStorage.removeItem('staff_attendance_project');
            sessionStorage.removeItem('staff_attendance_user_id');
          } catch { /* retry on next poll */ }
        } else if (hoursSince >= CONTINUE_PROMPT_HOURS) {
          setStillWorkingSession({ attendanceId: session.attendance_id, userId: user.user_id });
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
    const today = todaySGTString();
    dismissedTodayRef.current = today;
    sessionStorage.setItem(`staff_clockin_reminder_dismissed_${today}`, '1');
    setClockInReminder(false);
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
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center">
            <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Still working?</h2>
            <p className="text-sm text-slate-500 mb-6">
              You've been clocked in for over {CONTINUE_PROMPT_HOURS} hours. Press Continue to stay clocked in —
              otherwise you'll be automatically clocked out after {AUTO_CLOCKOUT_HOURS} hours total.
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
            You were automatically clocked out after {AUTO_CLOCKOUT_HOURS} hours of inactivity.
            <button type="button" onClick={() => setAutoClockedOutNotice(false)} className="text-slate-300 hover:text-white" aria-label="Dismiss">×</button>
          </div>
        </div>
      )}
    </>
  );
}
