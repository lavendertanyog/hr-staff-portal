"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import Chart from 'chart.js/auto';
import { authHeaders } from '../authSession';
import { WHATS_NEW } from '../whatsNewData';
import ComingUp from '../ComingUp';
import { timeZoneForCountry, zonedWallClock } from '../officeTime';

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

// The office calendar date and time-of-day of an instant (the staff member's own office time
// zone; none has DST), regardless of the browser's own timezone — matches fmtTime's
// timeZone-based conversion.
function officeParts(iso, timeZone) {
  const shifted = zonedWallClock(iso, timeZone);
  return {
    dateStr: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`,
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60 + shifted.getUTCSeconds() / 3600,
  };
}

function fmtTime(iso, timeZone) {
  return new Date(iso).toLocaleString('en-SG', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
}

// Labels the timeline's 0-24 hour axis as a clock (12 AM, 2 AM, ...) since the axis now
// represents real clock-in/out times, not a plain duration. 24 wraps back to 12 AM.
function clockHourLabel(hour) {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour} ${period}`;
}

// Rings from the outside in. They differ in lightness as well as hue so they stay distinguishable.
const RING_COLORS = ['#1540A8', '#e48ab0', '#8fa6e6', '#16307a'];
const RING_RADII = [84, 66, 48, 30];

// Card surface used across the new dashboard: white, no border, a soft navy-tinted shadow.
const CARD = 'rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(22,48,122,0.18)]';

function ArrowLink({ href, children }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#1540A8]">
      {children}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </Link>
  );
}

export default function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  // The staff member's own office time zone (set by HR), which every time here is shown in.
  const officeTz = timeZoneForCountry(user?.home_office_country);
  const [projects, setProjects] = useState([]);
  const [inbox, setInbox] = useState([]);
  // Counted over the whole inbox feed (same as the Inbox page), not just the 6 shown here
  const [unreadCount, setUnreadCount] = useState(0);
  const [allocations, setAllocations] = useState([]);
  const [progressHistory, setProgressHistory] = useState([]);
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
      axios.get(`${API_BASE}/api/v1/users/${uid}/inbox`, { headers: authHeaders() }).catch(() => null),
      axios.get(`${API_BASE}/api/v1/allocations/${uid}`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/projects/progress-history/${uid}`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/attendance/active-session/${uid}`).catch(() => null),
    ]).then(([projRes, inboxRes, allocRes, historyRes, sessionRes]) => {
      setProjects(projRes?.data?.data || []);
      const inboxItems = inboxRes?.data?.data || [];
      setInbox(inboxItems.slice(0, 6));
      setUnreadCount(inboxItems.filter((i) => i.status === 'UNREAD').length);
      setAllocations(allocRes?.data?.data || []);
      setProgressHistory(historyRes?.data?.data || []);
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
    const nowParts = officeParts(nowMinute * 60000, officeTz);
    const sessionInfo = (s) => {
      const startParts = officeParts(s.clock_in_time, officeTz);
      const endParts = s.clock_out_time ? officeParts(s.clock_out_time, officeTz) : null;
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
  }, [logRange, fetchStart, fetchEnd, sessionRows, projectColorIndex, nowMinute, officeTz]);

  // The data changes every minute while a session is active (its bar grows) and on every refetch
  // when the window regains focus. Rebuilding the chart each time replayed its grow-in animation,
  // so it visibly flashed; instead the existing chart takes the new data in place, with no
  // animation. It is only built anew the first time, or when its canvas was replaced (the
  // "Loading…" state swaps the canvas out).
  const ganttDatasetsRef = useRef(ganttDatasets);
  useEffect(() => { ganttDatasetsRef.current = ganttDatasets; }, [ganttDatasets]);

  useEffect(() => {
    if (!chartRef.current) return;
    const existing = chartInstance.current;
    if (existing && existing.canvas === chartRef.current) {
      existing.data.labels = ganttLabels;
      existing.data.datasets = ganttDatasets;
      existing.update('none');
      return;
    }
    if (existing) existing.destroy();

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
          const sessionId = ganttDatasetsRef.current[datasetIndex]?._sessionIds[index];
          if (sessionId) setSelectedSessionId(sessionId);
        },
      },
    });
  }, [ganttLabels, ganttDatasets]);

  useEffect(() => () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } }, []);

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessionRows.find((s) => s.attendance_id === selectedSessionId) || null;
  }, [selectedSessionId, sessionRows]);

  const staffName = deriveNameFromEmail(user?.email) || user?.full_name || 'Staff';
  const firstName = staffName.split(' ')[0];

  // Only worked out once the user is loaded (always client-side), so the server render and the
  // first client render match and the time-based text never causes a hydration mismatch.
  const greeting = useMemo(() => {
    if (!user) return 'Welcome back';
    const hour = Number(new Date().toLocaleString('en-SG', { timeZone: officeTz, hour: 'numeric', hourCycle: 'h23' }));
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }, [user, officeTz]);
  const todayLabel = user
    ? new Date().toLocaleDateString('en-SG', { timeZone: officeTz, weekday: 'short', day: 'numeric', month: 'short' })
    : '';

  const budgetProjects = useMemo(() => projects
    .filter((p) => Number(p.budget_hours) > 0)
    .map((p) => {
      const pct = Math.round((Number(p.total_tracked_hours || 0) / Number(p.budget_hours)) * 100);
      return {
        code: p.project_code,
        name: p.project_name || p.project_code,
        pct,
        color: pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#1540A8',
      };
    })
    .slice(0, 5), [projects]);

  // One ring per project the user is allocated to, showing its latest logged completion %
  // (progress history comes back newest first) — the same number the Progress page shows.
  const myProjects = useMemo(() => {
    const seen = new Set();
    return allocations
      .filter((a) => a.project_code && !seen.has(a.project_code) && seen.add(a.project_code))
      .map((a) => {
        const log = progressHistory.find((h) => h.project_code === a.project_code);
        return {
          code: a.project_code,
          name: a.project_name || a.project_code,
          pct: log ? Math.round(Math.min(100, Math.max(0, Number(log.completion_percentage || 0)))) : 0,
        };
      });
  }, [allocations, progressHistory]);
  const ringProjects = myProjects.slice(0, RING_COLORS.length);
  const overallPct = myProjects.length
    ? Math.round(myProjects.reduce((sum, p) => sum + p.pct, 0) / myProjects.length)
    : 0;

  const latestNews = WHATS_NEW[0];

  return (
    <div className="px-6 pb-8 pt-2 sm:px-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">

        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-col gap-8">

          {/* Greeting and clock-in */}
          <section className="relative overflow-hidden rounded-3xl px-8 py-9 text-white sm:px-10" style={{ background: '#16307a' }}>
            <svg className="pointer-events-none absolute -right-10 -top-16 hidden sm:block" width="340" height="340" viewBox="0 0 360 360" fill="none" aria-hidden="true">
              <circle cx="180" cy="180" r="150" stroke="#2f56b8" strokeWidth="2" />
              <circle cx="180" cy="180" r="112" stroke="#2f56b8" strokeWidth="2" strokeDasharray="4 8" />
              <circle cx="180" cy="180" r="74" fill="#1a3a8f" stroke="#E8EEFF" strokeWidth="3" />
              <path d="M180 130v50l32 20" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="180" cy="180" r="8" fill="#f0c9dc" />
              <circle cx="300" cy="96" r="14" fill="#f0c9dc" />
              <circle cx="64" cy="250" r="9" fill="#E8EEFF" />
            </svg>
            <div className="relative max-w-lg">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#aab8e0]">{todayLabel || '\u00A0' /* keeps the line's height until the date is known */}</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{greeting}, {firstName}</h1>
              <p className="mt-3 flex items-center gap-2 text-sm text-[#d6def5]">
                {loading ? 'Checking your attendance…' : activeSession ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
                    <span>Clocked in since {fmtTime(activeSession.clock_in_time, officeTz)} · <span className="tabular-nums">{elapsedLabel}</span></span>
                  </>
                ) : 'You haven’t clocked in yet.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/attendance"
                  className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-[#16307a] transition hover:bg-[#E8EEFF]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  {activeSession ? 'Clock out' : 'Clock in'}
                </Link>
                <Link href="/attendance"
                  className="rounded-2xl border border-[#4a6bc4] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                  Manual entry
                </Link>
              </div>
            </div>
          </section>

          <ComingUp user={user} />

          {/* This week: attendance timeline and project budgets, side by side */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-slate-900">This {logRange === 'week' ? 'week' : 'month'}</h2>
              <ArrowLink href="/progress">Progress</ArrowLink>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className={`${CARD} min-w-0 p-6`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Hours worked</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button type="button"
                        onClick={() => (logRange === 'week' ? setWeekOffset((o) => o - 1) : setMonthOffset((o) => Math.max(minMonthOffset, o - 1)))}
                        disabled={logRange === 'month' && monthOffset <= minMonthOffset}
                        aria-label={logRange === 'week' ? 'Previous week' : 'Previous month'}
                        className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-[#E8EEFF] hover:text-[#1540A8] disabled:opacity-40">‹</button>
                      <span className="min-w-[110px] text-center text-xs font-semibold text-slate-500">{rangeLabel}</span>
                      <button type="button"
                        onClick={() => (logRange === 'week' ? setWeekOffset((o) => Math.min(0, o + 1)) : setMonthOffset((o) => Math.min(0, o + 1)))}
                        disabled={logRange === 'week' ? weekOffset >= 0 : monthOffset >= 0}
                        aria-label={logRange === 'week' ? 'Next week' : 'Next month'}
                        className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-[#E8EEFF] hover:text-[#1540A8] disabled:opacity-40">›</button>
                    </div>
                    <div className="flex gap-1 rounded-full bg-slate-50 p-1">
                      {[{ k: 'week', l: 'Week' }, { k: 'month', l: 'Month' }].map((r) => (
                        <button key={r.k} type="button" onClick={() => setLogRange(r.k)}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${logRange === r.k ? 'bg-[#1540A8] text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                          {r.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {!logLoading && legendItems.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {legendItems.map((item) => (
                      <span key={item.code} className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
                        {item.code}
                      </span>
                    ))}
                  </div>
                )}
  
                {logLoading ? (
                  <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
                ) : (
                  <>
                    <div style={logRange === 'month' ? { maxHeight: 480, overflowY: 'auto' } : undefined}>
                      <div style={{ position: 'relative', width: '100%', height: logRange === 'week' ? 280 : Math.max(280, ganttLabels.length * 32) }}>
                        <canvas ref={chartRef} role="img" aria-label="Timeline of attendance sessions, one row per day" />
                      </div>
                    </div>
                    {sessionRows.length === 0 && (
                      <p className="mt-2 text-center text-xs text-slate-400">No attendance logged in this period yet.</p>
                    )}
                    {selectedSession && (
                      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {formatShort(selectedSession.day)} · {fmtTime(selectedSession.clock_in_time, officeTz)} – {selectedSession.clock_out_time ? fmtTime(selectedSession.clock_out_time, officeTz) : 'still active'}
                          </p>
                          <button type="button" onClick={() => setSelectedSessionId(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
                        </div>
                        <ul className="space-y-1.5">
                          {(selectedSession.allocations || []).map((a, i) => (
                            <li key={`${a.project_code}-${i}`} className="flex items-center justify-between text-sm">
                              <span className="text-slate-700">{a.project_code}</span>
                              <span className="font-semibold tabular-nums text-slate-900">{Number(a.hours || 0).toFixed(2)}h</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className={`${CARD} min-w-0 px-6 py-5`}>
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Project budget used</span>
                {loading ? (
                  <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
                ) : budgetProjects.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">None of your projects has an hours budget yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {budgetProjects.map((p) => (
                      <li key={p.code} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,180px)_48px] items-center gap-4 py-3.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
                          <span className="block text-xs text-slate-400">{p.code}</span>
                        </span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, p.pct)}%`, background: p.color }} />
                        </span>
                        <span className="text-right text-sm font-bold tabular-nums text-slate-900">{p.pct}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── Side column ── */}
        <aside className="flex min-w-0 flex-col gap-6 rounded-3xl bg-white p-6 xl:self-start">
          {/* My statistics: one progress ring per project */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-900">My statistics</h2>
              <ArrowLink href="/progress">Progress</ArrowLink>
            </div>
            {loading ? (
              <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : myProjects.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">You aren&apos;t allocated to any projects yet.</p>
            ) : (
              <>
                <div className="relative mx-auto" style={{ width: 200, height: 200 }}>
                  <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
                    {ringProjects.map((p, i) => {
                      const r = RING_RADII[i];
                      const c = 2 * Math.PI * r;
                      return (
                        <g key={p.code} transform="rotate(-90 100 100)">
                          <circle cx="100" cy="100" r={r} fill="none" stroke="#EEF2FB" strokeWidth="11" />
                          {p.pct > 0 && (
                            <circle cx="100" cy="100" r={r} fill="none" stroke={RING_COLORS[i]} strokeWidth="11" strokeLinecap="round"
                              strokeDasharray={`${((c * p.pct) / 100).toFixed(1)} ${c.toFixed(1)}`} />
                          )}
                        </g>
                      );
                    })}
                  </svg>
                  {ringProjects.length < 4 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{overallPct}%</span>
                      <span className="text-xs text-slate-400">Overall</span>
                    </div>
                  )}
                </div>
                <ul className="mt-5 flex flex-col gap-1">
                  {ringProjects.map((p, i) => (
                    <li key={p.code}>
                      <Link href="/progress"
                        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-[#F7F9FD]">
                        <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: RING_COLORS[i] }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
                          <span className="block text-xs text-slate-400">{p.code}</span>
                        </span>
                        <span className="text-sm font-bold tabular-nums text-slate-900">{p.pct}%</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                      </Link>
                    </li>
                  ))}
                  {myProjects.length > ringProjects.length && (
                    <li>
                      <Link href="/progress" className="block px-3 py-2 text-xs font-semibold text-slate-500 hover:text-[#1540A8]">
                        +{myProjects.length - ringProjects.length} more on Progress
                      </Link>
                    </li>
                  )}
                </ul>
              </>
            )}
          </section>

          {/* Quick actions */}
          <section>
            <h2 className="mb-4 text-base font-extrabold text-slate-900">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Apply leave', href: '/leave' },
                { label: 'Log progress', href: '/progress' },
                { label: 'New claim', href: '/claims' },
                { label: 'Request budget', href: '/progress?tab=budget' },
              ].map((a) => (
                <Link key={a.label} href={a.href}
                  className="flex h-12 items-center justify-center rounded-2xl bg-[#E8EEFF] px-2 text-center text-sm font-bold text-[#16307a] transition hover:bg-[#dbe4ff]">
                  {a.label}
                </Link>
              ))}
            </div>
          </section>

          {/* Recent inbox */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-900">
                Inbox{unreadCount > 0 && <span className="ml-2 rounded-full bg-[#1540A8] px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>}
              </h2>
              <ArrowLink href="/inbox">All</ArrowLink>
            </div>
            {loading ? (
              <p className="py-4 text-sm text-slate-400">Loading…</p>
            ) : inbox.length === 0 ? (
              <p className="py-4 text-sm text-slate-400">No recent activity.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {inbox.slice(0, 4).map((item, i) => (
                  <li key={item.notification_id || i} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${item.status === 'UNREAD' ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{item.subtitle}</p>
                    </div>
                    {item.status === 'UNREAD' && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#1540A8]" aria-label="New" />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* What's new */}
          {latestNews && (
            <section className="relative flex min-h-[190px] flex-col justify-end overflow-hidden rounded-3xl p-6 text-white" style={{ background: '#0f2463' }}>
              <svg className="pointer-events-none absolute -right-8 -top-8" width="190" height="190" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                <rect x="70" y="40" width="88" height="112" rx="12" transform="rotate(12 114 96)" fill="#1a3a8f" stroke="#aab8e0" strokeWidth="2" />
                <path d="M96 76h40M94 92h40M92 108h26" stroke="#E8EEFF" strokeWidth="4" strokeLinecap="round" transform="rotate(12 114 96)" />
                <circle cx="66" cy="132" r="22" fill="#f0c9dc" />
                <path d="M57 132l6 6 12-12" stroke="#16307a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="relative text-xs font-bold uppercase tracking-[0.24em] text-[#aab8e0]">What&apos;s new</p>
              <p className="relative mt-1.5 text-base font-extrabold leading-snug">{latestNews.title}</p>
              <Link href="/whats-new" className="relative mt-3 flex items-center gap-2 text-sm font-semibold text-white hover:text-[#E8EEFF]">
                Read more
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

