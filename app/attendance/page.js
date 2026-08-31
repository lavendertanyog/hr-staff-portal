"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

// Silently request geolocation — user never sees a button
function requestLocationSilently() {
  return new Promise((resolve) => {
    if (!navigator?.geolocation) { resolve({ latitude: null, longitude: null }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve({ latitude: null, longitude: null }),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

const GENERAL = 'GENERAL';

// Searchable project picker: type to filter, or just pick from the list — replaces a plain <select>
function ProjectSearchSelect({ value, onChange, projects, placeholder, error }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = useMemo(() => [
    { code: GENERAL, name: 'General (non-project)' },
    ...projects.map((p) => ({ code: p.project_code, name: p.project_name })),
  ], [projects]);

  const selected = options.find((o) => o.code === value);
  const labelOf = (o) => (o.code === GENERAL ? o.name : `${o.code} — ${o.name}`);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.code + ' ' + o.name).toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="relative">
      <div ref={ref} className="relative">
        <input
          type="text"
          value={open ? query : (selected ? labelOf(selected) : '')}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          placeholder={placeholder}
          className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
            error ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'
          }`}
        />
        {open && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">No matching projects</p>
            ) : filtered.map((o) => (
              <button key={o.code} type="button"
                onClick={() => { onChange(o.code); setOpen(false); setQuery(''); }}
                className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 ${
                  value === o.code ? 'bg-[#EEF4FF] text-[#0c3b8f] font-semibold' : 'text-slate-700'
                }`}>
                {labelOf(o)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Today's date as "YYYY-MM-DD", for defaulting (but no longer locking) manual entry date fields
function todayISOStr() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Current device time as "HH:MM", for defaulting (but not locking) manual entry time fields
function nowHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function toISODateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mondayOfThisWeekISO() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  return toISODateStr(monday);
}
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODateStr(d);
}
// Total hours across a session's project allocations — the same value shown in its breakdown.
function sessionTotalHours(session) {
  return (session.allocations || []).reduce((sum, a) => sum + Number(a.hours || 0), 0);
}

const STANDARD_WORKDAY_HOURS = 8;

// Splits the workday into values on the same 0.25h grid as the hour input's `step`, so every
// row is always a value the browser accepts — a plain 8/count division (e.g. 8/3 = 2.67) lands
// off-grid and trips the input's native step validation. Any leftover quarter-hours from the
// division go to the first few rows so the total always comes out to exactly 8.
function evenSplitHours(count) {
  const STEP = 0.25;
  const n = Math.max(count, 1);
  const totalSteps = Math.round(STANDARD_WORKDAY_HOURS / STEP);
  const base = Math.floor(totalSteps / n);
  const remainder = totalSteps - base * n;
  return Array.from({ length: n }, (_, i) => Math.round((base + (i < remainder ? 1 : 0)) * STEP * 100) / 100);
}

function fmtHours(h) {
  const n = Number(h || 0);
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(2)}h`;
}

function projectLabel(code, projects) {
  if (!code) return 'General (non-project)';
  const p = projects.find((p) => p.project_code === code);
  return p ? `${p.project_code} — ${p.project_name}` : code;
}

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

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [clockRemark, setClockRemark] = useState('');
  const [clockedIn, setClockedIn] = useState(false);
  const [attendanceId, setAttendanceId] = useState(null);
  // The live session's own clock-in time, kept alongside attendanceId so Manual Entry can close
  // that exact session (via an edited End Time) without a separate lookup.
  const [activeSessionClockInTime, setActiveSessionClockInTime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logTab, setLogTab] = useState('clock'); // 'clock' | 'manual'

  // Toast notifications — small auto-dismissing pill instead of a persistent banner.
  const [toast, setToast] = useState(null); // { text, type }
  const toastTimeoutRef = useRef(null);
  const showToast = (text, type) => {
    setToast({ text, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  // Multi-project clock-in setup (before clocking in) — defaults to a single General row;
  // General is just another option in the project picker, not a separate mode.
  const [projectRows, setProjectRows] = useState([{ code: GENERAL, hours: STANDARD_WORKDAY_HOURS }]);
  const [projectRowsValidated, setProjectRowsValidated] = useState(false);

  // Active session allocation tracking (after clocking in)
  const [allocations, setAllocations] = useState([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addProjectCode, setAddProjectCode] = useState('');
  const [addProjectBusy, setAddProjectBusy] = useState(false);
  const [modalAllocId, setModalAllocId] = useState(null);
  const [modalHoursVal, setModalHoursVal] = useState('');
  const notifiedRef = useRef(new Set());

  // Manual entry state — a single-shot, already-finished block of work. Submitting never opens
  // a live session: the end time is derived as the entered start time plus however many hours
  // are allocated across the chosen projects, and the whole thing is recorded as done at once.
  const [manualClockInDate, setManualClockInDate] = useState(() => todayISOStr());
  const [manualClockInTime, setManualClockInTime] = useState(() => nowHHMM());
  const [manualRemark, setManualRemark] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Edit-allocation modal: 'allocated' edits the plan (not-yet-completed blocks); 'corrected'
  // records a staff correction to a completed block's actual hours, kept separate from the
  // original system-recorded value rather than overwriting it.
  const [modalMode, setModalMode] = useState('allocated');
  // Which allocation list the open modal is editing — the live Clock In/Out session's, or a
  // Manual Entry's — since each keeps its own state and the modal needs to update the right one.
  const [modalSource, setModalSource] = useState('live');

  const todayISO = todayISOStr();

  // Combine a "YYYY-MM-DD" date with a "HH:MM" time input into a full datetime string with an
  // explicit Singapore offset (+08:00, no DST) — without it, the naive string's timezone is
  // ambiguous between the browser, the backend's validation check, and Postgres's own cast,
  // and those can disagree about which instant it actually represents.
  const combineDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    return `${dateStr}T${timeStr}:00+08:00`;
  };

  // Refresh the manual entry date/time to "now" whenever the fields are still at their
  // untouched defaults — so switching to the tab later in the day shows current time,
  // without clobbering a date/time the user already deliberately picked.
  const openManualTab = () => {
    setLogTab('manual');
    setManualStep('start');
    if (clockedIn) {
      // Nothing to set up — Manual Entry will render straight into closing the live session,
      // so seed a sensible "right now" End Time for it to edit.
      setManualClockOutDate(todayISOStr());
      setManualClockOutTime(nowHHMM());
      setManualClockOutTouched(true);
    }
    setManualClockInDate((d) => d || todayISOStr());
    setManualClockInTime((t) => t || nowHHMM());
    setManualClockInTouched(false);
  };

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      const u = JSON.parse(stored);
      setUser(u);

      // Restore clock-in state ONLY if it belongs to this user
      const savedUserId = sessionStorage.getItem('staff_attendance_user_id');
      const savedAttId = sessionStorage.getItem('staff_attendance_id');
      const savedProject = sessionStorage.getItem('staff_attendance_project');

      if (savedAttId && savedUserId === u.user_id) {
        setAttendanceId(savedAttId);
        setClockedIn(true);
        if (savedProject) setSelectedProject(savedProject);
      } else if (savedAttId && savedUserId !== u.user_id) {
        // Stale data from a previous user — clear it
        sessionStorage.removeItem('staff_attendance_id');
        sessionStorage.removeItem('staff_attendance_project');
        sessionStorage.removeItem('staff_attendance_user_id');
      }
    } catch { router.push('/'); }
  }, [router]);

  useEffect(() => {
    if (!user?.user_id) return;

    const fetchActiveSession = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/v1/attendance/active-session/${user.user_id}`);
        const active = res.data?.data;
        if (active) {
          setAttendanceId(active.attendance_id);
          setActiveSessionClockInTime(active.clock_in_time);
          setSelectedProject(active.project_code || GENERAL);
          setClockedIn(true);
          setAllocations(active.allocations || []);
          sessionStorage.setItem('staff_attendance_id', active.attendance_id);
          sessionStorage.setItem('staff_attendance_project', active.project_code || '');
          sessionStorage.setItem('staff_attendance_user_id', user.user_id);

          // Check the currently active block for an elapsed time budget and fire a
          // notification + beep once per allocation (server-side notified_at also guards this
          // across devices/reloads).
          const activeBlock = (active.allocations || []).find((a) => a.status === 'ACTIVE');
          if (activeBlock && activeBlock.started_at && !activeBlock.notified_at) {
            const trackedHrs = Number(activeBlock.accumulated_hours || 0) + (Date.now() - new Date(activeBlock.started_at).getTime()) / 3600000;
            if (trackedHrs >= Number(activeBlock.allocated_hours) && !notifiedRef.current.has(activeBlock.allocation_id)) {
              notifiedRef.current.add(activeBlock.allocation_id);
              playBeep();
              showBrowserNotification(
                'Allocated time is up',
                `Your planned time for ${projectLabel(activeBlock.project_code, projects)} has run out. Extend it or mark it complete.`
              );
              axios.post(`${API_BASE}/api/v1/attendance/allocations/${activeBlock.allocation_id}/mark-notified`, { userId: user.user_id }).catch(() => {});
            }
          }
        } else {
          setClockedIn(false);
          setAttendanceId(null);
          setActiveSessionClockInTime(null);
          setAllocations([]);
          notifiedRef.current = new Set();
          sessionStorage.removeItem('staff_attendance_id');
          sessionStorage.removeItem('staff_attendance_project');
          sessionStorage.removeItem('staff_attendance_user_id');
        }
      } catch {
        // Ignore transient errors; local state may still be valid.
      }
    };

    fetchActiveSession();
    const interval = window.setInterval(fetchActiveSession, 20000);
    const handleFocus = () => fetchActiveSession();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.user_id, projects]);

  // Local 1s tick to smoothly animate progress bars between server polls.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;
    axios.get(`${API_BASE}/api/v1/projects/active-list?userId=${user.user_id}`)
      .then((r) => setProjects(r.data?.data || [])).catch(() => {});
  }, [user?.user_id]);

  // Sidebar (right column): "This week" stats + a recent-entries preview, both derived from a
  // single 180-day lookback fetch — also backs the full History panel, so there's only one
  // network call to keep in sync when an entry is edited.
  const [pastSessions, setPastSessions] = useState([]);
  const [pastSessionsLoading, setPastSessionsLoading] = useState(true);

  const refreshPastSessions = () => {
    if (!user?.user_id) return;
    setPastSessionsLoading(true);
    axios.get(`${API_BASE}/api/v1/attendance/sessions/${user.user_id}`, { params: { start: daysAgoISO(180), end: todayISOStr() } })
      .then((r) => setPastSessions((r.data?.data || []).slice().sort((a, b) => new Date(b.clock_in_time) - new Date(a.clock_in_time))))
      .catch(() => setPastSessions([]))
      .finally(() => setPastSessionsLoading(false));
  };

  useEffect(() => { refreshPastSessions(); }, [user?.user_id]);

  const weekStats = useMemo(() => {
    const monday = mondayOfThisWeekISO();
    const thisWeek = pastSessions.filter((s) => s.day >= monday);
    const hours = thisWeek.reduce((sum, s) => sum + sessionTotalHours(s), 0);
    const days = new Set(thisWeek.map((s) => s.day)).size;
    return { hours, days };
  }, [pastSessions]);

  const recentEntries = useMemo(() => pastSessions.slice(0, 5), [pastSessions]);

  // Full History panel — same data as above, with quick pill filters and a specific-date picker.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPill, setHistoryPill] = useState('all'); // 'all' | 'week' | 'month'
  const [historyDate, setHistoryDate] = useState(null); // overrides the pill when set
  const [historyVisibleCount, setHistoryVisibleCount] = useState(10);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const filteredHistoryEntries = useMemo(() => {
    if (historyDate) return pastSessions.filter((s) => s.day === historyDate);
    if (historyPill === 'week') {
      const monday = mondayOfThisWeekISO();
      return pastSessions.filter((s) => s.day >= monday);
    }
    if (historyPill === 'month') {
      const firstOfMonth = `${todayISOStr().slice(0, 7)}-01`;
      return pastSessions.filter((s) => s.day >= firstOfMonth);
    }
    return pastSessions;
  }, [pastSessions, historyPill, historyDate]);

  const openHistory = () => {
    setHistoryOpen(true);
    setHistoryPill('all');
    setHistoryDate(null);
    setHistoryVisibleCount(10);
  };

  // Days in the currently-displayed calendar month, Monday-first, padded with the leading days
  // of the previous month so the grid always starts on a Monday column.
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [calendarMonth]);

  const showMsg = (text, type) => showToast(text, type);

  // Re-split the standard 8h workday evenly across however many rows exist, keeping any codes
  // already picked. Used whenever a row is added or removed.
  const resplitProjectRows = (rows) => {
    const hours = evenSplitHours(rows.length);
    return rows.map((r, i) => ({ ...r, hours: hours[i] }));
  };

  const addProjectRow = () => {
    setProjectRowsValidated(false);
    setProjectRows((prev) => {
      if (prev.length >= 8) return prev;
      return resplitProjectRows([...prev, { code: '', hours: 0 }]);
    });
  };

  const removeProjectRow = (index) => {
    setProjectRows((prev) => {
      if (prev.length <= 1) return prev;
      return resplitProjectRows(prev.filter((_, i) => i !== index));
    });
  };

  const handleClockIn = async () => {
    if (!user?.user_id) return;
    if (projectRows.some((r) => !r.code)) { setProjectRowsValidated(true); return; }
    if (projectRows.some((r) => !(parseFloat(r.hours) > 0))) { showMsg('Please enter valid hours for every project.', 'error'); return; }
    const allocationsPayload = projectRows.map((r) => ({ projectCode: r.code, allocatedHours: parseFloat(r.hours) }));

    setLoading(true);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    // Silently attempt location capture in the background
    const coords = await requestLocationSilently();
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/clock-in`, {
        userId: user.user_id,
        isManualLocation: !coords.latitude,
        latitude: coords.latitude,
        longitude: coords.longitude,
        remark: clockRemark.trim() || undefined,
        allocations: allocationsPayload,
      });
      const data = res.data?.data;
      const id = data?.attendance_id;
      const firstCode = data?.allocations?.[0]?.project_code || GENERAL;
      setAttendanceId(id); setClockedIn(true); setSelectedProject(firstCode);
      setAllocations(data?.allocations || []);
      notifiedRef.current = new Set();
      sessionStorage.setItem('staff_attendance_id', id);
      sessionStorage.setItem('staff_attendance_project', firstCode);
      sessionStorage.setItem('staff_attendance_user_id', user.user_id);
      showMsg('Clocked in successfully.', 'success');
    } catch (e) { showMsg(e.response?.data?.error || 'Clock-in failed.', 'error'); }
    finally { setLoading(false); }
  };

  const handleClockOut = async () => {
    if (!attendanceId || !user?.user_id) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, {
        userId: user.user_id, attendanceId, remark: clockRemark.trim() || undefined,
      });
      setClockedIn(false); setAttendanceId(null); setClockRemark(''); setAllocations([]);
      sessionStorage.removeItem('staff_attendance_id');
      sessionStorage.removeItem('staff_attendance_project');
      sessionStorage.removeItem('staff_attendance_user_id');
      showToast('Clocked out successfully.', 'success');
      refreshPastSessions();
    } catch (e) { showMsg(e.response?.data?.error || 'Clock-out failed.', 'error'); }
    finally { setLoading(false); }
  };

  const handleAddProject = async () => {
    if (!addProjectCode || !attendanceId || !user?.user_id) return;
    setAddProjectBusy(true);
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/allocations`, {
        userId: user.user_id, attendanceId, projectCode: addProjectCode,
      });
      setAllocations(res.data?.data?.allocations || []);
      setAddProjectOpen(false); setAddProjectCode('');
      showMsg('Project added — remaining time has been re-split.', 'success');
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to add project.', 'error'); }
    finally { setAddProjectBusy(false); }
  };

  const handleCompleteAllocation = async (allocationId) => {
    if (!user?.user_id) return;
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/allocations/${allocationId}/complete`, { userId: user.user_id });
      setAllocations(res.data?.data?.allocations || []);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to mark project complete.', 'error'); }
  };

  const handleModalMarkComplete = async () => {
    if (!modalAllocId) return;
    await handleCompleteAllocation(modalAllocId);
    setModalAllocId(null);
  };

  const handleReopen = async () => {
    if (!modalAllocId || !user?.user_id) return;
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/allocations/${modalAllocId}/reopen`, { userId: user.user_id });
      setAllocations(res.data?.data?.allocations || []);
      notifiedRef.current.delete(modalAllocId);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to reopen project.', 'error'); }
    finally { setModalAllocId(null); }
  };

  const handleSaveEditHours = async () => {
    const hrs = parseFloat(modalHoursVal);
    if (!user?.user_id || !modalAllocId || !hrs || hrs <= 0) { setModalAllocId(null); return; }
    const setTarget = modalSource === 'manual' ? setManualAllocations : setAllocations;
    const payload = modalMode === 'corrected'
      ? { userId: user.user_id, correctedHours: hrs }
      : { userId: user.user_id, allocatedHours: hrs };
    try {
      const res = await axios.patch(`${API_BASE}/api/v1/attendance/allocations/${modalAllocId}`, payload);
      setTarget((prev) => prev.map((a) => (a.allocation_id === modalAllocId ? res.data?.data : a)));
      notifiedRef.current.delete(modalAllocId);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to update hours.', 'error'); }
    finally { setModalAllocId(null); }
  };

  const handleDeleteAllocation = async (allocationId, source, currentList) => {
    if (!user?.user_id) return;
    if (currentList.length <= 1) { showMsg("Can't delete the only project on this entry.", 'error'); return; }
    if (!window.confirm('Delete this project from the entry? Its hours will be re-split across the remaining projects.')) return;
    const setTarget = source === 'manual' ? setManualAllocations : setAllocations;
    try {
      const res = await axios.delete(`${API_BASE}/api/v1/attendance/allocations/${allocationId}`, { data: { userId: user.user_id } });
      setTarget(res.data?.data?.allocations || []);
      notifiedRef.current.delete(allocationId);
      showMsg('Project removed.', 'success');
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to delete project.', 'error'); }
  };

  // Manual Entry: a single-shot, already-finished block of work. The end time defaults to the
  // start time plus the total of the requested allocations' hours, but staff can override it
  // directly — e.g. clocked in 8:30am, the project only took 8 hours, but didn't actually clock
  // off until 6pm. Every allocation still records COMPLETED with its full planned hours either
  // way; nothing here ever goes "live."
  const [manualProjectRows, setManualProjectRows] = useState([{ code: GENERAL, hours: STANDARD_WORKDAY_HOURS }]);
  const [manualProjectRowsValidated, setManualProjectRowsValidated] = useState(false);
  const [manualClockInTouched, setManualClockInTouched] = useState(false); // true once staff edits Start Time directly
  const [manualClockOutDate, setManualClockOutDate] = useState(() => todayISOStr());
  const [manualClockOutTime, setManualClockOutTime] = useState(() => nowHHMM());
  const [manualClockOutTouched, setManualClockOutTouched] = useState(false); // true once staff edits End Time directly
  // The just-submitted entry's own allocations — kept so a correction/delete could reuse the
  // same tracker component again later, even though nothing currently renders it.
  const [manualAllocations, setManualAllocations] = useState([]);
  // Set when the selected date already has something logged — shows a confirmation before
  // creating what might be a duplicate entry, naming the period(s) already on record.
  const [dayConflictEntries, setDayConflictEntries] = useState(null);
  // Set when the proposed entry's time range genuinely overlaps one already logged — this is a
  // hard block (never allowed to create a duplicate on top of it), offering to edit the existing
  // entry's times instead.
  const [overlapEntry, setOverlapEntry] = useState(null);
  // The existing, already-logged entry currently being corrected (Start/End time edit), reached
  // either from the overlap block above or opened directly. Editing preserves the pre-edit values
  // server-side (original_clock_in_time/out) for audit purposes only — staff only ever see the
  // current, edited times.
  const [editingEntry, setEditingEntry] = useState(null); // { attendance_id, clock_in_time, clock_out_time }
  const [editStartDate, setEditStartDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // True if [newStart, newEnd) genuinely overlaps an existing entry's [clock_in_time, clock_out_time
  // or "still open" up to now) — used to hard-block a duplicate Manual Entry / clock-in on top of
  // time already recorded, rather than just warning about the same calendar day.
  const findOverlap = (entries, newStart, newEnd) => (entries || []).find((e) => {
    const exStart = new Date(e.clock_in_time).getTime();
    const exEnd = e.clock_out_time ? new Date(e.clock_out_time).getTime() : Date.now();
    return exStart < newEnd.getTime() && exEnd > newStart.getTime();
  });

  const openEditEntry = (entry) => {
    setOverlapEntry(null);
    setDayConflictEntries(null);
    const start = new Date(entry.clock_in_time);
    const end = entry.clock_out_time ? new Date(entry.clock_out_time) : new Date();
    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const toTimeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setEditingEntry(entry);
    setEditStartDate(toDateStr(start));
    setEditStartTime(toTimeStr(start));
    setEditEndDate(toDateStr(end));
    setEditEndTime(toTimeStr(end));
  };

  const submitEditTimes = async (e) => {
    e.preventDefault();
    if (!editingEntry || !user?.user_id) return;
    if (!editStartDate || !editStartTime || !editEndDate || !editEndTime) {
      showToast('Please fill in both start and end time.', 'error'); return;
    }
    const clockInTime = combineDateTime(editStartDate, editStartTime);
    const clockOutTime = combineDateTime(editEndDate, editEndTime);
    if (new Date(clockOutTime) <= new Date(clockInTime)) {
      showToast('End time must be after the start time.', 'error'); return;
    }
    if (new Date(clockInTime) > new Date()) {
      showToast('You can\'t select a future date.', 'error'); return;
    }
    setEditSubmitting(true);
    try {
      await axios.patch(`${API_BASE}/api/v1/attendance/${editingEntry.attendance_id}/edit-times`, {
        userId: user.user_id, clockInTime, clockOutTime,
      });
      showToast('Entry updated successfully.', 'success');
      setEditingEntry(null);
      refreshPastSessions();
    } catch (e2) {
      showToast(e2.response?.data?.error || 'Failed to update entry.', 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Pure wall-clock arithmetic (no Date-object timezone conversion) so this matches exactly what
  // combineDateTime later sends as the SGT instant, regardless of the browser's own timezone.
  const addHoursToClock = (dateStr, timeStr, hoursToAdd) => {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    let totalMinutes = h * 60 + m + Math.round(hoursToAdd * 60);
    const dayOffset = Math.floor(totalMinutes / 1440);
    totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const newTime = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    let newDate = dateStr;
    if (dayOffset !== 0) {
      // Built from explicit Y/M/D numbers (not a parsed "...T00:00:00" string) so this Date is
      // unambiguously local-time midnight, and read back with the matching local getters — never
      // toISOString(), which converts through UTC and would shift the date backward by a day in
      // any UTC+ browser (e.g. local midnight Aug 30 in SGT is still Aug 29 in UTC).
      const [Y, M, D] = dateStr.split('-').map(Number);
      const d = new Date(Y, M - 1, D);
      d.setDate(d.getDate() + dayOffset);
      newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return { date: newDate, time: newTime };
  };

  // Backdating a past day means the whole shift is already over, so default to a normal
  // workday (8:30am–6pm) rather than "right now" — staff can still edit either field freely.
  // Today keeps defaulting Start to the current time, since the shift may still be in progress.
  useEffect(() => {
    if (manualClockInTouched) return;
    const isPast = manualClockInDate && manualClockInDate < todayISOStr();
    setManualClockInTime(isPast ? '08:30' : nowHHMM());
  }, [manualClockInDate, manualClockInTouched]);

  // Keep the suggested End Time in sync, unless staff has already edited it directly — same
  // "don't clobber a deliberate edit" pattern used elsewhere. For a past day, default straight
  // to 6pm (a normal end of day); for today, suggest Start + total project hours instead, since
  // that's the best guess available before the actual end of day is known.
  useEffect(() => {
    if (manualClockOutTouched) return;
    const isPast = manualClockInDate && manualClockInDate < todayISOStr();
    if (isPast) {
      setManualClockOutDate(manualClockInDate);
      setManualClockOutTime('18:00');
    } else {
      const totalHours = manualProjectRows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
      const { date, time } = addHoursToClock(manualClockInDate || todayISOStr(), manualClockInTime || '00:00', totalHours);
      setManualClockOutDate(date);
      setManualClockOutTime(time);
    }
  }, [manualClockInDate, manualClockInTime, manualProjectRows, manualClockOutTouched]);

  // Two-phase form: Step 1 collects the start + what was worked on, Step 2 (only reachable after
  // Step 1) collects when it actually ended. Nothing is sent to the backend until Step 2 submits
  // — Step 1's "Clock In" just advances the form, it doesn't create anything yet.
  const [manualStep, setManualStep] = useState('start'); // 'start' | 'end'
  // Whenever the staff member already has a real live session open (via Clock In/Out), Manual
  // Entry has nothing to "clock in" for — it goes straight to closing that exact session (via the
  // same clock-out endpoint the live tab uses) instead of offering to start a second, duplicate
  // attendance_logs row for the day. Derived straight from the live-session state so it's always
  // in sync, never a separately-set flag.
  const closingActiveEntry = (clockedIn && attendanceId)
    ? { attendance_id: attendanceId, clock_in_time: activeSessionClockInTime }
    : null;

  const submitManualEntry = async () => {
    const allocationsPayload = manualProjectRows.map((r) => ({ projectCode: r.code, allocatedHours: parseFloat(r.hours) }));
    setManualSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/manual-entry`, {
        userId: user.user_id,
        clockInTime: combineDateTime(manualClockInDate, manualClockInTime),
        clockOutTime: combineDateTime(manualClockOutDate, manualClockOutTime),
        remark: manualRemark.trim() || undefined,
        allocations: allocationsPayload,
      });
      const data = res.data?.data;
      const totalHours = (data?.allocations || []).reduce((sum, a) => sum + Number(a.allocated_hours || 0), 0);
      setManualAllocations(data?.allocations || []);
      showToast(`Entry logged — ${fmtHours(totalHours)} recorded.`, 'success');
      setManualClockInDate(todayISOStr()); setManualClockInTime(nowHHMM()); setManualRemark('');
      setManualProjectRows([{ code: GENERAL, hours: STANDARD_WORKDAY_HOURS }]);
      setManualProjectRowsValidated(false);
      setManualClockInTouched(false);
      setManualClockOutTouched(false);
      setManualStep('start');
      refreshPastSessions();
    } catch (e) { showToast(e.response?.data?.error || 'Manual entry failed.', 'error'); }
    finally { setManualSubmitting(false); }
  };

  // A backdated entry (any date before today) has its whole day already over, so there's no
  // reason to ask separately "when did you finish" afterward — both times are already known,
  // so collect them together in one step. Only "today" keeps the two-step Clock In / Clock Out
  // flow, since the end time genuinely might not be known yet.
  const isPastManualEntry = manualClockInDate && manualClockInDate < todayISOStr();
  // A shift can legitimately cross midnight (e.g. clocked in 8pm, out 4am), so End Date is
  // allowed up to one day past Start Date — never further.
  const manualEndDateMax = addHoursToClock(manualClockInDate || todayISOStr(), '00:00', 24).date;

  // Step 1's day-entries fetch, kept so Step 2 can re-check the full [start, end) range for a
  // real time overlap once the End Time is actually known.
  const [manualDayEntries, setManualDayEntries] = useState([]);

  const handleManualClockInStep = async (e) => {
    e.preventDefault();
    if (!user?.user_id) return;
    if (manualProjectRows.some((r) => !r.code)) { setManualProjectRowsValidated(true); return; }
    if (manualProjectRows.some((r) => !(parseFloat(r.hours) > 0))) { showToast('Please enter valid hours for every project.', 'error'); return; }
    if (!manualClockInDate) { showToast('Please select a date.', 'error'); return; }
    if (!manualClockInTime) { showToast('Please enter a start time.', 'error'); return; }
    if (new Date(combineDateTime(manualClockInDate, manualClockInTime)) > new Date()) {
      showToast('You can\'t select a future date.', 'error'); return;
    }
    if (isPastManualEntry) {
      if (!manualClockOutDate || !manualClockOutTime) { showToast('Please enter an end time.', 'error'); return; }
      if (combineDateTime(manualClockOutDate, manualClockOutTime) <= combineDateTime(manualClockInDate, manualClockInTime)) {
        showToast('End time must be after the start time.', 'error'); return;
      }
      if (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) > new Date()) {
        showToast('You can\'t select a future date.', 'error'); return;
      }
    }

    let existing = [];
    try {
      const res = await axios.get(`${API_BASE}/api/v1/attendance/day-entries/${user.user_id}`, { params: { date: manualClockInDate } });
      existing = res.data?.data || [];
      setManualDayEntries(existing);
    } catch { /* if the check itself fails, fall through and let the flow proceed */ }

    const newStart = new Date(combineDateTime(manualClockInDate, manualClockInTime));
    const newEnd = isPastManualEntry ? new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) : newStart;
    const overlap = findOverlap(existing, newStart, newEnd);
    if (overlap) { setOverlapEntry(overlap); return; }
    if (existing.length > 0) { setDayConflictEntries(existing); return; }

    if (isPastManualEntry) submitManualEntry(); else setManualStep('end');
  };

  const handleManualClockOutStep = (e) => {
    e.preventDefault();
    if (!manualClockOutDate || !manualClockOutTime) { showToast('Please enter an end time.', 'error'); return; }
    if (combineDateTime(manualClockOutDate, manualClockOutTime) <= combineDateTime(manualClockInDate, manualClockInTime)) {
      showToast('End time must be after the start time.', 'error'); return;
    }
    if (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) > new Date()) {
      showToast('You can\'t select a future date.', 'error'); return;
    }
    const newStart = new Date(combineDateTime(manualClockInDate, manualClockInTime));
    const newEnd = new Date(combineDateTime(manualClockOutDate, manualClockOutTime));
    const overlap = findOverlap(manualDayEntries, newStart, newEnd);
    if (overlap) { setOverlapEntry(overlap); return; }
    submitManualEntry();
  };

  // Closes the staff member's real live session (started via Clock In/Out) using the End Time
  // they edit here, instead of creating a second manual-entry record for the same day. Reuses the
  // same /clock-out endpoint and mirrors the top-level clockedIn/attendanceId state the live tab
  // reads, so the Clock In/Out tab immediately reflects the session as closed too.
  const submitActiveSessionClockOut = async (e) => {
    e.preventDefault();
    if (!closingActiveEntry || !user?.user_id) return;
    if (!manualClockOutDate || !manualClockOutTime) { showToast('Please enter an end time.', 'error'); return; }
    // The End Time input only has minute precision, but a clock-in can land a few seconds into
    // that same minute — compare against the start of the clock-in's minute (matching the
    // backend's own clockInFloored check) so closing out in that same minute isn't rejected.
    const clockInFloored = new Date(closingActiveEntry.clock_in_time);
    clockInFloored.setSeconds(0, 0);
    if (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) < clockInFloored) {
      showToast('End time must be after the start time.', 'error'); return;
    }
    if (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) > new Date()) {
      showToast('You can\'t select a future date.', 'error'); return;
    }
    setManualSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, {
        userId: user.user_id,
        attendanceId: closingActiveEntry.attendance_id,
        clockOutTime: combineDateTime(manualClockOutDate, manualClockOutTime),
      });
      setClockedIn(false); setAttendanceId(null); setAllocations([]);
      sessionStorage.removeItem('staff_attendance_id');
      sessionStorage.removeItem('staff_attendance_project');
      sessionStorage.removeItem('staff_attendance_user_id');
      showToast('Active session clocked out successfully.', 'success');
      setManualClockOutTouched(false);
      setManualStep('start');
      refreshPastSessions();
    } catch (e2) { showToast(e2.response?.data?.error || 'Clock-out failed.', 'error'); }
    finally { setManualSubmitting(false); }
  };

  const fmtTimeSGT = (iso) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true });

  // "28/8/2026" — used for the day-conflict warning. Only needs to represent whole SGT calendar
  // days, so a straight day/month/year split on the "YYYY-MM-DD" string is exact — no timezone
  // conversion involved.
  const fmtSlashDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${d}/${m}/${y}`;
  };

  // Shared between Clock In/Out and Manual Entry — each keeps its own row state (so setting up
  // a manual entry never disturbs an in-progress live clock-in setup, and vice versa), but the
  // form itself is identical either way. "General (non-project)" is just the first option in
  // each project picker, not a separate mode.
  const renderProjectSetupUI = (rows, setRows, validated, setValidated) => {
    const totalRowHours = rows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
    const overAllocated = totalRowHours > STANDARD_WORKDAY_HOURS + 0.01;
    const resplit = (nextRows) => {
      const hours = evenSplitHours(nextRows.length);
      return nextRows.map((r, i) => ({ ...r, hours: hours[i] }));
    };
    const addRow = () => {
      setValidated(false);
      setRows((prev) => (prev.length >= 8 ? prev : resplit([...prev, { code: '', hours: 0 }])));
    };
    const removeRow = (index) => {
      setRows((prev) => (prev.length <= 1 ? prev : resplit(prev.filter((_, i) => i !== index))));
    };
    return (
      <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
        <p className="text-xs text-slate-400 mb-4">Hours auto-split across projects. Adjust as needed.</p>
        <div className="space-y-4">
          {rows.map((row, i) => {
            const rowError = validated && !row.code;
            return (
            <div key={i} className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <ProjectSearchSelect
                  value={row.code}
                  onChange={(code) => { setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, code } : r))); }}
                  projects={projects.filter((p) => !rows.some((r, idx) => idx !== i && r.code === p.project_code))}
                  placeholder="Select or search project…"
                  error={rowError}
                />
                {rowError && <p className="mt-1 text-xs text-red-500">* Complete this field</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input type="number" min="0.1" step="0.1" value={row.hours}
                  onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, hours: e.target.value } : r)))}
                  className="w-16 rounded-xl border-2 border-[#D1D5DB] bg-white px-2 py-3 text-sm text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <span className="text-xs text-slate-400">hrs</span>
              </div>
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} title="Remove project"
                  className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-red-500 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            );
          })}
        </div>
        <p className={`mt-3 text-xs font-semibold ${overAllocated ? 'text-amber-600' : 'text-slate-400'}`}>
          Total: {totalRowHours.toFixed(2)} / {STANDARD_WORKDAY_HOURS} hrs
        </p>
        {rows.length < 8 && (
          <button type="button" onClick={addRow}
            className="mt-4 w-full rounded-2xl border border-dashed border-slate-300 bg-white py-3 text-sm font-semibold text-[#0c3b8f] hover:bg-slate-50">
            + Add Project
          </button>
        )}
      </div>
    );
  };
  const projectSetupUI = renderProjectSetupUI(projectRows, setProjectRows, projectRowsValidated, setProjectRowsValidated);
  const manualProjectSetupUI = renderProjectSetupUI(manualProjectRows, setManualProjectRows, manualProjectRowsValidated, setManualProjectRowsValidated);

  // Shared between the live Clock In/Out session and a just-submitted Manual Entry — each keeps
  // its own allocation list, but the card layout, edit/delete/correct controls, and the modal
  // work identically either way. `allowAdd` hides "+ Add Project" for Manual Entry, since you
  // can't add a project to an already-closed entry.
  const renderAllocationTracker = (allocs, setAllocs, source, allowAdd) => {
    const totalAllocatedHours = allocs.reduce((sum, a) => sum + Number(a.allocated_hours || 0), 0);
    return (
    <div className="mb-6 space-y-3">
      {allocs.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Allocated</span>
          <span className={`text-xs font-bold ${totalAllocatedHours > STANDARD_WORKDAY_HOURS ? 'text-amber-600' : 'text-slate-600'}`}>
            {fmtHours(totalAllocatedHours)} of {fmtHours(STANDARD_WORKDAY_HOURS)}
          </span>
        </div>
      )}
      {allocs.map((a) => {
        const isActive = a.status === 'ACTIVE';
        const isCompleted = a.status === 'COMPLETED';
        const accumulated = Number(a.accumulated_hours || 0);
        const liveElapsedHrs = isActive && a.started_at ? (nowTick - new Date(a.started_at).getTime()) / 3600000 : 0;
        const trackedHrs = accumulated + liveElapsedHrs;
        const pct = isCompleted ? 100 : Math.min(100, Math.round((trackedHrs / Math.max(a.allocated_hours, 0.01)) * 100));
        const overBudget = isActive && trackedHrs >= a.allocated_hours;
        const isPaused = !isActive && !isCompleted && accumulated > 0;
        return (
          <div key={a.allocation_id}
            className={`rounded-2xl border p-4 ${isActive ? 'border-blue-300 bg-blue-50/40' : isCompleted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className={`text-sm font-semibold ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {projectLabel(a.project_code, projects)}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  isActive ? (overBudget ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')
                  : isCompleted ? 'bg-slate-200 text-slate-500' : isPaused ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {isActive ? (overBudget ? 'Time up' : 'Active') : isCompleted ? 'Completed' : isPaused ? 'Paused' : 'Pending'}
                </span>
                <button type="button" title={isCompleted ? 'Correct actual hours' : 'Edit'}
                  onClick={() => {
                    setModalAllocId(a.allocation_id);
                    setModalSource(source);
                    if (isCompleted) {
                      setModalMode('corrected');
                      setModalHoursVal(String(a.corrected_hours ?? a.accumulated_hours ?? a.allocated_hours));
                    } else {
                      setModalMode('allocated');
                      setModalHoursVal(String(a.allocated_hours));
                    }
                  }}
                  className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                {allocs.length > 1 && (
                  <button type="button" title="Delete project" onClick={() => handleDeleteAllocation(a.allocation_id, source, allocs)}
                    className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 transition">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {!isCompleted && (
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-amber-500' : isPaused ? 'bg-indigo-400' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
              </div>
            )}

            <span className="text-xs text-slate-500">
              {isCompleted
                ? (a.corrected_hours != null
                  ? <>{fmtHours(a.corrected_hours)} actual <span className="text-slate-400">(system recorded {fmtHours(a.accumulated_hours)})</span></>
                  : `${fmtHours(a.accumulated_hours)} actual`)
                : <>{(isActive || isPaused) ? `${fmtHours(trackedHrs)} tracked of ` : ''}{fmtHours(a.allocated_hours)} planned{isPaused && ' (paused)'}</>}
              {a.edited_after_completion && <span className="ml-1.5 text-amber-600">· plan edited after completion</span>}
            </span>
          </div>
        );
      })}

      {!allowAdd ? null : addProjectOpen ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-4">
          <ProjectSearchSelect value={addProjectCode} onChange={setAddProjectCode}
            projects={projects.filter((p) => !allocs.some((a) => a.project_code === p.project_code))}
            placeholder="Search or select a project…" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleAddProject} disabled={!addProjectCode || addProjectBusy}
              className="flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: '#0c3b8f' }}>
              {addProjectBusy ? 'Adding…' : 'Add Project'}
            </button>
            <button type="button" onClick={() => { setAddProjectOpen(false); setAddProjectCode(''); }}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAddProjectOpen(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-[#0c3b8f] hover:bg-slate-50">
          + Add Project
        </button>
      )}

      {modalAllocId && modalSource === source && (() => {
        const modalAlloc = allocs.find((a) => a.allocation_id === modalAllocId);
        if (!modalAlloc) return null;
        const isActive = modalAlloc.status === 'ACTIVE';
        const isCompletedModal = modalAlloc.status === 'COMPLETED';
        const modalAccumulated = Number(modalAlloc.accumulated_hours || 0);
        const modalIsPaused = !isActive && !isCompletedModal && modalAccumulated > 0;
        const modalLiveElapsedHrs = isActive && modalAlloc.started_at ? (nowTick - new Date(modalAlloc.started_at).getTime()) / 3600000 : 0;
        const modalTrackedHrs = modalAccumulated + modalLiveElapsedHrs;
        const stepHours = (delta) => {
          const current = parseFloat(modalHoursVal) || 0;
          setModalHoursVal(String(Math.max(0.1, Math.round((current + delta) * 100) / 100)));
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4" onClick={() => setModalAllocId(null)}>
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setModalAllocId(null)} aria-label="Close"
                className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Header — surfaces the same status/progress context the card behind shows, since the modal covers it */}
              <div className="flex items-center gap-2 mb-1.5 pr-8">
                <p className="text-lg font-semibold text-slate-900">{isCompletedModal ? 'Correct Actual Hours' : 'Edit Allocation'}</p>
                <span className={`flex-shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-blue-100 text-blue-700' : isCompletedModal ? 'bg-slate-200 text-slate-500' : modalIsPaused ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {isActive ? 'Active' : isCompletedModal ? 'Completed' : modalIsPaused ? 'Paused' : 'Pending'}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-700">{projectLabel(modalAlloc.project_code, projects)}</p>
              {isCompletedModal ? (
                <p className="text-[11px] text-slate-400 mt-1 mb-8">
                  System recorded {fmtHours(modalAlloc.accumulated_hours)}
                  {modalAlloc.corrected_hours != null && <> · corrected to {fmtHours(modalAlloc.corrected_hours)}</>}
                </p>
              ) : (isActive || modalIsPaused) ? (
                <p className="text-[11px] text-slate-400 mt-1 mb-8">
                  {fmtHours(modalTrackedHrs)} tracked so far of {fmtHours(modalAlloc.allocated_hours)} planned{modalIsPaused ? ' (paused)' : ''}
                </p>
              ) : (
                <div className="mb-8" />
              )}

              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {isCompletedModal ? 'Actual Hours Worked' : 'Allocated Hours'}
              </label>
              <div className="flex items-center gap-2 mb-6">
                <button type="button" onClick={() => stepHours(-0.1)}
                  className="flex-shrink-0 w-11 h-11 rounded-xl border-2 border-[#D1D5DB] text-slate-600 text-lg font-semibold hover:bg-slate-50 transition">−</button>
                <input type="number" min="0.1" step="0.1" autoFocus value={modalHoursVal} placeholder="e.g. 2.5"
                  onChange={(e) => setModalHoursVal(e.target.value)}
                  className="w-full min-w-0 rounded-xl border-2 border-[#D1D5DB] px-4 py-3 text-sm text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <button type="button" onClick={() => stepHours(0.1)}
                  className="flex-shrink-0 w-11 h-11 rounded-xl border-2 border-[#D1D5DB] text-slate-600 text-lg font-semibold hover:bg-slate-50 transition">+</button>
              </div>

              <button type="button" onClick={handleSaveEditHours}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition" style={{ background: '#0c3b8f' }}>
                Confirm
              </button>
              {isCompletedModal ? (
                source === 'live' && (
                  <button type="button" onClick={handleReopen}
                    className="w-full mt-3 py-1 text-sm font-semibold text-[#0c3b8f] hover:underline text-center transition">
                    Reopen — I'm still working on this
                  </button>
                )
              ) : (
                <button type="button" onClick={handleModalMarkComplete}
                  className="w-full mt-3 py-1 text-sm font-semibold text-[#0c3b8f] hover:underline text-center transition">
                  Mark as Completed
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
    );
  };
  const allocationTracker = renderAllocationTracker(allocations, setAllocations, 'live', true);
  const manualAllocationTracker = manualAllocations.length > 0
    ? renderAllocationTracker(manualAllocations, setManualAllocations, 'manual', false)
    : null;

  return (
    <div className="p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white' : 'bg-slate-900 border-slate-950 text-white'
          }`}>
            {toast.text}
          </div>
        </div>
      )}

      <div className="mb-10 flex items-start gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Attendance</h1>
          <p className="mt-2 text-sm text-slate-500">Clock in/out live, or manually enter your actual times for project or general work.</p>
        </div>
        <button type="button" onClick={() => setShowHelp((v) => !v)} title="How it works"
          className="mt-3 flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-slate-300 text-slate-500 text-sm font-bold hover:bg-slate-100 transition">
          ?
        </button>
      </div>

      {/* Right column is always present on desktop — This Week stats + a Recent Entries preview
          give the page a permanent, useful home instead of empty space beside the (comparatively
          narrow) Log Time card. Stacks below it on mobile/tablet. */}
      <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,42rem)_26rem]">
        {/* Log Time card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {/* Segment tabs */}
          <div className="mb-6 flex gap-2 rounded-2xl bg-slate-100 p-1">
            <button type="button" onClick={() => setLogTab('clock')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${logTab === 'clock' ? 'bg-white shadow-sm text-[#0c3b8f]' : 'text-slate-500'}`}>
              Clock In/Out
            </button>
            <button type="button" onClick={openManualTab}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${logTab === 'manual' ? 'bg-white shadow-sm text-[#0c3b8f]' : 'text-slate-500'}`}>
              Manual Entry
            </button>
          </div>

          {logTab === 'clock' ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${clockedIn ? 'bg-green-500' : 'bg-slate-300'}`} />
                <span className={`text-sm font-semibold ${clockedIn ? 'text-green-700' : 'text-slate-500'}`}>
                  {clockedIn ? 'Active session' : 'Not clocked in'}
                </span>
              </div>

              {!clockedIn && projectSetupUI}

              {!clockedIn && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                  <textarea rows={2} value={clockRemark} onChange={(e) => setClockRemark(e.target.value)}
                    placeholder="Add notes or specific tasks (optional)"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {clockedIn && allocationTracker}

              {clockedIn && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                  <textarea rows={2} value={clockRemark} onChange={(e) => setClockRemark(e.target.value)}
                    placeholder="Add notes or specific tasks (optional)"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {!clockedIn ? (
                  <button onClick={handleClockIn} disabled={loading}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
                    style={{ background: '#0c3b8f' }}>
                    {loading ? 'Please wait…' : 'Clock In'}
                  </button>
                ) : (
                  <button onClick={handleClockOut} disabled={loading}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                    {loading ? 'Please wait…' : 'Clock Out'}
                  </button>
                )}
            </>
          ) : closingActiveEntry ? (
            // Already has a real live session open — Manual Entry has nothing left to "clock in"
            // for, so it goes straight to closing that session with an editable End Time instead
            // of offering to start a second, duplicate entry for the day.
            <form onSubmit={submitActiveSessionClockOut} noValidate>
              <div className="mb-6 flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-green-700">Active session</span>
              </div>

              {allocationTracker}

              <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                  <input type="date" value={manualClockOutDate} max={todayISO} onChange={(e) => { setManualClockOutDate(e.target.value); setManualClockOutTouched(true); }}
                    className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    End Time <span className="font-normal text-slate-400">(when you actually clocked off)</span>
                  </label>
                  <input type="time" value={manualClockOutTime} onChange={(e) => { setManualClockOutTime(e.target.value); setManualClockOutTouched(true); }}
                    className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button type="submit" disabled={manualSubmitting || !manualClockOutTime}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                {manualSubmitting ? 'Please wait…' : 'Clock Out'}
              </button>
            </form>
          ) : (
            <form onSubmit={manualStep === 'start' ? handleManualClockInStep : handleManualClockOutStep} noValidate>
              {manualStep === 'start' ? (
                <>
                  {manualProjectSetupUI}
                  <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
                      <input type="date" value={manualClockInDate} max={todayISO} onChange={(e) => setManualClockInDate(e.target.value)}
                        className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Start Time</label>
                      <input type="time" value={manualClockInTime} onChange={(e) => { setManualClockInTime(e.target.value); setManualClockInTouched(true); }}
                        className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  {isPastManualEntry && (
                    <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="min-w-0">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                        <input type="date" value={manualClockOutDate} max={manualEndDateMax} onChange={(e) => { setManualClockOutDate(e.target.value); setManualClockOutTouched(true); }}
                          className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">End Time</label>
                        <input type="time" value={manualClockOutTime} onChange={(e) => { setManualClockOutTime(e.target.value); setManualClockOutTouched(true); }}
                          className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  )}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                    <textarea rows={2} value={manualRemark} onChange={(e) => setManualRemark(e.target.value)}
                      placeholder="Add notes or specific tasks (optional)"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button type="submit" disabled={manualSubmitting || !manualClockInTime}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
                    style={{ background: '#0c3b8f' }}>
                    {manualSubmitting ? 'Please wait…' : (isPastManualEntry ? 'Submit' : 'Clock In')}
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-sm font-semibold text-green-700">Active session</span>
                  </div>

                  <div className="mb-5 space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Allocated</span>
                      <span className="text-xs font-bold text-slate-600">
                        {fmtHours(manualProjectRows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0))} of {fmtHours(STANDARD_WORKDAY_HOURS)}
                      </span>
                    </div>
                    {manualProjectRows.map((r, i) => (
                      <div key={i} className="rounded-2xl border border-blue-300 bg-blue-50/40 p-4 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800">{projectLabel(r.code, projects)}</span>
                        <span className="text-xs text-slate-500">{fmtHours(parseFloat(r.hours) || 0)} planned</span>
                      </div>
                    ))}
                  </div>

                  <div className="mb-5 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Clocked in {new Date(`${manualClockInDate}T${manualClockInTime}:00`).toLocaleDateString('en-SG', { day: '2-digit', month: '2-digit', year: 'numeric' })} at {fmtTimeSGT(combineDateTime(manualClockInDate, manualClockInTime))}
                    </p>
                    <button type="button" onClick={() => setManualStep('start')} className="flex-shrink-0 text-xs font-semibold text-[#0c3b8f] hover:underline">
                      Edit
                    </button>
                  </div>
                  <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                      <input type="date" value={manualClockOutDate} max={todayISO} onChange={(e) => { setManualClockOutDate(e.target.value); setManualClockOutTouched(true); }}
                        className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        End Time <span className="font-normal text-slate-400">(when you actually clocked off)</span>
                      </label>
                      <input type="time" value={manualClockOutTime} onChange={(e) => { setManualClockOutTime(e.target.value); setManualClockOutTouched(true); }}
                        className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <button type="submit" disabled={manualSubmitting || !manualClockOutTime}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                    {manualSubmitting ? 'Please wait…' : 'Clock Out'}
                  </button>
                </>
              )}

              {dayConflictEntries && (() => {
                const isToday = manualClockInDate === todayISOStr();
                return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4" onClick={() => setDayConflictEntries(null)}>
                  <div className="relative inline-block max-w-[90vw] rounded-3xl bg-white px-8 pt-6 pb-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end mb-2 -mr-4">
                      <button type="button" onClick={() => setDayConflictEntries(null)} aria-label="Close"
                        className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-lg font-semibold text-slate-900 mb-5 text-left whitespace-nowrap">
                      You've already {isToday ? 'clocked in today' : 'clocked in on this date'}
                    </p>
                    <div className="mb-5 space-y-4">
                      {dayConflictEntries.map((entry) => (
                        <ul key={entry.attendance_id} className="text-sm text-slate-600 list-disc list-inside space-y-1">
                          <li>Time : {fmtTimeSGT(entry.clock_in_time)} – {entry.clock_out_time ? fmtTimeSGT(entry.clock_out_time) : 'still active'}</li>
                          <li>Date : {fmtSlashDate(manualClockInDate)}</li>
                        </ul>
                      ))}
                    </div>
                    <p className="text-sm text-slate-500 mb-6 text-left">Do you want to log in again?</p>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setDayConflictEntries(null)}
                        className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                        Cancel
                      </button>
                      <button type="button" onClick={() => {
                        setDayConflictEntries(null);
                        if (isPastManualEntry) submitManualEntry(); else setManualStep('end');
                      }} disabled={manualSubmitting}
                        className="flex-1 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                        {manualSubmitting ? 'Please wait…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
                );
              })()}

              {overlapEntry && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4" onClick={() => setOverlapEntry(null)}>
                  <div className="relative inline-block max-w-[90vw] rounded-3xl bg-white px-8 pt-6 pb-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end mb-2 -mr-4">
                      <button type="button" onClick={() => setOverlapEntry(null)} aria-label="Close"
                        className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-lg font-semibold text-slate-900 mb-5 text-left whitespace-nowrap">
                      This overlaps an entry you've logged
                    </p>
                    <div className="mb-5 space-y-4">
                      <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                        <li>Time : {fmtTimeSGT(overlapEntry.clock_in_time)} – {overlapEntry.clock_out_time ? fmtTimeSGT(overlapEntry.clock_out_time) : 'still active'}</li>
                        <li>Date : {fmtSlashDate(manualClockInDate)}</li>
                      </ul>
                    </div>
                    <p className="text-sm text-slate-500 mb-6 text-left">You can't log a new entry over time already recorded. Edit that entry's times instead?</p>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setOverlapEntry(null)}
                        className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                        Cancel
                      </button>
                      <button type="button" onClick={() => openEditEntry(overlapEntry)}
                        className="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition" style={{ background: '#0c3b8f' }}>
                        Edit Existing Entry
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}

          {editingEntry && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4" onClick={() => setEditingEntry(null)}>
              <form onSubmit={submitEditTimes} noValidate className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setEditingEntry(null)} aria-label="Close"
                  className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <p className="text-lg font-semibold text-slate-900 mb-1 pr-8">Edit Entry</p>
                <p className="text-xs text-slate-400 mb-6">Correcting the clock-in/out times for this entry.</p>
                <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Start Date</label>
                    <input type="date" value={editStartDate} max={todayISO} onChange={(e) => setEditStartDate(e.target.value)}
                      className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Start Time</label>
                    <input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)}
                      className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                    <input type="date" value={editEndDate} max={todayISO} onChange={(e) => setEditEndDate(e.target.value)}
                      className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">End Time</label>
                    <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)}
                      className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <button type="submit" disabled={editSubmitting}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                  {editSubmitting ? 'Please wait…' : 'Save Changes'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right column: This Week stats + a Recent Entries preview, with a link into the full,
            filterable History panel below. */}
        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-4">This week</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-400 mb-1">Hours logged</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{fmtHours(weekStats.hours)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-400 mb-1">Days worked</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{weekStats.days}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Recent entries</p>
              <button type="button" onClick={openHistory} className="text-xs font-semibold text-[#0c3b8f] hover:underline">View all</button>
            </div>
            {pastSessionsLoading ? (
              <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
            ) : recentEntries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No attendance logged yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentEntries.map((s) => (
                  <div key={s.attendance_id} className="rounded-2xl border border-slate-200 px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{fmtSlashDate(s.day)}</p>
                      <p className="text-[11px] text-slate-500">{fmtTimeSGT(s.clock_in_time)} – {s.clock_out_time ? fmtTimeSGT(s.clock_out_time) : 'still active'}</p>
                    </div>
                    <button type="button" onClick={() => openEditEntry(s)} aria-label="Edit entry"
                      className="flex-shrink-0 w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center transition">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4" onClick={() => setShowHelp(false)}>
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setShowHelp(false)} aria-label="Close"
              className="absolute top-6 right-6 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-4">How It Works</p>
            <ul className="space-y-4 text-sm text-slate-600">
              {[
                { n: '1', t: 'Pick project or general', d: 'Choose the project you are working on, or "General" for non-project work.' },
                { n: '2', t: 'Add a remark', d: 'Optionally note what you worked on — helps your manager review your attendance report.' },
                { n: '3', t: 'Clock In or log manually', d: 'Clock in/out live, or use Manual Entry if you forgot to clock in for a shift.' },
                { n: '4', t: 'Reviewed by your manager', d: 'Your total hours, overtime, and remarks appear in your manager\'s attendance report.' },
                { n: '5', t: 'Clock-in & "still working?" reminders', d: 'A reminder appears hourly if you haven\'t clocked in by 8:30am on a weekday (staff aren\'t expected to clock in at 8:30am on weekends, so this reminder doesn\'t apply then). Once clocked in — any day, including weekends — you\'ll be asked to confirm you\'re still working periodically, and auto clocked-out after 4 hours since your last check-in if you miss it. Only the forced auto clock-out pauses over lunch (12–2pm); the reminder itself keeps checking in as usual.' },
              ].map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-[#EEF4FF] text-[#1a3a8f] text-xs font-bold">{s.n}</span>
                  <div>
                    <p className="font-semibold text-slate-800">{s.t}</p>
                    <p className="text-slate-500 mt-0.5">{s.d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-slate-400">Your attendance data is synced in real-time across the web portal and the Nextan mobile app.</p>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4" onClick={() => { setHistoryOpen(false); setCalendarOpen(false); }}>
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-bold text-slate-900">Attendance history</p>
              <button type="button" onClick={() => { setHistoryOpen(false); setCalendarOpen(false); }} aria-label="Close"
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 mb-4 relative">
              <div className="flex gap-1.5 flex-wrap">
                {[{ k: 'all', l: 'All' }, { k: 'week', l: 'This week' }, { k: 'month', l: 'This month' }].map((p) => (
                  <button key={p.k} type="button"
                    onClick={() => { setHistoryPill(p.k); setHistoryDate(null); setHistoryVisibleCount(10); }}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                      !historyDate && historyPill === p.k ? 'text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    style={!historyDate && historyPill === p.k ? { background: '#0c3b8f' } : undefined}>
                    {p.l}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setCalendarOpen((v) => !v)}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition whitespace-nowrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Filter by date
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {calendarOpen && (
                <div className="absolute top-10 right-0 z-10 bg-white border border-slate-200 rounded-2xl shadow-xl p-3.5 w-60">
                  <div className="flex items-center justify-between mb-2.5">
                    <button type="button" onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="text-slate-400 hover:text-slate-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <p className="text-xs font-semibold text-slate-900">{calendarMonth.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}</p>
                    <button type="button" onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="text-slate-400 hover:text-slate-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-[10px] text-slate-400 text-center mb-1">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-xs text-center text-slate-700">
                    {calendarDays.map((d, i) => {
                      if (!d) return <span key={i} />;
                      const iso = toISODateStr(d);
                      const isFuture = iso > todayISOStr();
                      const isSelected = historyDate === iso;
                      return (
                        <button key={i} type="button" disabled={isFuture}
                          onClick={() => { setHistoryDate(iso); setHistoryVisibleCount(10); setCalendarOpen(false); }}
                          className={`py-1 rounded-full transition ${isSelected ? 'text-white font-semibold' : isFuture ? 'text-slate-300' : 'hover:bg-slate-100'}`}
                          style={isSelected ? { background: '#0c3b8f' } : undefined}>
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {pastSessionsLoading ? (
              <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
            ) : filteredHistoryEntries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No attendance logged in this period.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredHistoryEntries.slice(0, historyVisibleCount).map((s) => (
                  <div key={s.attendance_id} className="rounded-2xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 mb-1">{fmtSlashDate(s.day)}</p>
                      <p className="text-xs text-slate-500 mb-2">{fmtTimeSGT(s.clock_in_time)} – {s.clock_out_time ? fmtTimeSGT(s.clock_out_time) : 'still active'} &middot; {fmtHours(sessionTotalHours(s))}</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {(s.allocations || []).map((a, i) => (
                          <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{a.project_code}</span>
                        ))}
                      </div>
                    </div>
                    <button type="button" onClick={() => { setHistoryOpen(false); openEditEntry(s); }} aria-label="Edit entry"
                      className="flex-shrink-0 w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center transition">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {filteredHistoryEntries.length > historyVisibleCount && (
              <button type="button" onClick={() => setHistoryVisibleCount((v) => v + 10)}
                className="w-full mt-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm font-semibold hover:bg-slate-50 transition">
                Load more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

