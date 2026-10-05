"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import Chart from 'chart.js/auto';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

const PROJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const GENERAL_COLOR = '#898781';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Monday..Sunday range for the week `offset` weeks from the current one (0 = this week).
function weekRange(offset) {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toISO(monday), end: toISO(sunday), monday };
}

function formatShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}


// Calendar month `offset` months from the current one (0 = this month, negative = earlier).
// Clamped to the current calendar year and never past today.
function monthRange(offset) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = new Date(target.getFullYear(), target.getMonth(), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const end = lastDay < now ? lastDay : now;
  const label = target.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
  return { start: toISO(start), end: toISO(end), label };
}

// SGT is a fixed UTC+8 offset (no DST), so shifting the raw instant by +8h and reading its UTC
// parts gives the exact SGT calendar date and time-of-day, regardless of the browser's own
// timezone — matches fmtTimeSGT's timeZone-based conversion without needing Intl for math.
function sgtParts(iso) {
  const shifted = new Date(new Date(iso).getTime() + 8 * 3600000);
  return {
    dateStr: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`,
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60 + shifted.getUTCSeconds() / 3600,
  };
}

function fmtTimeSGT(iso) {
  return new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true });
}

// Labels the timeline's 0-24 hour axis as a clock (12 AM, 2 AM, ...) since the axis now
// represents real clock-in/out times, not a plain duration. 24 wraps back to 12 AM.
function clockHourLabel(hour) {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour} ${period}`;
}

export default function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Weekly project log
  const [logRange, setLogRange] = useState('week'); // 'week' | 'month'
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [logLoading, setLogLoading] = useState(true);
  // Real per-session clock-in/out times, used to draw the timeline as a Gantt chart (a bar
  // positioned at its actual time of day) instead of a plain accumulated total — for both Week
  // (7 day-rows) and Month (one row per day in the month) views.
  const [sessionRows, setSessionRows] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  useEffect(() => {
    if (!user?.user_id) return;
    const uid = user.user_id;
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/api/v1/projects/active-list?userId=${uid}`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/users/${uid}/inbox`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/leave/balance/${uid}`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/attendance/active-session/${uid}`).catch(() => null),
    ]).then(([projRes, inboxRes, balRes, sessionRes]) => {
      setProjects(projRes?.data?.data || []);
      setInbox(inboxRes?.data?.data?.slice(0, 6) || []);
      setLeaveBalance(balRes?.data?.data || null);
      setActiveSession(sessionRes?.data?.data || null);
    }).finally(() => setLoading(false));
  }, [user?.user_id]);

  // Live-ticking "Active Sessions" clock — purely client-side math off clock_in_time, no
  // refresh or polling needed for the number itself to stay accurate.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedLabel = useMemo(() => {
    if (!activeSession?.clock_in_time) return null;
    const secs = Math.max(0, Math.floor((nowTick - new Date(activeSession.clock_in_time).getTime()) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }, [activeSession, nowTick]);

  // Fetch range for the weekly project log whenever the range/offset changes.
  const { fetchStart, fetchEnd, rangeLabel } = useMemo(() => {
    if (logRange === 'week') {
      const { start, end } = weekRange(weekOffset);
      return { fetchStart: start, fetchEnd: end, rangeLabel: `${formatShort(start)} – ${formatShort(end)}` };
    }
    const { start, end, label } = monthRange(monthOffset);
    return { fetchStart: start, fetchEnd: end, rangeLabel: label };
  }, [logRange, weekOffset, monthOffset]);

  // Earliest month navigable is January of the current year.
  const minMonthOffset = -new Date().getMonth();

  const refreshSessionRows = useCallback((opts) => {
    if (!user?.user_id) return;
    if (!opts?.silent) setLogLoading(true);
    setSelectedSessionId(null);
    axios.get(`${API_BASE}/api/v1/attendance/sessions/${user.user_id}?start=${fetchStart}&end=${fetchEnd}`)
      .then((r) => setSessionRows(r.data?.data || []))
      .catch(() => setSessionRows([]))
      .finally(() => setLogLoading(false));
  }, [user?.user_id, fetchStart, fetchEnd]);

  useEffect(() => { refreshSessionRows(); }, [refreshSessionRows, logRange]);

  // The chart's data only refreshes on mount/range-change by default, so a session clocked in on
  // the Attendance page (a separate route) wouldn't show up here until the next full navigation.
  // Refetching on focus/visibility catches that — switching back to this tab, or returning here
  // via back/forward, reflects a just-started session immediately instead of looking stale.
  useEffect(() => {
    if (!user?.user_id) return;
    const onFocus = () => {
      refreshSessionRows({ silent: true });
      axios.get(`${API_BASE}/api/v1/attendance/active-session/${user.user_id}`)
        .then((r) => setActiveSession(r.data?.data || null))
        .catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.user_id, refreshSessionRows]);

  // Stable color per project across the whole loaded period, so the chart and legend always
  // agree regardless of which slot/segment a project happens to land in. Assigned in first-seen
  // order; "General" (untracked/non-project time) always gets the same neutral gray.
  const projectColorIndex = useMemo(() => {
    const index = new Map();
    sessionRows.forEach((s) => {
      (s.allocations || []).forEach((a) => {
        const code = a.project_code || 'General';
        if (code !== 'General' && !index.has(code)) index.set(code, index.size);
      });
    });
    return index;
  }, [sessionRows]);

  const colorForProject = (code) => {
    if (!code || code === 'General') return GENERAL_COLOR;
    const idx = projectColorIndex.get(code);
    return PROJECT_COLORS[(idx ?? 0) % PROJECT_COLORS.length];
  };

  const legendItems = useMemo(() => {
    const seen = new Map();
    let hasGeneral = false;
    sessionRows.forEach((s) => {
      (s.allocations || []).forEach((a) => {
        const code = a.project_code || 'General';
        if (code === 'General') { hasGeneral = true; return; }
        if (!seen.has(code)) seen.set(code, colorForProject(code));
      });
    });
    const items = Array.from(seen.entries()).map(([code, color]) => ({ code, color }));
    if (hasGeneral) items.push({ code: 'General', color: GENERAL_COLOR });
    return items;
  }, [sessionRows, projectColorIndex]);

  // One stacked bar per attendance session, positioned at its real SGT clock-in → clock-out
  // time and segmented by project — a Gantt-style timeline instead of a plain accumulated
  // total. Each segment's width is its project's actual hours; any time left over (staff
  // extended the end time past what was allocated to a project) shows as untracked "General".
  // Week shows 7 day-rows (Mon-Sun); Month shows one row per day in the fetched range. Sessions
  // can no longer overlap in time (the backend blocks that), but a day can still have more than
  // one non-overlapping session — all of a day's sessions (and the transparent gaps between
  // them) share a single stack, so every entry lands on the same straight line instead of each
  // extra session spreading into its own sub-row.
  // Throttled to the minute (not the raw per-second nowTick) so an active session's bar still
  // grows live without rebuilding the whole Chart.js instance every second.
  const nowMinute = Math.floor(nowTick / 60000);

  const { ganttLabels, ganttDatasets } = useMemo(() => {
    // Every calendar day from fetchStart to fetchEnd inclusive — 7 days for Week (which is
    // exactly that range's Monday..Sunday), up to a whole month's worth for Month.
    const dayKeys = [];
    let cursor = fetchStart;
    while (cursor <= fetchEnd) {
      dayKeys.push(cursor);
      const d = new Date(cursor + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      cursor = toISO(d);
    }
    const labelsForDays = dayKeys.map((k) => logRange === 'week'
      ? new Date(k + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short' })
      : formatShort(k));

    const byDay = {};
    dayKeys.forEach((k) => { byDay[k] = []; });
    sessionRows.forEach((s) => { if (byDay[s.day]) byDay[s.day].push(s); });
    Object.values(byDay).forEach((list) => list.sort((a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time)));

    // Per day, work out this session's start hour and its ordered list of segments (each
    // project's real hours, plus a trailing "General" segment for any untracked leftover time).
    // For a session that runs past midnight, `endHour`/`fullDuration` are measured in hours
    // since the START day's midnight (so a 10:55pm-12:48am session has fullDuration ~1.88h,
    // not the ~1.08h you'd get by clamping to that day's own 24h axis) — segments are then
    // split at the midnight boundary below, so the portion after 12am lands on the next day's
    // row instead of silently vanishing off the end of the start day's bar.
    const nowParts = sgtParts(nowMinute * 60000);
    const sessionInfo = (s) => {
      const startParts = sgtParts(s.clock_in_time);
      const endParts = s.clock_out_time ? sgtParts(s.clock_out_time) : null;
      const crossesMidnight = !!(endParts && endParts.dateStr !== startParts.dateStr);
      // A session still clocked in (no clock_out_time yet) hasn't reached the end of the day —
      // its bar should stop at the current time, not stretch all the way to midnight as if the
      // rest of the day were already worked. Only falls back to midnight for the rare stale case
      // of an open session from a day that isn't today (auto-clock-out normally prevents this).
      const endHour = crossesMidnight
        ? 24 + endParts.hour
        : endParts && endParts.hour > startParts.hour
          ? endParts.hour
          : !s.clock_out_time && startParts.dateStr === nowParts.dateStr
            ? Math.max(nowParts.hour, startParts.hour)
            : 24;
      const allocations = s.allocations || [];
      const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.hours || 0), 0);
      const leftover = Math.max(0, (endHour - startParts.hour) - allocatedTotal);
      const segments = allocations.map((a) => ({ project_code: a.project_code || 'General', hours: Number(a.hours || 0) }));
      if (leftover > 0.01) segments.push({ project_code: 'General', hours: leftover });
      return { startHour: startParts.hour, segments, crossesMidnight, endDay: crossesMidnight ? endParts.dateStr : startParts.dateStr };
    };

    // Flatten each day's sessions into one chronological sequence of "pieces" — a transparent
    // gap wherever there's idle time (before the first session, and between sessions), and a
    // colored piece per project segment — all destined for the same stack, so multiple sessions
    // in a day render as one continuous line rather than parallel sub-bars. Built as a day->state
    // map (not a plain array) so a session that crosses midnight can push its after-midnight
    // segments straight onto the NEXT day's entry, even before that day is otherwise visited.
    const dayState = {};
    dayKeys.forEach((k) => { dayState[k] = { pieces: [], cursor: 0 }; });
    dayKeys.forEach((k) => {
      byDay[k].forEach((s) => {
        const info = sessionInfo(s);
        const dp = dayState[k];
        const gap = info.startHour - dp.cursor;
        if (gap > 0.01 || dp.pieces.length === 0) {
          dp.pieces.push({ hours: Math.max(0, gap), color: 'transparent', sessionId: null });
        }
        let remainingUntilMidnight = info.crossesMidnight ? 24 - info.startHour : Infinity;
        let crossed = false;
        info.segments.forEach((seg) => {
          const color = colorForProject(seg.project_code);
          if (crossed) {
            const next = dayState[info.endDay];
            if (next) { next.pieces.push({ hours: seg.hours, color, sessionId: s.attendance_id }); next.cursor += seg.hours; }
            return;
          }
          if (info.crossesMidnight && seg.hours > remainingUntilMidnight + 0.001) {
            const beforeHours = remainingUntilMidnight;
            const afterHours = seg.hours - beforeHours;
            if (beforeHours > 0.001) dp.pieces.push({ hours: beforeHours, color, sessionId: s.attendance_id });
            const next = dayState[info.endDay];
            if (next) { next.pieces.push({ hours: afterHours, color, sessionId: s.attendance_id }); next.cursor += afterHours; }
            crossed = true;
            remainingUntilMidnight = 0;
          } else {
            dp.pieces.push({ hours: seg.hours, color, sessionId: s.attendance_id });
            remainingUntilMidnight -= seg.hours;
          }
        });
        dp.cursor = info.crossesMidnight ? 24 : info.startHour + info.segments.reduce((sum, seg) => sum + seg.hours, 0);
      });
    });
    const dayPieces = dayKeys.map((k) => dayState[k].pieces);

    const maxPieces = Math.max(0, ...dayPieces.map((pieces) => pieces.length));
    const datasets = [];
    for (let i = 0; i < maxPieces; i++) {
      datasets.push({
        label: `piece-${i}`,
        data: dayPieces.map((pieces) => pieces[i]?.hours || 0),
        backgroundColor: dayPieces.map((pieces) => pieces[i]?.color || 'transparent'),
        hoverBackgroundColor: dayPieces.map((pieces) => pieces[i]?.color || 'transparent'),
        borderRadius: 3,
        borderSkipped: false,
        stack: 'timeline',
        _sessionIds: dayPieces.map((pieces) => pieces[i]?.sessionId || null),
      });
    }

    return { ganttLabels: labelsForDays, ganttDatasets: datasets };
  }, [logRange, fetchStart, fetchEnd, sessionRows, projectColorIndex, nowMinute]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: ganttLabels,
        datasets: ganttDatasets,
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            // A single day tops out at 24h, so the axis is fixed 0–24 rather than auto-scaling
            // to whatever hours happen to be logged.
            stacked: true, min: 0, max: 24,
            grid: { color: '#e2e8f0' },
            ticks: { color: '#94a3b8', stepSize: 2, precision: 0, callback: (v) => clockHourLabel(v) },
          },
          y: { stacked: true, grid: { display: false }, ticks: { color: '#94a3b8' } },
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const { datasetIndex, index } = elements[0];
          const sessionId = ganttDatasets[datasetIndex]?._sessionIds[index];
          if (sessionId) setSelectedSessionId(sessionId);
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [ganttLabels, ganttDatasets]);

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessionRows.find((s) => s.attendance_id === selectedSessionId) || null;
  }, [selectedSessionId, sessionRows]);

  const staffName = deriveNameFromEmail(user?.email) || user?.full_name || 'Staff';
  const unreadCount = inbox.filter((i) => i.status === 'UNREAD').length;
  const leaveDate = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long' });

  const stats = [
    {
      label: 'Active Sessions',
      value: loading ? '—' : (elapsedLabel || 'Not clocked in'),
      href: '/attendance',
      live: !!elapsedLabel,
    },
    { label: `Leave taken as of ${leaveDate}`, value: loading ? '—' : leaveBalance ? `${leaveBalance.usedDays} days` : '—', href: '/leave' },
    { label: 'Unread Notifications', value: loading ? '—' : unreadCount, href: '/inbox' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Welcome back, {staffName}</h1>
        <p className="mt-2 text-sm text-slate-500">Manage your attendance, leave, and project progress in one place.</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-6 xl:grid-cols-3 mb-10">
        {stats.map((item) => (
          <Link key={item.label} href={item.href}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-slate-300 cursor-pointer">
            <div className="flex items-center gap-2">
              {item.live && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{item.label}</p>
            </div>
            <p className="mt-4 text-3xl font-semibold text-slate-950 tabular-nums">{item.value}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-5">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: activeSession ? 'Clock Out' : 'Clock In', href: '/attendance', bg: '#EEF4FF', color: '#1a3a8f' },
            { label: 'Apply Leave', href: '/leave', bg: '#EEFBF3', color: '#166534' },
            { label: 'Log Progress', href: '/progress', bg: '#FFFBEB', color: '#92400e' },
            { label: 'Request Budget', href: '/progress?tab=budget', bg: '#FDF4FF', color: '#6b21a8' },
          ].map((a) => (
            <Link key={a.href} href={a.href}
              className="rounded-2xl px-4 py-4 text-sm font-semibold transition hover:opacity-90"
              style={{ background: a.bg, color: a.color }}>
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Weekly project log */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Weekly Project Log</p>
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <div className="flex items-center gap-1">
              <button type="button"
                onClick={() => (logRange === 'week' ? setWeekOffset((o) => o - 1) : setMonthOffset((o) => Math.max(minMonthOffset, o - 1)))}
                disabled={logRange === 'month' && monthOffset <= minMonthOffset}
                aria-label={logRange === 'week' ? 'Previous week' : 'Previous month'}
                className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center disabled:opacity-40">‹</button>
              <span className="text-xs text-slate-500 min-w-[104px] text-center">{rangeLabel}</span>
              <button type="button"
                onClick={() => (logRange === 'week' ? setWeekOffset((o) => Math.min(0, o + 1)) : setMonthOffset((o) => Math.min(0, o + 1)))}
                disabled={logRange === 'week' ? weekOffset >= 0 : monthOffset >= 0}
                aria-label={logRange === 'week' ? 'Next week' : 'Next month'}
                className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center disabled:opacity-40">›</button>
            </div>
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {[{ k: 'week', l: 'Week' }, { k: 'month', l: 'Month' }].map((r) => (
                <button key={r.k} type="button" onClick={() => setLogRange(r.k)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${logRange === r.k ? 'bg-white shadow-sm text-[#0c3b8f]' : 'text-slate-500'}`}>
                  {r.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!logLoading && legendItems.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {legendItems.map((item) => (
              <span key={item.code} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />
                {item.code}
              </span>
            ))}
          </div>
        )}

        {logLoading ? (
          <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
        ) : (
          <>
            <div style={logRange === 'month' ? { maxHeight: 480, overflowY: 'auto' } : undefined}>
              <div style={{ position: 'relative', width: '100%', height: logRange === 'week' ? 280 : Math.max(280, ganttLabels.length * 32) }}>
                <canvas ref={chartRef} role="img" aria-label="Timeline of attendance sessions, one row per day" />
              </div>
            </div>
            {sessionRows.length === 0 && (
              <p className="mt-2 text-xs text-slate-400 text-center">No attendance logged in this period yet.</p>
            )}
            {selectedSession && (
              <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {formatShort(selectedSession.day)} · {fmtTimeSGT(selectedSession.clock_in_time)} – {selectedSession.clock_out_time ? fmtTimeSGT(selectedSession.clock_out_time) : 'still active'}
                  </p>
                  <button type="button" onClick={() => setSelectedSessionId(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
                </div>
                <ul className="space-y-1.5">
                  {(selectedSession.allocations || []).map((a, i) => (
                    <li key={`${a.project_code}-${i}`} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{a.project_code}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{Number(a.hours || 0).toFixed(2)}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recent inbox */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Recent Activity</p>
            <p className="mt-1 font-semibold text-slate-900">Inbox</p>
          </div>
          <Link href="/inbox" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            View all
          </Link>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400">Loading…</p>
        ) : inbox.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {inbox.map((item, i) => (
              <li key={item.notification_id || i}
                className={`px-6 py-4 flex items-start justify-between gap-4 hover:bg-slate-50 transition ${item.status === 'READ' ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className={`text-sm truncate ${item.status === 'UNREAD' ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{item.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{item.subtitle}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  item.status === 'UNREAD' ? 'bg-blue-50 text-blue-700' :
                  item.status === 'APPROVED' ? 'bg-green-50 text-green-700' :
                  item.status === 'REJECTED' ? 'bg-red-50 text-red-600' :
                  'bg-gray-100 text-gray-500'
                }`}>{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
