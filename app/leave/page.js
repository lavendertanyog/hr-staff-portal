"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { formatLeaveDate, openMcFile } from '../leaveFormat';
import { useConfirm } from '../ConfirmDialog';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const CATEGORIES = ['ANNUAL', 'EMERGENCY', 'SICK'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MC_ACCEPT = '.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf';
const MC_MAX_BYTES = 5 * 1024 * 1024; // 5MB

function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Inclusive day count between two YYYY-MM-DD strings, plus the same span with Sat/Sun excluded —
// shown as a quiet total right under the date fields so staff see the balance impact before submitting.
function countLeaveDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (end < start) return null;
  let total = 0;
  let working = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    total += 1;
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) working += 1;
  }
  return { total, working };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatusPill({ status }) {
  const s = String(status || '').toUpperCase();
  const map = { APPROVED: 'bg-green-50 text-green-700', REJECTED: 'bg-red-50 text-red-600', PENDING: 'bg-yellow-50 text-yellow-700' };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>;
}

const START_COLOR = '#0c3b8f';
const END_COLOR = '#7c3aed';

// Small "i" icon that reveals extra hint text on hover — keeps helper copy out of the form's
// main flow so fields don't read as crowded.
function InfoTip({ text }) {
  return (
    <span className="relative inline-flex group align-middle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cursor-help flex-shrink-0">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="16" x2="12" y2="11" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="pointer-events-none absolute left-1/2 bottom-full -translate-x-1/2 mb-2 w-56 rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal leading-snug text-white opacity-0 shadow-lg transition group-hover:opacity-100 z-20">
        {text}
      </span>
    </span>
  );
}

function MiniCalendar({ startDate, endDate, onDateClick, onClear }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Start and end each get their own color so it's obvious at a glance which date a click will
  // set next — matched to the Start/End Date input fields in the form beside this calendar. The
  // light-blue span now fills the whole cell (not just a dot) across every day from start to
  // end inclusive, so the selected range reads as one continuous bar rather than dotted circles.
  const getCell = (year, month, day, col) => {
    if (!day) return null;
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isStart = ymd === startDate;
    const isEnd = ymd === endDate;
    const todayYmd = toYMD(today);
    const hasRange = Boolean(startDate && endDate);
    const inSpan = hasRange && ymd >= startDate && ymd <= endDate;
    const isToday = ymd === todayYmd;

    // Round an edge only when there's no highlighted neighbor on that side within the same row —
    // otherwise a lone start/end cell at a week boundary (e.g. end date falling on a Sunday)
    // exposes square corners past the circle instead of a clean pill. A plain date-arithmetic
    // neighbor (not a same-row check) would wrongly stay square across week wraps.
    const prevDate = new Date(year, month, day - 1);
    const nextDate = new Date(year, month, day + 1);
    const prevInSpan = hasRange && toYMD(prevDate) >= startDate && toYMD(prevDate) <= endDate;
    const nextInSpan = hasRange && toYMD(nextDate) >= startDate && toYMD(nextDate) <= endDate;
    const roundLeft = inSpan && (col === 0 || !prevInSpan);
    const roundRight = inSpan && (col === 6 || !nextInSpan);

    let wrapperClass = 'flex items-center justify-center';
    if (inSpan) {
      wrapperClass += ' bg-[#dbeafe]';
      if (roundLeft) wrapperClass += ' rounded-l-full';
      if (roundRight) wrapperClass += ' rounded-r-full';
    }

    let circleClass = 'w-8 h-8 text-xs flex items-center justify-center transition cursor-pointer rounded-full';
    let circleStyle;
    if (isStart && isEnd) { circleClass += ' text-white font-bold'; circleStyle = { background: `linear-gradient(135deg, ${START_COLOR} 50%, ${END_COLOR} 50%)` }; }
    else if (isStart) { circleClass += ' text-white font-bold'; circleStyle = { background: START_COLOR }; }
    else if (isEnd) { circleClass += ' text-white font-bold'; circleStyle = { background: END_COLOR }; }
    else if (inSpan) { circleClass += ' text-[#1a3a8f] font-medium'; }
    else if (isToday) { circleClass += ' border border-[#0c3b8f] text-[#0c3b8f] font-semibold'; }
    else { circleClass += ' hover:bg-slate-100 text-slate-700'; }

    return { wrapperClass, circleClass, circleStyle };
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p className="text-sm font-bold text-slate-900">{MONTHS[viewMonth]} {viewYear}</p>
        <button type="button" onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells — gap-y-1 keeps each week's highlight band a clean, separate pill instead of
          two adjacent weeks' ranges fusing into one tall block when a selection spans weeks. */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          const cell = getCell(viewYear, viewMonth, day, i % 7);
          return (
            <div key={i} className={cell ? cell.wrapperClass : 'flex items-center justify-center'}>
              {day ? (
                <button type="button"
                  onClick={() => onDateClick(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}
                  style={cell.circleStyle}
                  className={cell.circleClass}>
                  {day}
                </button>
              ) : <span className="w-8 h-8" />}
            </div>
          );
        })}
      </div>

      {/* Legend — color swatches match the Start/End Date input fields in the form. */}
      <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 space-y-1.5">
        {startDate && (
          <p className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: START_COLOR }} />
            <span className="font-semibold text-slate-600">Start:</span> {formatLeaveDate(startDate)}
          </p>
        )}
        {endDate && (
          <p className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: END_COLOR }} />
            <span className="font-semibold text-slate-600">End:</span> {formatLeaveDate(endDate)}
          </p>
        )}
        {!startDate && <p>Click a date to set start, then click another for end.</p>}
        {startDate && !endDate && <p>Now click an end date (same day or later).</p>}
        {(startDate || endDate) && (
          <button type="button" onClick={onClear}
            className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

const APPROVED_COLOR = '#0c3b8f';
// Teal, not red — sick leave shouldn't read as an alarm.
const SICK_COLOR = '#0f6e56';
// Pending is always this amber, regardless of category — solid fill already carries the
// category color, so status (approved vs pending) is the one thing the outline needs to say.
const PENDING_COLOR = '#D97706';

function categoryLabel(cat) {
  if (cat === 'SICK') return 'Sick Leave';
  if (cat === 'EMERGENCY') return 'Emergency Leave';
  if (cat === 'ANNUAL') return 'Annual Leave';
  return 'Leave';
}

// Read-only month view for the dashboard overview — highlights the staff member's own
// approved leave (solid navy) and pending leave (amber outline) on the days they cover, so they
// can see at a glance what's booked without opening the request form.
function LeavePreviewCalendar({ requests }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  // Approved takes priority over pending if a day is somehow covered by both. Color is by
  // category (blue for Annual/Emergency, teal-green for Sick), not by status — status is shown
  // by fill instead: solid for approved, outlined for pending.
  const statusForDate = (ymd) => {
    let pending = null;
    for (const r of requests) {
      const s = String(r.start_date).slice(0, 10);
      const e = String(r.end_date).slice(0, 10);
      if (ymd < s || ymd > e) continue;
      if (r.workflow_status === 'APPROVED') return { status: 'APPROVED', category: r.category };
      if (r.workflow_status === 'PENDING') pending = { status: 'PENDING', category: r.category };
    }
    return pending;
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getCell = (day) => {
    if (!day) return null;
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = statusForDate(ymd);
    const color = info?.category === 'SICK' ? SICK_COLOR : APPROVED_COLOR;

    let circleClass = 'w-8 h-8 text-xs flex items-center justify-center rounded-full';
    let circleStyle;
    let title;
    if (info?.status === 'APPROVED') {
      circleClass += ' text-white font-bold cursor-default';
      circleStyle = { background: color };
      title = `${categoryLabel(info.category)} — Approved`;
    } else if (info?.status === 'PENDING') {
      circleClass += ' font-semibold border-2 cursor-default';
      circleStyle = { borderColor: PENDING_COLOR, color: PENDING_COLOR };
      title = `${categoryLabel(info.category)} — Pending approval`;
    } else {
      circleClass += ' text-slate-700';
    }

    return { circleClass, circleStyle, title };
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm select-none">
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p className="text-sm font-bold text-slate-900">Leave Calendar — {MONTHS[viewMonth]} {viewYear}</p>
        <button type="button" onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          const cell = getCell(day);
          return (
            <div key={i} className="flex items-center justify-center">
              {day ? (
                <span style={cell.circleStyle} className={cell.circleClass} title={cell.title}>{day}</span>
              ) : <span className="w-8 h-8" />}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: APPROVED_COLOR }} />
          Annual &amp; Emergency
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SICK_COLOR }} />
          Sick
        </span>
        <span className="flex items-center gap-1.5 pl-1 border-l border-slate-200">
          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 border-2" style={{ borderColor: PENDING_COLOR }} />
          Pending
        </span>
      </div>
    </div>
  );
}

export default function LeavePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Toast notifications — small auto-dismissing pill, matching attendance/progress pages.
  const [toast, setToast] = useState(null); // { text, type }
  const toastTimeoutRef = useRef(null);
  const showToast = (text, type) => {
    setToast({ text, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateFieldErrors, setDateFieldErrors] = useState([]); // 'startDate' | 'endDate'
  const leaveDayCount = countLeaveDays(startDate, endDate);
  // Days the request being edited already consumes from the balance — added back before checking
  // the limit, otherwise re-saving an existing ANNUAL/EMERGENCY request would double-count it.
  // Sick leave is never limited, so this only ever holds a non-zero value for the other two.
  const [editingOriginalDays, setEditingOriginalDays] = useState(0);
  const effectiveRemaining = balance ? balance.remainingDays + editingOriginalDays : null;
  const overBalance = category !== 'SICK' && leaveDayCount && effectiveRemaining !== null && leaveDayCount.total > effectiveRemaining;

  // Notify the moment a selection goes over balance, rather than waiting for the user to hit
  // Submit — fires once per transition into the over-balance state, not on every render.
  const wasOverBalanceRef = useRef(false);
  useEffect(() => {
    if (overBalance && !wasOverBalanceRef.current) {
      showToast(`Only ${effectiveRemaining} day${effectiveRemaining === 1 ? '' : 's'} left in your balance — pick a shorter range.`, 'error');
    }
    wasOverBalanceRef.current = overBalance;
  }, [overBalance]);

  const [reason, setReason] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [mcFile, setMcFile] = useState(null);
  const [mcFileError, setMcFileError] = useState('');
  const [uploadingMcId, setUploadingMcId] = useState(null);
  const [leaveCategoryFilter, setLeaveCategoryFilter] = useState('ALL');
  const [confirm, confirmDialog] = useConfirm();
  // The MC already attached to the request being edited (a file field can't be pre-filled).
  const editingMcUrl = editingId ? requests.find((r) => r.leave_id === editingId)?.mc_file_url : null;

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  const fetchData = useCallback(async (uid) => {
    setLoading(true);
    try {
      const [reqRes, balRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/leave/my-requests/${uid}`).catch(() => null),
        axios.get(`${API_BASE}/api/v1/leave/balance/${uid}`).catch(() => null),
      ]);
      setRequests(reqRes?.data?.data || []);
      setBalance(balRes?.data?.data || null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.user_id) fetchData(user.user_id); }, [user?.user_id, fetchData]);

  // Calendar date click: first click = start, second click = end (must be >= start), third = reset
  const handleCalendarClick = (ymd) => {
    setDateFieldErrors([]);
    if (!startDate || (startDate && endDate)) {
      setStartDate(ymd); setEndDate('');
    } else {
      if (ymd >= startDate) setEndDate(ymd);
      else { setStartDate(ymd); setEndDate(''); }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const missing = [];
    if (!startDate) missing.push('startDate');
    if (!endDate) missing.push('endDate');
    if (missing.length > 0) {
      setDateFieldErrors(missing);
      showToast(
        missing.length === 2 ? 'Please select a start and end date.' : `Please select ${missing[0] === 'startDate' ? 'a start' : 'an end'} date.`,
        'error'
      );
      return;
    }
    // Annual and emergency leave draw from the same balance and are capped by it; sick leave is
    // never limited, matching the backend's balance calculation (ANNUAL + EMERGENCY only).
    if (overBalance) {
      showToast(`Only ${effectiveRemaining} day${effectiveRemaining === 1 ? '' : 's'} left in your balance — pick a shorter range.`, 'error');
      return;
    }
    setDateFieldErrors([]);
    setSubmitting(true);
    try {
      const mcFileUrl = mcFile ? await fileToBase64(mcFile) : undefined;
      if (editingId) {
        await axios.patch(`${API_BASE}/api/v1/leave/${editingId}`, {
          userId: user.user_id, category, startDate, endDate, reason: reason.trim() || undefined, mcFileUrl,
        });
        showToast('Leave request updated successfully.', 'success');
      } else {
        await axios.post(`${API_BASE}/api/v1/leave/apply`, {
          userId: user.user_id, category, startDate, endDate, reason: reason.trim() || undefined, mcFileUrl,
        });
        showToast('Leave request submitted successfully.', 'success');
      }
      setShowForm(false); setStartDate(''); setEndDate(''); setReason(''); setCategory('ANNUAL'); setEditingId(null);
      setMcFile(null); setMcFileError(''); setEditingOriginalDays(0);
      await fetchData(user.user_id);
    } catch (err) { showToast(err.response?.data?.error || 'Submission failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleMcFileChange = (file) => {
    setMcFileError('');
    if (!file) { setMcFile(null); return; }
    if (file.size > MC_MAX_BYTES) { setMcFileError('File is too large — max 5MB.'); setMcFile(null); return; }
    setMcFile(file);
  };

  const handleEditClick = (r) => {
    setEditingId(r.leave_id);
    setCategory(r.category);
    const rStart = String(r.start_date).slice(0, 10);
    const rEnd = String(r.end_date).slice(0, 10);
    setStartDate(rStart);
    setEndDate(rEnd);
    setEditingOriginalDays(r.category === 'SICK' ? 0 : (countLeaveDays(rStart, rEnd)?.total || 0));
    setReason(r.reason || '');
    setMcFile(null); setMcFileError('');
    setDateFieldErrors([]);
    setShowForm(true);
  };

  const handleMcUpload = async (leaveId, file) => {
    if (!file || !user?.user_id) return;
    if (file.size > MC_MAX_BYTES) { showToast('File is too large — max 5MB.', 'error'); return; }
    setUploadingMcId(leaveId);
    try {
      const mcFileUrl = await fileToBase64(file);
      await axios.post(`${API_BASE}/api/v1/leave/${leaveId}/mc-upload`, { userId: user.user_id, mcFileUrl });
      showToast('MC document uploaded successfully.', 'success');
      await fetchData(user.user_id);
    } catch (err) {
      const apiError = err.response?.data?.error || 'MC upload failed.';
      const detail = err.response?.data?.detail;
      showToast(detail ? `${apiError} (${detail})` : apiError, 'error');
    }
    finally { setUploadingMcId(null); }
  };

  // Cancelling now hard-deletes the row on the backend, so a CANCELLED status should never show
  // up here — filtered out defensively in case any legacy soft-cancelled rows are still visible.
  const activeRequests = requests.filter((r) => String(r.workflow_status).toUpperCase() !== 'CANCELLED');
  const filteredRequests = leaveCategoryFilter === 'ALL' ? activeRequests : activeRequests.filter((r) => r.category === leaveCategoryFilter);

  // Used/pending day totals per category, for the overview cards — Annual and Emergency share
  // one balance pool server-side, so their remaining/total figures come from `balance` directly;
  // this just breaks that combined usage down by category, and covers Sick separately (unlimited).
  const categoryDayStats = (cat) => activeRequests
    .filter((r) => r.category === cat)
    .reduce((acc, r) => {
      const days = countLeaveDays(String(r.start_date).slice(0, 10), String(r.end_date).slice(0, 10))?.total || 0;
      if (r.workflow_status === 'APPROVED') acc.used += days;
      else if (r.workflow_status === 'PENDING') acc.pending += days;
      return acc;
    }, { used: 0, pending: 0 });
  const annualStats = categoryDayStats('ANNUAL');
  const emergencyStats = categoryDayStats('EMERGENCY');
  const sickStats = categoryDayStats('SICK');

  const handleCancelLeave = async (leaveId) => {
    if (!user?.user_id) return;
    const confirmed = await confirm({
      title: 'Delete leave request',
      message: 'Delete this pending leave request?',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE}/api/v1/leave/${leaveId}`, {
        data: { userId: user.user_id },
      });
      showToast('Leave request deleted successfully.', 'success');
      await fetchData(user.user_id);
    } catch (err) {
      showToast(err.response?.data?.error || 'Cancellation failed.', 'error');
    }
  };

  return (
    <div className="p-4 sm:p-8 overflow-x-hidden">
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Leave</h1>
        <p className="mt-2 text-sm text-slate-500">Apply for leave and track your request history.</p>
      </div>

      {confirmDialog}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white' : 'bg-slate-900 border-slate-950 text-white'
          }`}>
            {toast.text}
          </div>
        </div>
      )}

      {!showForm && (
        <div className="mb-8 space-y-6">
          {/* Overview — leave-type summary cards. Annual and Emergency draw from one shared
              balance (see the backend's combined calc), so they're one card with a per-category
              breakdown rather than two cards implying separate pools. Sick has no cap. */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Both cards share the exact same structure — header, headline number, progress
                bar, two caption lines — so they read as one consistent family even though Annual
                & Emergency has a capped balance and Sick doesn't. */}
            {(() => {
              const annualUsed = annualStats.used + emergencyStats.used;
              const annualPending = annualStats.pending + emergencyStats.pending;
              const annualTotal = balance ? balance.totalDays : annualUsed + annualPending;
              const annualUsedPct = annualTotal > 0 ? (annualUsed / annualTotal) * 100 : 0;
              const annualPendingPct = annualTotal > 0 ? (annualPending / annualTotal) * 100 : 0;
              const sickBase = sickStats.used + sickStats.pending;
              const sickUsedPct = sickBase > 0 ? (sickStats.used / sickBase) * 100 : 0;
              const sickPendingPct = sickBase > 0 ? (sickStats.pending / sickBase) * 100 : 0;
              return (
                <>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Annual &amp; Emergency Leave</p>
                        <p className="mt-1 text-xs text-slate-400">Shared balance &middot; {balance ? balance.totalDays : '—'} days</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: '#E6F1FB', color: '#0C447C' }}>
                        {balance ? balance.remainingDays : '—'} left
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-semibold text-slate-950 leading-none">
                      {balance ? balance.remainingDays : '—'}<span className="text-sm font-normal text-slate-400"> / {balance ? balance.totalDays : '—'} days</span>
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden flex">
                      <div className="h-full" style={{ width: `${annualUsedPct}%`, background: START_COLOR }} />
                      <div className="h-full" style={{ width: `${annualPendingPct}%`, background: '#FAEEDA' }} />
                    </div>
                    <div className="mt-2.5 flex gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: START_COLOR }} />{annualUsed} used</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: '#FAEEDA' }} />{annualPending} pending</span>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                      Annual: {annualStats.used} used, {annualStats.pending} pending &middot; Emergency: {emergencyStats.used} used, {emergencyStats.pending} pending
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Sick Leave</p>
                        <p className="mt-1 text-xs text-slate-400">No balance cap</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: '#E1F5EE', color: '#085041' }}>
                        {sickStats.pending} pending
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-semibold text-slate-950 leading-none">
                      {sickStats.used}<span className="text-sm font-normal text-slate-400"> days applied</span>
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden flex">
                      <div className="h-full" style={{ width: `${sickUsedPct}%`, background: SICK_COLOR }} />
                      <div className="h-full" style={{ width: `${sickPendingPct}%`, background: '#FAEEDA' }} />
                    </div>
                    <div className="mt-2.5 flex gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: SICK_COLOR }} />{sickStats.used} applied this year</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <LeavePreviewCalendar requests={activeRequests} />
        </div>
      )}

      {showForm && (
        <>
          <div className="mb-4">
            <button onClick={() => { setShowForm(false); setStartDate(''); setEndDate(''); setReason(''); setEditingId(null); setEditingOriginalDays(0); setMcFile(null); setMcFileError(''); setDateFieldErrors([]); }}
              className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{ background: '#64748b' }}>
              ← Back
            </button>
          </div>
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* Form card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
              {editingId && <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-3">Edit Leave Request</p>}
              <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">Leave Type</label>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  {CATEGORIES.map((c) => {
                    const selected = category === c;
                    return (
                      <label key={c} className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="radio" name="category" value={c} checked={selected}
                          onChange={() => setCategory(c)} className="sr-only" />
                        <span className={`flex items-center justify-center w-4 h-4 rounded-full border-2 transition ${selected ? 'border-[#0c3b8f]' : 'border-slate-300'}`}>
                          {selected && <span className="w-2 h-2 rounded-full bg-[#0c3b8f]" />}
                        </span>
                        <span className={`text-sm ${selected ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                          {c.charAt(0) + c.slice(1).toLowerCase()}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Dates: type directly, or click the calendar on the right. Each field's dot/border
                  color matches the highlight that date gets on the calendar, so it's clear at a
                  glance which one a calendar click is about to set. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: START_COLOR }} />
                    Start Date
                    <InfoTip text="Type dates directly, or click them on the calendar." />
                  </label>
                  <input type="date" value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setDateFieldErrors([]); }}
                    style={startDate && !dateFieldErrors.includes('startDate') ? { borderColor: START_COLOR, background: '#EEF4FF', color: START_COLOR } : undefined}
                    className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dateFieldErrors.includes('startDate') ? 'border-red-400' : startDate ? '' : 'border-slate-300 text-slate-700 font-normal'
                    }`} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: END_COLOR }} />
                    End Date
                  </label>
                  <input type="date" value={endDate} min={startDate || undefined}
                    onChange={(e) => { setEndDate(e.target.value); setDateFieldErrors([]); }}
                    style={
                      overBalance ? { borderColor: '#DC2626', background: '#FEF2F2', color: '#DC2626' }
                      : endDate && !dateFieldErrors.includes('endDate') ? { borderColor: END_COLOR, background: '#F5F3FF', color: END_COLOR }
                      : undefined
                    }
                    className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dateFieldErrors.includes('endDate') ? 'border-red-400' : endDate ? '' : 'border-slate-300 text-slate-700 font-normal'
                    }`} />
                </div>
              </div>

              {leaveDayCount && (
                <p className="-mt-2 text-xs font-semibold" style={{ color: overBalance ? '#DC2626' : START_COLOR }}>
                  {leaveDayCount.total} day{leaveDayCount.total === 1 ? '' : 's'} selected
                  <span className="font-normal text-slate-400"> · {leaveDayCount.working} working day{leaveDayCount.working === 1 ? '' : 's'}</span>
                </p>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Reason <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief reason for leave…"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {category === 'SICK' && (
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
                    MC Upload <span className="font-normal text-slate-400">(optional)</span>
                    <InfoTip text="You can also upload this later. Accepts PNG, JPG, or PDF — max 5MB." />
                  </label>
                  <input type="file" accept={MC_ACCEPT} onChange={(e) => handleMcFileChange(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#EEF4FF] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#0c3b8f]" />
                  {editingMcUrl && !mcFile && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      MC already attached.{' '}
                      <button type="button" onClick={() => openMcFile(editingMcUrl)} className="font-semibold text-[#0c3b8f] hover:underline">View current MC</button>
                      {' '}· Choose a file only if you want to replace it.
                    </p>
                  )}
                  {mcFile && <p className="mt-1.5 text-xs font-medium text-[#0c3b8f]">Selected: {mcFile.name}{editingMcUrl ? ' (replaces the current MC)' : ''}</p>}
                  {mcFileError && <p className="mt-1.5 text-xs font-medium text-red-600">{mcFileError}</p>}
                </div>
              )}

              <button type="submit" disabled={submitting || overBalance}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                {submitting ? 'Please wait…' : editingId ? 'Save changes' : 'Submit'}
              </button>
            </form>
          </div>

          {/* Calendar */}
            <MiniCalendar
              startDate={startDate}
              endDate={endDate}
              onDateClick={handleCalendarClick}
              onClear={() => { setStartDate(''); setEndDate(''); setDateFieldErrors([]); }}
            />
          </div>
        </>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Leave History</p>
          {!showForm && (
            <button onClick={() => { setShowForm(true); setEditingId(null); setEditingOriginalDays(0); setStartDate(''); setEndDate(''); setReason(''); setCategory('ANNUAL'); setMcFile(null); setMcFileError(''); setDateFieldErrors([]); }}
              className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{ background: '#0c3b8f' }}>
              + Apply for Leave
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-1.5">
            {['ALL', ...CATEGORIES].map((c) => (
              <button key={c} type="button" onClick={() => setLeaveCategoryFilter(c)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  leaveCategoryFilter === c ? 'bg-[#1a3a8f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400 text-center">Loading…</p>
        ) : filteredRequests.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400 text-center">
            {activeRequests.length === 0 ? 'No leave requests yet.' : 'No leave requests match this filter.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <tr>
                  <th className="px-6 py-4 whitespace-nowrap">Category</th>
                  <th className="px-6 py-4 whitespace-nowrap">Start</th>
                  <th className="px-6 py-4 whitespace-nowrap">End</th>
                  <th className="px-6 py-4 whitespace-nowrap">Status</th>
                  <th className="px-6 py-4 whitespace-nowrap">Remarks</th>
                  <th className="px-6 py-4 whitespace-nowrap">Submitted</th>
                  <th className="px-6 py-4 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRequests.map((r) => (
                  <tr key={r.leave_id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">{r.category}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{formatLeaveDate(String(r.start_date).slice(0, 10))}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{formatLeaveDate(String(r.end_date).slice(0, 10))}</td>
                    <td className="px-6 py-4 whitespace-nowrap"><StatusPill status={r.workflow_status} /></td>
                    <td className="px-6 py-4 text-slate-500 max-w-[180px] truncate">{r.reviewer_remarks || '—'}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{formatLeaveDate(r.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.workflow_status === 'PENDING' && (
                          <>
                            <button type="button" onClick={() => handleEditClick(r)}
                              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100">
                              Edit
                            </button>
                            <button type="button" onClick={() => handleCancelLeave(r.leave_id)}
                              className="rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">
                              Delete
                            </button>
                          </>
                        )}
                        {r.category === 'SICK' && (
                          r.mc_file_url ? (
                            <button type="button" onClick={() => openMcFile(r.mc_file_url)}
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                              View MC
                            </button>
                          ) : (
                            <label className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 cursor-pointer ${uploadingMcId === r.leave_id ? 'opacity-60 cursor-not-allowed' : ''}`}>
                              {uploadingMcId === r.leave_id ? 'Uploading…' : 'Upload MC'}
                              <input type="file" accept={MC_ACCEPT} className="hidden" disabled={uploadingMcId === r.leave_id}
                                onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; if (f) handleMcUpload(r.leave_id, f); }} />
                            </label>
                          )
                        )}
                        {r.workflow_status !== 'PENDING' && r.category !== 'SICK' && '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


