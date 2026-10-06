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
function ProjectSearchSelect({ value, onChange, projects, placeholder, error, compact }) {
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
        <svg className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${compact ? 'left-2' : 'left-3'}`}
          width={compact ? '12' : '15'} height={compact ? '12' : '15'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={open ? query : (selected ? labelOf(selected) : '')}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          placeholder={placeholder}
          className={compact
            ? `w-full rounded-lg border pl-7 pr-2 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 ${error ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'}`
            : `w-full rounded-xl border pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 ${error ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-blue-500'}`
          }
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

// Kebab menu tucked into a card header for actions that don't need to be always visible —
// "Mark as completed" (General work ends the block outright; named projects log today's
// completion at 100%, same as typing 100 into Progress tracking) and "Delete project", both
// occasional enough not to need their own permanent icon buttons.
function AllocationActionsMenu({ onComplete, completeSubtext, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!onComplete && !onDelete) return null;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" title="More actions" onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-center w-6 h-6 rounded-full transition ${open ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg flex flex-col gap-1">
          {onComplete && (
            <button type="button" onClick={() => { setOpen(false); onComplete(); }}
              className="flex w-full items-start gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-left hover:bg-emerald-100 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-emerald-800">
                <circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" />
              </svg>
              <span>
                <span className="block text-xs font-semibold text-emerald-800">Mark as completed</span>
                <span className="block text-[11px] text-emerald-700 mt-0.5">{completeSubtext}</span>
              </span>
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => { setOpen(false); onDelete(); }}
              className="flex w-full items-start gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-left hover:bg-red-100 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-red-800">
                <path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
              </svg>
              <span>
                <span className="block text-xs font-semibold text-red-800">Delete project</span>
                <span className="block text-[11px] text-red-700 mt-0.5">Re-splits remaining time across the rest</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Small round pencil affordance next to any field that can be edited in place — used for
// Project, Budget/Hours, and Progress Tracking, so each editable area is marked consistently.
function EditIconButton({ onClick, title }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

// Paired confirm (check) / cancel (x) buttons shown while a field is being edited in place.
function InlineConfirmCancel({ onConfirm, onCancel }) {
  return (
    <>
      <button type="button" title="Save" onClick={onConfirm}
        className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-[#0c3b8f] text-white hover:bg-[#0a2f70] transition">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </button>
      <button type="button" title="Cancel" onClick={onCancel}
        className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 transition">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </>
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
  // Each allocation card carries its own description (see renderAllocationTracker) — required
  // for General (no project name to explain what was done), optional for a named project. This
  // just tracks whether the staff member has attempted to clock out with General's left blank.
  const [clockDescriptionValidated, setClockDescriptionValidated] = useState(false);
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
  const [projectRows, setProjectRows] = useState([{ code: GENERAL, hours: '' }]);
  const [projectRowsValidated, setProjectRowsValidated] = useState(false);

  // Active session allocation tracking (after clocking in)
  const [allocations, setAllocations] = useState([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addProjectCode, setAddProjectCode] = useState('');
  const [addProjectBusy, setAddProjectBusy] = useState(false);
  // Inline editing — one edit icon per card puts every editable area (project, hours, progress)
  // into an editable state at once, right where it's displayed, rather than through a popup.
  // `editingCardId` names the allocation currently in edit mode; each field's own draft holds its
  // in-progress value until the card-level Save/Cancel commits or discards all of them together.
  // Lets a blocked Clock Out scroll to and flash the specific FIELD that's missing (the
  // progress input or the description box), instead of ringing the whole card or leaving the
  // person to guess which one the toast is talking about.
  const cardRefs = useRef(new Map());
  const [highlightTarget, setHighlightTarget] = useState(null); // { allocationId, field: 'progress' | 'description' }
  const highlightTimeoutRef = useRef(null);
  const focusAllocationCard = (allocationId, field) => {
    const el = cardRefs.current.get(allocationId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightTarget({ allocationId, field });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightTarget(null), 3000);
  };

  const [editingCardId, setEditingCardId] = useState(null);
  const [projectDraft, setProjectDraft] = useState(GENERAL);
  const [hoursDraft, setHoursDraft] = useState('');
  // Progress's own edit toggle — independent of editingCardId, since once a percentage has been
  // logged it's shown as a value (not a perpetual "add more" input) with its own edit icon.
  const [editingProgressId, setEditingProgressId] = useState(null);
  const [progressEditDraft, setProgressEditDraft] = useState('');
  // Briefly shows a "Saved" confirmation next to Description right after an autosave succeeds.
  const [descriptionSavedId, setDescriptionSavedId] = useState(null);
  const notifiedRef = useRef(new Set());
  const descriptionSavedTimeoutRef = useRef(null);

  // Real progress-log data (completion %), keyed by project code — same data the Progress page
  // reads/writes, so a % logged from the Attendance card shows up there too and vice versa.
  const [progressHistory, setProgressHistory] = useState([]);
  const [progressInputs, setProgressInputs] = useState({}); // allocation_id -> draft input string
  const [progressSubmitting, setProgressSubmitting] = useState({}); // allocation_id -> bool

  // Manual entry state — a single-shot, already-finished block of work. Submitting never opens
  // a live session: the end time is derived as the entered start time plus however many hours
  // are allocated across the chosen projects, and the whole thing is recorded as done at once.
  const [manualClockInDate, setManualClockInDate] = useState(() => todayISOStr());
  const [manualClockInTime, setManualClockInTime] = useState(() => nowHHMM());
  const [manualRemark, setManualRemark] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualDescriptionValidated, setManualDescriptionValidated] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);


  const todayISO = todayISOStr();

  // Combine a "YYYY-MM-DD" date with a "HH:MM" time input into a full datetime string with an
  // explicit Singapore offset (+08:00, no DST) — without it, the naive string's timezone is
  // ambiguous between the browser, the backend's validation check, and Postgres's own cast,
  // and those can disagree about which instant it actually represents.
  const combineDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    return `${dateStr}T${timeStr}:00+08:00`;
  };

  // Distinguishes *why* an end comes before a start — picking an End Date earlier than the
  // Start Date is a different mistake (and a different fix) than picking an End Time earlier
  // than the Start Time on the same day, so each gets its own message and its own field
  // highlighted red, instead of one generic "end must be after start" pointing at nothing.
  const dateTimeOrderError = (startDate, startTime, endDate, endTime) => {
    if (endDate < startDate) return 'date';
    if (endDate === startDate) {
      const start = new Date(combineDateTime(startDate, startTime));
      const end = new Date(combineDateTime(endDate, endTime));
      if (end <= start) return 'time';
    }
    return null;
  };

  // Refresh the manual entry date/time to "now" whenever the fields are still at their
  // untouched defaults — so switching to the tab later in the day shows current time,
  // without clobbering a date/time the user already deliberately picked.
  const openManualTab = () => {
    setLogTab('manual');
    if (clockedIn) {
      // A live session (started from either tab) is already open — Manual Entry renders
      // straight into closing it, so just seed a sensible "right now" End Time to edit,
      // unless they already edited it.
      if (!manualClockOutTouched) {
        setManualClockOutDate(todayISOStr());
        setManualClockOutTime(nowHHMM());
      }
      return;
    }
    setManualClockInDate((d) => d || todayISOStr());
    setManualClockInTime((t) => t || nowHHMM());
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
          // Merge rather than replace: this fires every 20s (and on window focus) while the
          // user may be mid-typing a description that hasn't gone through onBlur's PATCH yet.
          // Blindly overwriting with the server's still-stale value would silently blank out
          // what they just typed — including right before a Clock Out, where the field could
          // still show their text on screen while the (reverted) state behind it reads empty.
          setAllocations((prev) => {
            const prevById = new Map(prev.map((a) => [a.allocation_id, a]));
            return (active.allocations || []).map((a) => {
              const prevA = prevById.get(a.allocation_id);
              return prevA && (prevA.description || '').trim() ? { ...a, description: prevA.description } : a;
            });
          });
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
    fetchProgressHistory();
  }, [user?.user_id]);

  const fetchProgressHistory = () => {
    if (!user?.user_id) return;
    axios.get(`${API_BASE}/api/v1/projects/progress-history/${user.user_id}`)
      .then((r) => setProgressHistory(r.data?.data || [])).catch(() => {});
  };

  // Latest logged progress entry for a project — same lookup the Progress page uses.
  const getLatestProgressLog = (code) => progressHistory.find((h) => h.project_code === code) || null;
  const getLatestProgressPct = (code) => {
    const log = getLatestProgressLog(code);
    return log ? Math.min(100, Math.max(0, Number(log.completion_percentage || 0))) : 0;
  };
  // System-generated baseline entries (from the daily-progress-baseline job) can't be edited —
  // matches the same rule the backend enforces.
  const isAutoProgressEntry = (log) => String(log?.progress_summary || '').startsWith('Auto-progress baseline');

  // Corrects the absolute completion % of the last logged entry, instead of adding to it — same
  // semantics as editing an entry on the Progress page.
  const saveEditProgress = async (allocationId, projectCode) => {
    const log = getLatestProgressLog(projectCode);
    if (!log || !user?.user_id) return;
    if (!String(progressEditDraft).trim()) return; // left blank — nothing to change
    const pct = parseFloat(progressEditDraft);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast('Enter a value between 0 and 100.', 'error');
      return;
    }
    if (pct === getLatestProgressPct(projectCode)) return;
    try {
      await axios.patch(`${API_BASE}/api/v1/projects/progress-log/${log.log_id}`, {
        userId: user.user_id, completionPercentage: pct,
      });
      fetchProgressHistory();
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to update progress.', 'error');
    }
  };

  // Sets completion straight to 100%, whether or not a log already exists for today — a
  // shortcut so finishing a task doesn't require computing/typing the exact remaining %.
  const markAsCompleted = async (allocationId, projectCode) => {
    const log = getLatestProgressLog(projectCode);
    setProgressSubmitting((prev) => ({ ...prev, [allocationId]: true }));
    try {
      if (log) {
        await axios.patch(`${API_BASE}/api/v1/projects/progress-log/${log.log_id}`, {
          userId: user.user_id, completionPercentage: 100,
        });
      } else {
        await axios.post(`${API_BASE}/api/v1/projects/progress-log`, {
          projectCode, reporterId: user.user_id, completionPercentage: 100,
        });
      }
      fetchProgressHistory();
      showToast('Marked as completed.', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to mark as completed.', 'error');
    } finally {
      setProgressSubmitting((prev) => ({ ...prev, [allocationId]: false }));
    }
  };

  const submitProgressUpdate = async (allocationId, projectCode) => {
    const raw = progressInputs[allocationId];
    const pct = parseFloat(raw);
    const current = getLatestProgressPct(projectCode);
    const cap = Math.max(0.1, 100 - current);
    if (!raw || isNaN(pct) || pct <= 0 || pct > cap) {
      showToast(`Enter a valid amount to add (0–${cap.toFixed(0)}%).`, 'error');
      return;
    }
    setProgressSubmitting((prev) => ({ ...prev, [allocationId]: true }));
    try {
      await axios.post(`${API_BASE}/api/v1/projects/progress-log`, {
        projectCode, reporterId: user.user_id, completionPercentage: pct,
      });
      setProgressInputs((prev) => ({ ...prev, [allocationId]: '' }));
      fetchProgressHistory();
      showToast('Progress logged.', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to log progress.', 'error');
    } finally {
      setProgressSubmitting((prev) => ({ ...prev, [allocationId]: false }));
    }
  };

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

  // Recent Entries card — quick pill filters and a specific-date picker, right on the card.
  const [historyPill, setHistoryPill] = useState('all'); // 'all' | 'week' | 'month'
  const [historyDate, setHistoryDate] = useState(null); // overrides the pill when set
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  // Public holidays are managed by HR (Calendar page) and shared across every portal — keyed by
  // "YYYY-MM-DD" here for a quick lookup while rendering the calendar grid below.
  const [publicHolidays, setPublicHolidays] = useState({});
  useEffect(() => {
    axios.get(`${API_BASE}/api/v1/public-holidays`)
      .then((r) => {
        const map = {};
        (r.data?.data || []).forEach((h) => { map[h.holiday_date] = h.name; });
        setPublicHolidays(map);
      })
      .catch(() => {});
  }, []);

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

  const addProjectRow = () => {
    setProjectRowsValidated(false);
    setProjectRows((prev) => (prev.length >= 8 ? prev : [...prev, { code: '', hours: '' }]));
  };

  const removeProjectRow = (index) => {
    setProjectRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleClockIn = async () => {
    if (!user?.user_id) return;
    if (projectRows.some((r) => !r.code)) { setProjectRowsValidated(true); return; }
    if (projectRows.some((r) => !(parseFloat(r.hours) > 0))) { setProjectRowsValidated(true); showMsg('Please enter valid hours for every project.', 'error'); return; }
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

  // Saves one allocation's description as soon as its field loses focus — independent of hours
  // edits, and independent of the other project blocks on the same session.
  const saveAllocationDescription = async (allocationId, value) => {
    if (!user?.user_id) return false;
    // One retry on transient failures (no response at all, or a 5xx) before giving up — we've
    // seen brief cold-start/auth blips on the backend cause a single attempt to fail even though
    // the field's contents were fine. A real validation error (4xx with a response) isn't retried.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await axios.patch(`${API_BASE}/api/v1/attendance/allocations/${allocationId}`, {
          userId: user.user_id, description: value,
        });
        setDescriptionSavedId(allocationId);
        if (descriptionSavedTimeoutRef.current) clearTimeout(descriptionSavedTimeoutRef.current);
        descriptionSavedTimeoutRef.current = setTimeout(() => setDescriptionSavedId(null), 2500);
        return true;
      } catch (e) {
        const transient = !e.response || e.response.status >= 500;
        if (transient && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        showToast(e.response?.data?.error || 'Failed to save description.', 'error');
        return false;
      }
    }
    return false;
  };

  const handleClockOut = async () => {
    if (!attendanceId || !user?.user_id) return;
    const generalAlloc = allocations.find((a) => !a.project_code);
    if (generalAlloc && !(generalAlloc.description || '').trim()) {
      setClockDescriptionValidated(true);
      focusAllocationCard(generalAlloc.allocation_id, 'description');
      showMsg('Add a description for your General work before clocking out.', 'error');
      return;
    }

    // Every named-project block worked on today needs its own completion-% entry logged today
    // before clocking out — staff record what they finished as part of ending the session, using
    // the "Add new completion percentage" input already on that project's card. An auto-generated
    // baseline entry doesn't count — it isn't the staff member's own report.
    const todayISO = todayISOStr();
    const missingProgress = allocations.find((a) => {
      if (!a.project_code) return false;
      if (getLatestProgressPct(a.project_code) >= 100) return false;
      return !progressHistory.some((h) =>
        h.project_code === a.project_code && sgtDateStr(h.logged_at) === todayISO && !isAutoProgressEntry(h)
      );
    });
    if (missingProgress) {
      focusAllocationCard(missingProgress.allocation_id, 'progress');
      showMsg(`Add today's completion % for ${projectLabel(missingProgress.project_code, projects)} before clocking out.`, 'error');
      return;
    }

    // Guarantee the backend sees General's latest text even if the field's onBlur save hasn't
    // resolved yet — awaiting it here beats racing an unsaved PATCH against the clock-out call.
    // If the save itself fails, stop here with a clear error instead of letting the clock-out
    // call go through and bounce back with a confusing "description is required" — the field
    // isn't actually empty, the save to the backend just didn't happen.
    if (generalAlloc) {
      const saved = await saveAllocationDescription(generalAlloc.allocation_id, generalAlloc.description);
      if (!saved) { showMsg('Could not save your description — check your connection and try again.', 'error'); return; }
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, {
        userId: user.user_id, attendanceId,
      });
      setClockedIn(false); setAttendanceId(null); setAllocations([]);
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

  const handleReopenAllocation = async (allocationId) => {
    if (!user?.user_id) return;
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/allocations/${allocationId}/reopen`, { userId: user.user_id });
      setAllocations(res.data?.data?.allocations || []);
      notifiedRef.current.delete(allocationId);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to reopen project.', 'error'); }
  };

  // General (non-project) work has no completion % to log, so it's marked done directly —
  // sets the allocation's status to COMPLETED and, if it was the active block, starts the next
  // pending one, same as finishing a named project's progress normally would.
  const handleCompleteAllocation = async (allocationId) => {
    if (!user?.user_id) return;
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/allocations/${allocationId}/complete`, { userId: user.user_id });
      setAllocations(res.data?.data?.allocations || []);
      notifiedRef.current.delete(allocationId);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to mark as completed.', 'error'); }
  };

  // Opens the whole card for editing — project, hours, and (if any) the latest logged progress %
  // all become editable in place at once, prefilled with their current values.
  const startCardEdit = (a) => {
    setEditingCardId(a.allocation_id);
    setProjectDraft(a.project_code || GENERAL);
    setHoursDraft(String(a.status === 'COMPLETED' ? (a.corrected_hours ?? a.accumulated_hours ?? a.allocated_hours) : a.allocated_hours));
    const log = getLatestProgressLog(a.project_code);
    if (log && !isAutoProgressEntry(log)) setProgressEditDraft(String(getLatestProgressPct(a.project_code)));
  };
  const cancelCardEdit = () => setEditingCardId(null);

  const saveEditProject = async (a, setAllocs) => {
    if (!user?.user_id) return;
    const normalizedNewCode = projectDraft === GENERAL ? null : projectDraft;
    if ((a.project_code || null) === normalizedNewCode) return;
    try {
      const res = await axios.patch(`${API_BASE}/api/v1/attendance/allocations/${a.allocation_id}`, {
        userId: user.user_id, projectCode: projectDraft,
      });
      setAllocs((prev) => prev.map((x) => (x.allocation_id === a.allocation_id ? res.data?.data : x)));
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to update project.', 'error'); }
  };

  // Plan (allocated_hours) for an open block, or a correction (corrected_hours) for a completed one.
  const saveEditHours = async (a, setAllocs) => {
    const hrs = parseFloat(hoursDraft);
    if (!user?.user_id || !hrs || hrs <= 0) return;
    const payload = a.status === 'COMPLETED'
      ? { userId: user.user_id, correctedHours: hrs }
      : { userId: user.user_id, allocatedHours: hrs };
    try {
      const res = await axios.patch(`${API_BASE}/api/v1/attendance/allocations/${a.allocation_id}`, payload);
      setAllocs((prev) => prev.map((x) => (x.allocation_id === a.allocation_id ? res.data?.data : x)));
      notifiedRef.current.delete(a.allocation_id);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to update hours.', 'error'); }
  };

  // Commits every editable field on the card in one action, then closes edit mode.
  const saveCardEdit = async (a, setAllocs) => {
    await saveEditProject(a, setAllocs);
    await saveEditHours(a, setAllocs);
    const log = getLatestProgressLog(a.project_code);
    if (log && !isAutoProgressEntry(log)) await saveEditProgress(a.allocation_id, a.project_code);
    setEditingCardId(null);
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
  const [manualProjectRows, setManualProjectRows] = useState([{ code: GENERAL, hours: '' }]);
  const [manualProjectRowsValidated, setManualProjectRowsValidated] = useState(false);
  const [manualClockInTouched, setManualClockInTouched] = useState(false); // true once staff edits Start Time directly
  const [manualClockOutDate, setManualClockOutDate] = useState(() => todayISOStr());
  const [manualClockOutTime, setManualClockOutTime] = useState(() => nowHHMM());
  const [manualClockOutTouched, setManualClockOutTouched] = useState(false); // true once staff edits End Time directly
  const [manualFieldErrors, setManualFieldErrors] = useState([]); // any of 'startDate'|'startTime'|'endDate'|'endTime'
  const [activeFieldErrors, setActiveFieldErrors] = useState([]); // 'endDate'/'endTime' — closing the real active session
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
  const [editFieldErrors, setEditFieldErrors] = useState([]); // any of 'startDate'|'startTime'|'endDate'|'endTime'
  // The entry's projects, editable alongside its times. `null` when the entry's project breakdown
  // isn't available (then only the times are saved, leaving its projects untouched).
  const [editProjectRows, setEditProjectRows] = useState(null);
  const [editRowsValidated, setEditRowsValidated] = useState(false);

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
    setEditFieldErrors([]);
    const full = entry.allocations ? entry : pastSessions.find((s) => s.attendance_id === entry.attendance_id);
    const allocs = full?.allocations;
    setEditProjectRows(Array.isArray(allocs) && allocs.length > 0
      ? allocs.map((a) => ({
          code: !a.project_code || a.project_code === 'General' ? GENERAL : a.project_code,
          hours: Math.round(Number(a.hours || 0) * 100) / 100,
        }))
      : null);
    setEditRowsValidated(false);
  };

  // When the times change, project hours follow the new window (keeping their current
  // proportions) so the entry never ends up with hours that disagree with its start and end.
  const syncEditRowsToWindow = (sd, st, ed, et) => {
    if (!editProjectRows || !sd || !st || !ed || !et) return;
    const windowHours = (new Date(combineDateTime(ed, et)) - new Date(combineDateTime(sd, st))) / 3600000;
    if (!(windowHours > 0)) return;
    setEditProjectRows((prev) => {
      if (!prev) return prev;
      const currentTotal = prev.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
      if (Math.abs(currentTotal - windowHours) < 0.005) return prev;
      return prev.map((r) => {
        const ratio = currentTotal > 0.005 ? (parseFloat(r.hours) || 0) / currentTotal : 1 / prev.length;
        return { ...r, hours: Number((windowHours * ratio).toFixed(2)) };
      });
    });
  };

  const submitEditTimes = async (e) => {
    e.preventDefault();
    if (!editingEntry || !user?.user_id) return;
    const missing = [];
    if (!editStartDate) missing.push('startDate');
    if (!editStartTime) missing.push('startTime');
    if (!editEndDate) missing.push('endDate');
    if (!editEndTime) missing.push('endTime');
    if (missing.length > 0) {
      setEditFieldErrors(missing);
      showToast('Please fill in the highlighted field(s).', 'error');
      return;
    }
    const orderError = dateTimeOrderError(editStartDate, editStartTime, editEndDate, editEndTime);
    if (orderError) {
      setEditFieldErrors([orderError === 'date' ? 'endDate' : 'endTime']);
      showToast(orderError === 'date' ? 'Error with Date Entry — please double check it.' : 'End time must be after the start time.', 'error');
      return;
    }
    const clockInTime = combineDateTime(editStartDate, editStartTime);
    const clockOutTime = combineDateTime(editEndDate, editEndTime);
    if (new Date(clockInTime) > new Date()) {
      setEditFieldErrors(['startDate', 'startTime']);
      showToast('You can\'t select a future date.', 'error'); return;
    }
    let allocationsPayload;
    if (editProjectRows) {
      if (editProjectRows.some((r) => !r.code)) { setEditRowsValidated(true); return; }
      if (editProjectRows.some((r) => !(parseFloat(r.hours) > 0))) {
        setEditRowsValidated(true);
        showToast('Please enter valid hours for every project.', 'error');
        return;
      }
      const windowHours = (new Date(clockOutTime) - new Date(clockInTime)) / 3600000;
      const totalRowHours = editProjectRows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
      if (Math.abs(totalRowHours - windowHours) > 0.05) {
        setEditFieldErrors(['endDate', 'endTime']);
        showToast(`Project hours (${totalRowHours.toFixed(2)}h) don't match the time entered (${windowHours.toFixed(2)}h) — adjust one to match the other.`, 'error');
        return;
      }
      allocationsPayload = editProjectRows.map((r) => ({ projectCode: r.code, hours: parseFloat(r.hours) }));
    }
    setEditFieldErrors([]);
    setEditSubmitting(true);
    try {
      await axios.patch(`${API_BASE}/api/v1/attendance/${editingEntry.attendance_id}/edit-times`, {
        userId: user.user_id, clockInTime, clockOutTime, allocations: allocationsPayload,
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

  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const confirmDeleteEntry = async () => {
    if (!deleteConfirmEntry || !user?.user_id) return;
    setDeleteSubmitting(true);
    try {
      await axios.delete(`${API_BASE}/api/v1/attendance/${deleteConfirmEntry.attendance_id}`, { data: { userId: user.user_id } });
      showToast('Entry deleted.', 'success');
      setDeleteConfirmEntry(null);
      refreshPastSessions();
    } catch (e2) {
      showToast(e2.response?.data?.error || 'Failed to delete entry.', 'error');
    } finally {
      setDeleteSubmitting(false);
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

  // Once staff has set an explicit End Time (backdating a finished day), the actual Start/End
  // window becomes the source of truth for how many hours were worked — the project-row hours
  // above auto-follow it instead of staying at whatever they defaulted to, splitting the real
  // duration across rows in their current proportions (or evenly if nothing was allocated yet).
  // This is what keeps the recorded hours matching the times actually entered, without asking
  // staff to go do that arithmetic themselves.
  useEffect(() => {
    if (!manualClockOutTouched) return;
    if (!manualClockInDate || !manualClockInTime || !manualClockOutDate || !manualClockOutTime) return;
    const actualDuration = (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) - new Date(combineDateTime(manualClockInDate, manualClockInTime))) / 3600000;
    if (!(actualDuration > 0)) return;
    setManualProjectRows((prev) => {
      const currentTotal = prev.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
      if (Math.abs(currentTotal - actualDuration) < 0.005) return prev;
      const evenShare = actualDuration / prev.length;
      return prev.map((r) => {
        const ratio = currentTotal > 0.005 ? (parseFloat(r.hours) || 0) / currentTotal : null;
        const hours = ratio != null ? actualDuration * ratio : evenShare;
        return { ...r, hours: Number(hours.toFixed(2)) };
      });
    });
  }, [manualClockInDate, manualClockInTime, manualClockOutDate, manualClockOutTime, manualClockOutTouched]);

  // General (non-project) work has no project name to explain what was done. For a live session
  // this is asked for later (on the General card itself, required before clocking out); only a
  // backdated Manual Entry — submitted whole, with no later "closing" moment — asks up front.
  const hasGeneralManual = manualProjectRows.some((r) => r.code === GENERAL);

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
        description: manualDescription.trim() || undefined,
        allocations: allocationsPayload,
      });
      const data = res.data?.data;
      const totalHours = (data?.allocations || []).reduce((sum, a) => sum + Number(a.allocated_hours || 0), 0);
      setManualAllocations(data?.allocations || []);
      showToast(`Entry logged — ${fmtHours(totalHours)} recorded.`, 'success');
      setManualClockInDate(todayISOStr()); setManualClockInTime(nowHHMM()); setManualRemark(''); setManualDescription('');
      setManualProjectRows([{ code: GENERAL, hours: '' }]);
      setManualProjectRowsValidated(false);
      setManualDescriptionValidated(false);
      setManualClockInTouched(false);
      setManualClockOutTouched(false);
      refreshPastSessions();
    } catch (e) { showToast(e.response?.data?.error || 'Manual entry failed.', 'error'); }
    finally { setManualSubmitting(false); }
  };

  // A backdated entry (any date before today) has its whole day already over, so there's no
  // reason to ask separately "when did you finish" afterward — both times are already known,
  // so collect them together in one step. Only "today" keeps the two-step Clock In / Clock Out
  // flow, since the end time genuinely might not be known yet.
  // Clocking in "now" (today, no end time yet) via Manual Entry creates the exact same kind of
  // open ACTIVE session as the Clock In/Out tab's own Clock In — so both tabs immediately show
  // the same "Active session" and either one can close it out.
  const submitManualClockIn = async () => {
    const allocationsPayload = manualProjectRows.map((r) => ({ projectCode: r.code, allocatedHours: parseFloat(r.hours) }));
    setManualSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/clock-in`, {
        userId: user.user_id,
        clockInTime: combineDateTime(manualClockInDate, manualClockInTime),
        remark: manualRemark.trim() || undefined,
        allocations: allocationsPayload,
      });
      const data = res.data?.data;
      const id = data?.attendance_id;
      const firstCode = data?.allocations?.[0]?.project_code || GENERAL;
      setAttendanceId(id); setClockedIn(true); setSelectedProject(firstCode);
      setActiveSessionClockInTime(data?.clock_in_time);
      setAllocations(data?.allocations || []);
      notifiedRef.current = new Set();
      sessionStorage.setItem('staff_attendance_id', id);
      sessionStorage.setItem('staff_attendance_project', firstCode);
      sessionStorage.setItem('staff_attendance_user_id', user.user_id);
      showToast('Clocked in successfully.', 'success');
      refreshPastSessions();
    } catch (e) { showToast(e.response?.data?.error || 'Clock-in failed.', 'error'); }
    finally { setManualSubmitting(false); }
  };

  const isPastManualEntry = manualClockInDate && manualClockInDate < todayISOStr();
  // A shift can legitimately cross midnight (e.g. clocked in 8pm, out 4am), so End Date is
  // allowed up to one day past Start Date — never further.
  const manualEndDateMax = addHoursToClock(manualClockInDate || todayISOStr(), '00:00', 24).date;

  const handleManualClockInStep = async (e) => {
    e.preventDefault();
    if (!user?.user_id) return;
    if (manualProjectRows.some((r) => !r.code)) { setManualProjectRowsValidated(true); return; }
    if (manualProjectRows.some((r) => !(parseFloat(r.hours) > 0))) { setManualProjectRowsValidated(true); showToast('Please enter valid hours for every project.', 'error'); return; }
    const startMissing = [];
    if (!manualClockInDate) startMissing.push('startDate');
    if (!manualClockInTime) startMissing.push('startTime');
    if (startMissing.length > 0) {
      setManualFieldErrors(startMissing);
      showToast('Please fill in the highlighted field(s).', 'error');
      return;
    }
    if (new Date(combineDateTime(manualClockInDate, manualClockInTime)) > new Date()) {
      setManualFieldErrors(['startDate', 'startTime']);
      showToast('You can\'t select a future date.', 'error'); return;
    }
    if (isPastManualEntry) {
      // A past entry is submitted whole in one step — there's no later "closing" moment to ask
      // for this then, so General's description has to be collected right here.
      if (manualProjectRows.some((r) => r.code === GENERAL) && !manualDescription.trim()) { setManualDescriptionValidated(true); return; }
      if (!manualClockOutDate || !manualClockOutTime) {
        const endMissing = [];
        if (!manualClockOutDate) endMissing.push('endDate');
        if (!manualClockOutTime) endMissing.push('endTime');
        setManualFieldErrors(endMissing);
        showToast('Please fill in the highlighted field(s).', 'error');
        return;
      }
      const manualOrderError = dateTimeOrderError(manualClockInDate, manualClockInTime, manualClockOutDate, manualClockOutTime);
      if (manualOrderError) {
        setManualFieldErrors([manualOrderError === 'date' ? 'endDate' : 'endTime']);
        showToast(manualOrderError === 'date' ? 'Error with Date Entry — please double check it.' : 'End time must be after the start time.', 'error');
        return;
      }
      if (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) > new Date()) {
        setManualFieldErrors(['endDate', 'endTime']);
        showToast('You can\'t select a future date.', 'error'); return;
      }
      // Project hours are what actually get recorded as worked time (not the clock times
      // themselves) — if they don't match the Start/End window, the entry shows the right times
      // in the list but the wrong duration everywhere hours are totalled (dashboard chart,
      // weekly total). Catch that mismatch here instead of letting it submit silently.
      const actualDurationHours = (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) - new Date(combineDateTime(manualClockInDate, manualClockInTime))) / 3600000;
      const totalRowHours = manualProjectRows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
      if (Math.abs(totalRowHours - actualDurationHours) > 0.02) {
        setManualFieldErrors(['endDate', 'endTime']);
        showToast(`Project hours (${totalRowHours.toFixed(2)}h) don't match the time entered (${actualDurationHours.toFixed(2)}h) — adjust one to match the other.`, 'error');
        return;
      }
    }
    setManualFieldErrors([]);

    let existing = [];
    try {
      const res = await axios.get(`${API_BASE}/api/v1/attendance/day-entries/${user.user_id}`, { params: { date: manualClockInDate } });
      existing = res.data?.data || [];
    } catch { /* if the check itself fails, fall through and let the flow proceed */ }

    const newStart = new Date(combineDateTime(manualClockInDate, manualClockInTime));
    const newEnd = isPastManualEntry ? new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) : newStart;
    const overlap = findOverlap(existing, newStart, newEnd);
    if (overlap) { setOverlapEntry(overlap); return; }
    if (existing.length > 0) { setDayConflictEntries(existing); return; }

    if (isPastManualEntry) submitManualEntry(); else submitManualClockIn();
  };

  // Closes the staff member's real live session (started via Clock In/Out) using the End Time
  // they edit here, instead of creating a second manual-entry record for the same day. Reuses the
  // same /clock-out endpoint and mirrors the top-level clockedIn/attendanceId state the live tab
  // reads, so the Clock In/Out tab immediately reflects the session as closed too.
  const submitActiveSessionClockOut = async (e) => {
    e.preventDefault();
    if (!closingActiveEntry || !user?.user_id) return;
    if (!manualClockOutDate || !manualClockOutTime) {
      const missing = [];
      if (!manualClockOutDate) missing.push('endDate');
      if (!manualClockOutTime) missing.push('endTime');
      setActiveFieldErrors(missing);
      showToast('Please fill in the highlighted field(s).', 'error');
      return;
    }
    // The End Time input only has minute precision, but a clock-in can land a few seconds into
    // that same minute — combineDateTime forces :00 seconds on both sides, matching the
    // backend's own clockInFloored check, so closing out in that same minute isn't rejected.
    const clockInMoment = new Date(closingActiveEntry.clock_in_time);
    const startDateStr = `${clockInMoment.getFullYear()}-${String(clockInMoment.getMonth() + 1).padStart(2, '0')}-${String(clockInMoment.getDate()).padStart(2, '0')}`;
    const startTimeStr = `${String(clockInMoment.getHours()).padStart(2, '0')}:${String(clockInMoment.getMinutes()).padStart(2, '0')}`;
    const activeOrderError = dateTimeOrderError(startDateStr, startTimeStr, manualClockOutDate, manualClockOutTime);
    if (activeOrderError) {
      setActiveFieldErrors([activeOrderError === 'date' ? 'endDate' : 'endTime']);
      showToast(activeOrderError === 'date' ? 'Error with Date Entry — please double check it.' : 'End time must be after the start time.', 'error');
      return;
    }
    if (new Date(combineDateTime(manualClockOutDate, manualClockOutTime)) > new Date()) {
      setActiveFieldErrors(['endDate', 'endTime']);
      showToast('You can\'t select a future date.', 'error'); return;
    }
    setActiveFieldErrors([]);
    const generalAlloc = allocations.find((a) => !a.project_code);
    if (generalAlloc && !(generalAlloc.description || '').trim()) { setClockDescriptionValidated(true); return; }
    if (generalAlloc) {
      const saved = await saveAllocationDescription(generalAlloc.allocation_id, generalAlloc.description);
      if (!saved) { showToast('Could not save your description — check your connection and try again.', 'error'); return; }
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
      refreshPastSessions();
    } catch (e2) { showToast(e2.response?.data?.error || 'Clock-out failed.', 'error'); }
    finally { setManualSubmitting(false); }
  };

  const fmtTimeSGT = (iso) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true });
  // "YYYY-MM-DD" for an instant's SGT calendar day — en-CA formats dates in that order directly.
  const sgtDateStr = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

  // "28/8/2026" — used for the day-conflict warning. Only needs to represent whole SGT calendar
  // days, so a straight day/month/year split on the "YYYY-MM-DD" string is exact — no timezone
  // conversion involved.
  const fmtSlashDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${d}/${m}/${y}`;
  };

  // "Tue, 8 Sep" — the Recent Entries day-group header. Same exact-day-split approach as
  // fmtSlashDate (no timezone conversion needed, "YYYY-MM-DD" already names an SGT calendar day).
  const fmtDayHeader = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // "3h 40m" — elapsed time between two instants, for the Recent Entries duration column.
  const fmtDuration = (startIso, endIso) => {
    const totalMin = Math.max(Math.round((new Date(endIso) - new Date(startIso)) / 60000), 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  // "19 Sept" — short end-day label for an overnight session's badge.
  const fmtShortDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  };

  // Shared between Clock In/Out and Manual Entry — each keeps its own row state (so setting up
  // a manual entry never disturbs an in-progress live clock-in setup, and vice versa), but the
  // form itself is identical either way. "General (non-project)" is just the first option in
  // each project picker, not a separate mode.
  const renderProjectSetupUI = (rows, setRows, validated, setValidated, extraContent) => {
    const totalRowHours = rows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
    const addRow = () => {
      setValidated(false);
      setRows((prev) => (prev.length >= 8 ? prev : [...prev, { code: '', hours: '' }]));
    };
    const removeRow = (index) => {
      setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    };
    return (
      <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
        <p className="text-xs text-slate-400 mb-4">Enter the hours you plan to spend on each project.</p>
        <div className="space-y-4">
          {rows.map((row, i) => {
            const rowError = validated && !row.code;
            const hoursError = validated && !!row.code && !(parseFloat(row.hours) > 0);
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
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <input type="number" min="0.1" step="0.1" value={row.hours} placeholder="0"
                    onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, hours: e.target.value } : r)))}
                    className={`w-16 rounded-xl border-2 bg-white px-2 py-3 text-sm text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${hoursError ? 'border-red-400' : 'border-[#D1D5DB] focus:border-blue-500'}`} />
                  <span className="text-xs text-slate-400">hrs</span>
                </div>
                {hoursError && <p className="text-[10px] text-red-500 whitespace-nowrap">* Invalid</p>}
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
        <p className="mt-3 text-xs font-semibold text-slate-400">
          Total: {totalRowHours.toFixed(2)} hrs
        </p>
        {rows.length < 8 && (
          <button type="button" onClick={addRow}
            className="mt-4 w-full rounded-2xl border border-dashed border-slate-300 bg-white py-3 text-sm font-semibold text-[#0c3b8f] hover:bg-slate-50">
            + Add Project
          </button>
        )}
        {extraContent && <div className="mt-5 pt-5 border-t border-slate-200">{extraContent}</div>}
      </div>
    );
  };
  const manualDescriptionUI = isPastManualEntry && hasGeneralManual ? (
    <>
      <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
      <textarea rows={2} value={manualDescription}
        onChange={(e) => { setManualDescription(e.target.value); setManualDescriptionValidated(false); }}
        placeholder="Add description or notes"
        className={`w-full rounded-xl border bg-white px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${manualDescriptionValidated && !manualDescription.trim() ? 'border-red-400' : 'border-slate-300'}`} />
      {manualDescriptionValidated && !manualDescription.trim() && <p className="mt-1 text-xs text-red-500">* Please fill in this field</p>}
    </>
  ) : null;
  const projectSetupUI = renderProjectSetupUI(projectRows, setProjectRows, projectRowsValidated, setProjectRowsValidated);
  const manualProjectSetupUI = renderProjectSetupUI(manualProjectRows, setManualProjectRows, manualProjectRowsValidated, setManualProjectRowsValidated, manualDescriptionUI);

  // Shared between the live Clock In/Out session and a just-submitted Manual Entry — each keeps
  // its own allocation list, but the card layout, edit/delete/correct controls, and the modal
  // work identically either way. `allowAdd` hides "+ Add Project" for Manual Entry, since you
  // can't add a project to an already-closed entry.

  const renderAllocationTracker = (allocs, setAllocs, source, allowAdd) => {
    return (
    <div className="mb-6 space-y-3">
      {allocs.map((a) => {
        const isActive = a.status === 'ACTIVE';
        const isCompleted = a.status === 'COMPLETED';
        const accumulated = Number(a.accumulated_hours || 0);
        const liveElapsedHrs = isActive && a.started_at ? (nowTick - new Date(a.started_at).getTime()) / 3600000 : 0;
        const trackedHrs = accumulated + liveElapsedHrs;
        const pct = isCompleted ? 100 : Math.min(100, Math.round((trackedHrs / Math.max(a.allocated_hours, 0.01)) * 100));
        const overBudget = isActive && trackedHrs >= a.allocated_hours;
        const isPaused = !isActive && !isCompleted && accumulated > 0;

        // Ring gauge geometry
        const ringR = 30, ringC = 2 * Math.PI * ringR;
        const ringOffset = ringC * (1 - Math.min(100, pct) / 100);
        const ringColor = overBudget ? '#d97706' : '#2563eb';

        const isEditingCard = editingCardId === a.allocation_id;
        const highlightField = highlightTarget?.allocationId === a.allocation_id ? highlightTarget.field : null;

        return (
          <div key={a.allocation_id}
            ref={(el) => { if (el) cardRefs.current.set(a.allocation_id, el); else cardRefs.current.delete(a.allocation_id); }}
            className={`rounded-2xl border p-4 ${isActive ? 'border-blue-300 bg-blue-50/40' : isCompleted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              {isEditingCard ? (
                <div className="flex-1 min-w-0">
                  <ProjectSearchSelect
                    value={projectDraft}
                    onChange={setProjectDraft}
                    projects={projects.filter((p) => !allocs.some((x) => x.allocation_id !== a.allocation_id && x.project_code === p.project_code))}
                    placeholder="Select or search project…"
                    compact
                  />
                </div>
              ) : (
                <span className={`text-sm font-semibold truncate min-w-0 flex-1 ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {projectLabel(a.project_code, projects)}
                </span>
              )}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  isActive ? (overBudget ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')
                  : isCompleted ? 'bg-slate-200 text-slate-500' : isPaused ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {isActive ? (overBudget ? 'Time up' : 'Active') : isCompleted ? 'Completed' : isPaused ? 'Paused' : 'Pending'}
                </span>
                <span className={isEditingCard ? 'invisible pointer-events-none' : ''}>
                  <EditIconButton title="Edit this project entry" onClick={() => startCardEdit(a)} />
                </span>
                <AllocationActionsMenu
                  onComplete={source === 'live' && !isCompleted ? () => (a.project_code
                    ? markAsCompleted(a.allocation_id, a.project_code)
                    : handleCompleteAllocation(a.allocation_id)) : null}
                  completeSubtext={a.project_code ? "Logs today's progress at 100%" : 'Ends this work block now'}
                  onDelete={allocs.length > 1 ? () => handleDeleteAllocation(a.allocation_id, source, allocs) : null} />
              </div>
            </div>

            {isCompleted ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 flex items-center flex-wrap gap-x-1">
                  {isEditingCard ? (
                    <input type="number" min="0.1" step="0.1" autoFocus value={hoursDraft}
                      onChange={(e) => setHoursDraft(e.target.value)}
                      placeholder={String(a.corrected_hours ?? a.accumulated_hours ?? a.allocated_hours)}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  ) : (
                    a.corrected_hours != null ? fmtHours(a.corrected_hours) : fmtHours(a.accumulated_hours)
                  )}
                  <span>actual</span>
                  {!isEditingCard && a.corrected_hours != null && (
                    <span className="text-slate-400">(system recorded {fmtHours(a.accumulated_hours)})</span>
                  )}
                  {a.edited_after_completion && <span className="text-amber-600">· plan edited after completion</span>}
                </span>
              </div>
            ) : a.project_code ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">Budget utilisation</p>
                <div className="flex items-center gap-4">
                  <svg width="64" height="64" viewBox="0 0 72 72" className="flex-shrink-0">
                    <circle cx="36" cy="36" r={ringR} fill="none" stroke="#e2e8f0" strokeWidth="7" />
                    <circle cx="36" cy="36" r={ringR} fill="none" stroke={ringColor} strokeWidth="7"
                      strokeDasharray={ringC} strokeDashoffset={ringOffset} strokeLinecap="round"
                      transform="rotate(-90 36 36)" />
                    <text x="36" y="33" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1e293b">{pct}%</text>
                    <text x="36" y="45" textAnchor="middle" fontSize="8" fill="#94a3b8">used</text>
                  </svg>
                  <div className="flex-1 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-slate-500">Used</span><span className="font-semibold text-slate-800">{fmtHours(trackedHrs)}</span></div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Budget</span>
                      {isEditingCard ? (
                        <input type="number" min="0.1" step="0.1" autoFocus value={hoursDraft}
                          onChange={(e) => setHoursDraft(e.target.value)}
                          placeholder={String(a.allocated_hours)}
                          className="w-16 rounded border border-slate-300 px-1 py-0.5 text-xs text-right font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      ) : (
                        <span className="font-semibold text-slate-800">{a.allocated_hours ? fmtHours(a.allocated_hours) : ''}</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Remaining</span>
                      <span className={`font-semibold ${overBudget ? 'text-amber-600' : 'text-green-600'}`}>{a.allocated_hours ? fmtHours(Math.max(0, a.allocated_hours - trackedHrs)) : ''}</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {isPaused && 'Paused'}
                  {a.edited_after_completion && <span className="text-amber-600">{isPaused ? ' · ' : ''}Plan edited after completion</span>}
                </p>

                {source === 'live' && (() => {
                  const log = getLatestProgressLog(a.project_code);
                  const lastPct = getLatestProgressPct(a.project_code);
                  const draft = progressInputs[a.allocation_id] || '';
                  const busy = !!progressSubmitting[a.allocation_id];
                  const canEditLast = log && !isAutoProgressEntry(log);
                  const isEditingProgress = editingProgressId === a.allocation_id;
                  const showProgressInput = canEditLast && (isEditingCard || isEditingProgress);
                  return (
                    <div className={`mt-3 pt-3 border-t border-slate-100 transition-shadow duration-300 ${highlightField === 'progress' ? 'rounded-xl ring-2 ring-red-300 bg-red-50/60 -mx-2 px-2 pb-2' : ''}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">Progress tracking</p>
                      {log ? (
                        showProgressInput ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <input type="number" min="0" max="100" step="0.1" autoFocus={isEditingProgress} value={progressEditDraft}
                                onChange={(e) => setProgressEditDraft(e.target.value)}
                                placeholder={lastPct.toFixed(0)}
                                className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              <span className="text-xs text-slate-500">%</span>
                            </div>
                            {isEditingProgress && (
                              <div className="flex items-center justify-end gap-2 mt-2">
                                <InlineConfirmCancel
                                  onConfirm={async () => { await saveEditProgress(a.allocation_id, a.project_code); setEditingProgressId(null); }}
                                  onCancel={() => setEditingProgressId(null)} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                              {lastPct.toFixed(0)}%
                            </span>
                            {canEditLast && (
                              <EditIconButton title="Edit logged progress"
                                onClick={() => { setEditingProgressId(a.allocation_id); setProgressEditDraft(String(lastPct)); }} />
                            )}
                          </div>
                        )
                      ) : (
                        <div className="flex items-center gap-2">
                          <input type="number" min="0.1" max="100" step="0.1" value={draft}
                            onChange={(e) => setProgressInputs((prev) => ({ ...prev, [a.allocation_id]: e.target.value }))}
                            placeholder="Add completion percentage"
                            className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <button type="button" disabled={busy}
                            onClick={() => submitProgressUpdate(a.allocation_id, a.project_code)}
                            className="flex-shrink-0 rounded-xl bg-[#0c3b8f] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#0a2f70] disabled:opacity-60 transition">
                            {busy ? 'Saving…' : 'Log'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 flex items-center flex-wrap gap-x-1">
                  {(isActive || isPaused) && <span>{fmtHours(trackedHrs)} tracked of</span>}
                  {isEditingCard ? (
                    <input type="number" min="0.1" step="0.1" autoFocus value={hoursDraft}
                      onChange={(e) => setHoursDraft(e.target.value)}
                      placeholder={String(a.allocated_hours)}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  ) : (
                    fmtHours(a.allocated_hours)
                  )}
                  <span>planned{isPaused ? ' (paused)' : ''}</span>
                  {a.edited_after_completion && <span className="text-amber-600">· plan edited after completion</span>}
                </span>
              </div>
            )}

            {source === 'live' && isCompleted && (
              <button type="button" onClick={() => handleReopenAllocation(a.allocation_id)}
                className="mt-2 text-xs font-semibold text-[#0c3b8f] hover:underline">
                Reopen — I'm still working on this
              </button>
            )}

            {/* Every project block gets its own description, right on the card — required for
                General (no project name to explain what was done), optional otherwise. Saved
                per-allocation as soon as the field loses focus. */}
            {source === 'live' && (
              <div className={`mt-3 transition-shadow duration-300 ${highlightField === 'description' ? 'rounded-xl ring-2 ring-red-300 bg-red-50/60 -mx-2 px-2 pb-2' : ''}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Description {!a.project_code && <span className="text-red-500">*</span>}
                  </label>
                  {descriptionSavedId === a.allocation_id && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Saved
                    </span>
                  )}
                </div>
                <textarea rows={2} value={a.description || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAllocs((prev) => prev.map((x) => x.allocation_id === a.allocation_id ? { ...x, description: val } : x));
                    if (!a.project_code) setClockDescriptionValidated(false);
                  }}
                  onBlur={(e) => saveAllocationDescription(a.allocation_id, e.target.value)}
                  placeholder={a.project_code ? 'Add description or notes (optional)' : 'Add description or notes'}
                  className={`w-full rounded-xl border px-3 py-2 text-xs resize-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !a.project_code && clockDescriptionValidated && !(a.description || '').trim() ? 'border-red-400' : 'border-slate-300'
                  }`} />
                {!a.project_code && clockDescriptionValidated && !(a.description || '').trim() && (
                  <p className="mt-1 text-xs text-red-500">* Please fill in this field</p>
                )}
              </div>
            )}

            {isEditingCard && (
              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                <InlineConfirmCancel onConfirm={() => saveCardEdit(a, setAllocs)} onCancel={cancelCardEdit} />
              </div>
            )}
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

      <div className="mb-10 flex items-start gap-3 pl-3">
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
      <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,42rem)_minmax(24rem,1fr)]">
        {/* Log Time card — minHeight keeps it at least as tall as the right column (This week +
            Recent entries, sized to show 5 full entries), so the two stay bottom-aligned. */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col" style={{ minHeight: 630 }}>
          {/* Segment tabs */}
          <div className="mb-6 flex-shrink-0 flex gap-2 rounded-2xl bg-slate-100 p-1">
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
            <div className="flex flex-col flex-1 min-h-0">
              <div className="mb-6 flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${clockedIn ? 'bg-green-500' : 'bg-slate-300'}`} />
                <span className={`text-sm font-semibold ${clockedIn ? 'text-green-700' : 'text-slate-500'}`}>
                  {clockedIn ? 'Active session' : 'Not clocked in'}
                </span>
              </div>

              {!clockedIn && projectSetupUI}

              {clockedIn && allocationTracker}

              <div className="flex-1" />

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
            </div>
          ) : closingActiveEntry ? (
            // Already has a real live session open — Manual Entry has nothing left to "clock in"
            // for, so it goes straight to closing that session with an editable End Time instead
            // of offering to start a second, duplicate entry for the day.
            <form onSubmit={submitActiveSessionClockOut} noValidate className="flex flex-col flex-1 min-h-0">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-green-700">Active session</span>
              </div>

              {allocationTracker}

              <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                  <input type="date" value={manualClockOutDate} max={todayISO} onChange={(e) => { setManualClockOutDate(e.target.value); setManualClockOutTouched(true); setActiveFieldErrors([]); }}
                    className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeFieldErrors.includes('endDate') ? 'border-red-400' : 'border-slate-300'}`} />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    End Time <span className="font-normal text-slate-400">(when you actually clocked off)</span>
                  </label>
                  <input type="time" value={manualClockOutTime} onChange={(e) => { setManualClockOutTime(e.target.value); setManualClockOutTouched(true); setActiveFieldErrors([]); }}
                    className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeFieldErrors.includes('endTime') ? 'border-red-400' : 'border-slate-300'}`} />
                </div>
              </div>

              <div className="flex-1" />

              <button type="submit" disabled={manualSubmitting || !manualClockOutTime}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                {manualSubmitting ? 'Please wait…' : 'Clock Out'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleManualClockInStep} noValidate className="flex flex-col flex-1 min-h-0">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-slate-300" />
                <span className="text-sm font-semibold text-slate-500">Not clocked in</span>
              </div>
              {manualProjectSetupUI}

              <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
                  <input type="date" value={manualClockInDate} max={todayISO} onChange={(e) => { setManualClockInDate(e.target.value); setManualFieldErrors([]); }}
                    className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${manualFieldErrors.includes('startDate') ? 'border-red-400' : 'border-slate-300'}`} />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Start Time</label>
                  <input type="time" value={manualClockInTime} onChange={(e) => { setManualClockInTime(e.target.value); setManualClockInTouched(true); setManualFieldErrors([]); }}
                    className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${manualFieldErrors.includes('startTime') ? 'border-red-400' : 'border-slate-300'}`} />
                </div>
              </div>
              {isPastManualEntry && (
                <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                    <input type="date" value={manualClockOutDate} max={manualEndDateMax} onChange={(e) => { setManualClockOutDate(e.target.value); setManualClockOutTouched(true); setManualFieldErrors([]); }}
                      className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${manualFieldErrors.includes('endDate') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">End Time</label>
                    <input type="time" value={manualClockOutTime} onChange={(e) => { setManualClockOutTime(e.target.value); setManualClockOutTouched(true); setManualFieldErrors([]); }}
                      className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${manualFieldErrors.includes('endTime') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                </div>
              )}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={2} value={manualRemark} onChange={(e) => setManualRemark(e.target.value)}
                  placeholder="Add notes or specific tasks (optional)"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex-1" />

              <button type="submit" disabled={manualSubmitting || !manualClockInTime}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
                style={{ background: '#0c3b8f' }}>
                {manualSubmitting ? 'Please wait…' : (isPastManualEntry ? 'Submit' : 'Clock In')}
              </button>

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
                        if (isPastManualEntry) submitManualEntry(); else submitManualClockIn();
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
              <form onSubmit={submitEditTimes} noValidate className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setEditingEntry(null)} aria-label="Close"
                  className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <p className="text-lg font-semibold text-slate-900 mb-1 pr-8">Edit Entry</p>
                <p className="text-xs text-slate-400 mb-6">{editProjectRows ? 'Change the projects, hours and clock-in/out times for this entry.' : 'Correcting the clock-in/out times for this entry.'}</p>
                {editProjectRows && renderProjectSetupUI(editProjectRows, setEditProjectRows, editRowsValidated, setEditRowsValidated)}
                <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Start Date</label>
                    <input type="date" value={editStartDate} max={todayISO} onChange={(e) => { setEditStartDate(e.target.value); setEditFieldErrors([]); syncEditRowsToWindow(e.target.value, editStartTime, editEndDate, editEndTime); }}
                      className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFieldErrors.includes('startDate') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Start Time</label>
                    <input type="time" value={editStartTime} onChange={(e) => { setEditStartTime(e.target.value); setEditFieldErrors([]); syncEditRowsToWindow(editStartDate, e.target.value, editEndDate, editEndTime); }}
                      className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFieldErrors.includes('startTime') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                </div>
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                    <input type="date" value={editEndDate} max={todayISO} onChange={(e) => { setEditEndDate(e.target.value); setEditFieldErrors([]); syncEditRowsToWindow(editStartDate, editStartTime, e.target.value, editEndTime); }}
                      className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFieldErrors.includes('endDate') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">End Time</label>
                    <input type="time" value={editEndTime} onChange={(e) => { setEditEndTime(e.target.value); setEditFieldErrors([]); syncEditRowsToWindow(editStartDate, editStartTime, editEndDate, e.target.value); }}
                      className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFieldErrors.includes('endTime') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                </div>
                <button type="submit" disabled={editSubmitting}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                  {editSubmitting ? 'Please wait…' : 'Save'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right column: This Week stats + a filterable Recent Entries list, with edit/delete. */}
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

          {/* Fixed height — tall enough to show 5 entries in full without scrolling — kept
              constant so this card never grows or shrinks as filters/Load more/tab switches
              change its content. The Log Time card's minHeight is set to match this. */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col" style={{ height: 440 }}>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-4 flex-shrink-0">Recent entries</p>

            <div className="flex items-center justify-between gap-2 mb-4 relative flex-shrink-0">
              <div className="flex gap-1.5 flex-wrap">
                {[{ k: 'all', l: 'All' }, { k: 'week', l: 'This week' }, { k: 'month', l: 'This month' }].map((p) => (
                  <button key={p.k} type="button"
                    onClick={() => { setHistoryPill(p.k); setHistoryDate(null); }}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                      !historyDate && historyPill === p.k ? 'text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    style={!historyDate && historyPill === p.k ? { background: '#0c3b8f' } : undefined}>
                    {p.l}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setCalendarOpen((v) => !v)}
                className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 transition"
                aria-label="Filter by date">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
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
                      const holidayName = publicHolidays[iso];
                      return (
                        <button key={i} type="button" disabled={isFuture} title={holidayName || undefined}
                          onClick={() => { setHistoryDate(iso); setCalendarOpen(false); }}
                          className={`relative py-1 rounded-full transition ${isSelected ? 'text-white font-semibold' : isFuture ? 'text-slate-300' : holidayName ? 'text-red-600 font-semibold hover:bg-red-50' : 'hover:bg-slate-100'}`}
                          style={isSelected ? { background: '#0c3b8f' } : undefined}>
                          {d.getDate()}
                          {holidayName && !isSelected && (
                            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    SG public holiday
                  </p>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 inner-scrollbar-pad flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 inner-scrollbar">
              {pastSessionsLoading ? (
                <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
              ) : filteredHistoryEntries.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No attendance logged in this period.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {(() => {
                    // Group every filtered entry by calendar day — entries are already sorted
                    // newest-first, so each new day encountered starts a fresh group. The whole
                    // list renders at once; the panel's own overflow-y-auto handles scrolling.
                    const groups = [];
                    for (const s of filteredHistoryEntries) {
                      const g = groups[groups.length - 1];
                      if (g && g.day === s.day) g.entries.push(s);
                      else groups.push({ day: s.day, entries: [s] });
                    }
                    return groups.map((g) => (
                      <div key={g.day}>
                        <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{fmtDayHeader(g.day)}</p>
                        <div className="flex flex-col gap-1.5">
                          {g.entries.map((s) => {
                            const isActive = !s.clock_out_time;
                            const isOvernight = s.clock_out_time && sgtDateStr(s.clock_out_time) !== s.day;
                            const durationLabel = fmtDuration(s.clock_in_time, isActive ? new Date(nowTick).toISOString() : s.clock_out_time);
                            return (
                            <div key={s.attendance_id} className="rounded-2xl border border-slate-200 px-3 py-2.5 flex items-center gap-3">
                              <span className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 15, height: 15 }}>
                                {isActive ? (
                                  <>
                                    <span className="absolute inline-flex rounded-full opacity-75 animate-ping" style={{ width: 9, height: 9, background: '#639922' }} />
                                    <span className="relative inline-flex rounded-full" style={{ width: 9, height: 9, background: '#639922' }} />
                                  </>
                                ) : (
                                  <span className="inline-flex rounded-full" style={{ width: 9, height: 9, background: '#cbd5e1' }} />
                                )}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">
                                  {fmtTimeSGT(s.clock_in_time)} <span className="text-slate-400 font-normal">→</span> {isActive ? 'Active now' : fmtTimeSGT(s.clock_out_time)}
                                </p>
                                {isOvernight && (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#FAEEDA', color: '#854F0B' }}>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                                    Ends {fmtShortDate(sgtDateStr(s.clock_out_time))}
                                  </span>
                                )}
                              </div>
                              <span className="flex-shrink-0 text-[11px] font-medium text-slate-400">{durationLabel}</span>
                              <div className="flex-shrink-0 flex items-center gap-1.5">
                                <button type="button" onClick={() => openEditEntry(s)} aria-label="Edit entry"
                                  className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center transition">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button type="button" onClick={() => setDeleteConfirmEntry(s)} aria-label="Delete entry"
                                  className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center justify-center transition">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            </div>
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

      {deleteConfirmEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4" onClick={() => setDeleteConfirmEntry(null)}>
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-semibold text-slate-900 mb-2">Delete this entry?</p>
            <p className="text-sm text-slate-500 mb-1">
              {fmtSlashDate(deleteConfirmEntry.day)} &middot; {fmtTimeSGT(deleteConfirmEntry.clock_in_time)} – {deleteConfirmEntry.clock_out_time ? fmtTimeSGT(deleteConfirmEntry.clock_out_time) : 'still active'}
            </p>
            <p className="text-sm text-slate-500 mb-6">This can't be undone.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteConfirmEntry(null)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteEntry} disabled={deleteSubmitting}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                {deleteSubmitting ? 'Please wait…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

