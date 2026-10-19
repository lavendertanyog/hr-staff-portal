// A clock-out only counts once the server has it. This keeps the press of the Clock Out button
// in this browser (with the exact time it was pressed) until the server confirms, so closing the
// laptop mid-request doesn't lose it: the next time any Staff portal page opens, or the connection
// comes back, AttendanceReminders sends it again with the original time.

import { getLocale } from './i18n/LanguageProvider';

const KEY = 'staff_pending_clockout';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function savePendingClockOut(pending) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...pending, savedAt: Date.now() })); } catch {}
}

export function readPendingClockOut() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.userId || !p?.attendanceId || !p?.clockOutTime || Date.now() - (p.savedAt || 0) > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return p;
  } catch { return null; }
}

export function clearPendingClockOut() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function formatClockOutTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });
  } catch { return ''; }
}

// Sends the General description (if there is one), then the clock-out with the pressed-at time.
// `keepalive` lets the request finish even if the tab closes right after.
// Returns { ok: true }, { ok: false, retry: true } (no connection or a server error: try later),
// or { ok: false, retry: false, error } (the server refused it: nothing more to retry).
export async function sendPendingClockOut(apiBase, pending) {
  try {
    if (pending.allocationId && String(pending.description || '').trim()) {
      const saved = await fetch(`${apiBase}/api/v1/attendance/allocations/${pending.allocationId}`, {
        method: 'PATCH', headers: JSON_HEADERS, keepalive: true,
        body: JSON.stringify({ userId: pending.userId, description: pending.description }),
      });
      if (saved.status >= 500) return { ok: false, retry: true };
    }
    const res = await fetch(`${apiBase}/api/v1/attendance/clock-out`, {
      method: 'POST', headers: JSON_HEADERS, keepalive: true,
      body: JSON.stringify({ userId: pending.userId, attendanceId: pending.attendanceId, clockOutTime: pending.clockOutTime }),
    });
    if (res.ok) return { ok: true };
    const payload = await res.json().catch(() => ({}));
    if (res.status >= 500) return { ok: false, retry: true, error: payload.error };
    return { ok: false, retry: false, error: payload.error };
  } catch {
    return { ok: false, retry: true };
  }
}

// Called when a page opens or the connection returns. Skips the send when that session is no
// longer the open one (already clocked out, or the entry was edited), so it never overwrites.
// Returns { status: 'none' | 'sent' | 'already-done' | 'waiting' | 'failed', clockOutTime?, error? }.
export async function retryPendingClockOut(apiBase, userId) {
  const pending = readPendingClockOut();
  if (!pending || pending.userId !== userId) return { status: 'none' };
  try {
    const res = await fetch(`${apiBase}/api/v1/attendance/active-session/${userId}`);
    if (!res.ok) return { status: 'waiting' };
    const active = (await res.json())?.data;
    if (!active || String(active.attendance_id) !== String(pending.attendanceId)) {
      clearPendingClockOut();
      return { status: 'already-done' };
    }
  } catch { return { status: 'waiting' }; }

  const result = await sendPendingClockOut(apiBase, pending);
  if (result.ok) { clearPendingClockOut(); return { status: 'sent', clockOutTime: pending.clockOutTime }; }
  if (result.retry) return { status: 'waiting' };
  clearPendingClockOut();
  return { status: 'failed', error: result.error };
}
