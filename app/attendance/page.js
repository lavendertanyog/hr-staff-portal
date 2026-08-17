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
function ProjectSearchSelect({ value, onChange, projects, placeholder }) {
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
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

const STANDARD_WORKDAY_HOURS = 8;

function evenSplitHours(count) {
  const each = Math.round((STANDARD_WORKDAY_HOURS / Math.max(count, 1)) * 100) / 100;
  return Array.from({ length: count }, () => each);
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [logTab, setLogTab] = useState('clock'); // 'clock' | 'manual'

  // Multi-project clock-in setup (before clocking in)
  const [clockMode, setClockMode] = useState('general'); // 'general' | 'projects'
  const [numProjects, setNumProjects] = useState(1);
  const [projectRows, setProjectRows] = useState([{ code: '', hours: STANDARD_WORKDAY_HOURS }]);

  // Active session allocation tracking (after clocking in)
  const [allocations, setAllocations] = useState([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addProjectCode, setAddProjectCode] = useState('');
  const [addProjectBusy, setAddProjectBusy] = useState(false);
  const [editingAllocId, setEditingAllocId] = useState(null);
  const [editingHoursVal, setEditingHoursVal] = useState('');
  const [extendingAllocId, setExtendingAllocId] = useState(null);
  const [extendHoursVal, setExtendHoursVal] = useState('1');
  const notifiedRef = useRef(new Set());

  // Manual entry state — same active session as Clock In/Out, just typed date/times instead of live "now"
  const [manualProject, setManualProject] = useState('');
  const [manualClockInDate, setManualClockInDate] = useState(() => todayISOStr());
  const [manualClockInTime, setManualClockInTime] = useState(() => nowHHMM());
  const [manualClockOutDate, setManualClockOutDate] = useState(() => todayISOStr());
  const [manualClockOutTime, setManualClockOutTime] = useState(() => nowHHMM());
  const [manualRemark, setManualRemark] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState('');
  const [manualMessageType, setManualMessageType] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const todayISO = todayISOStr();

  // Combine a "YYYY-MM-DD" date with a "HH:MM" time input into a full local datetime string
  const combineDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    return `${dateStr}T${timeStr}:00`;
  };

  // Refresh the manual entry date/time to "now" whenever the fields are still at their
  // untouched defaults — so switching to the tab later in the day shows current time,
  // without clobbering a date/time the user already deliberately picked.
  const openManualTab = () => {
    setLogTab('manual');
    setManualClockInDate((d) => d || todayISOStr());
    setManualClockInTime((t) => t || nowHHMM());
    setManualClockOutDate((d) => d || todayISOStr());
    setManualClockOutTime((t) => t || nowHHMM());
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
            const elapsedHrs = (Date.now() - new Date(activeBlock.started_at).getTime()) / 3600000;
            if (elapsedHrs >= Number(activeBlock.allocated_hours) && !notifiedRef.current.has(activeBlock.allocation_id)) {
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

  const showMsg = (text, type) => { setMessage(text); setMessageType(type); };

  // Rebuild the project rows whenever the count changes, keeping any codes already picked
  // and re-splitting the standard 8h workday evenly across the new count.
  const setProjectCount = (n) => {
    const count = Math.max(1, Math.min(8, n));
    setNumProjects(count);
    setProjectRows((prev) => {
      const hours = evenSplitHours(count);
      return Array.from({ length: count }, (_, i) => ({ code: prev[i]?.code || '', hours: hours[i] }));
    });
  };

  const handleClockIn = async () => {
    if (!user?.user_id) return;
    let allocationsPayload;
    if (clockMode === 'general') {
      allocationsPayload = [{ projectCode: null, allocatedHours: null }];
    } else {
      if (projectRows.some((r) => !r.code)) { showMsg('Please select a project for every row, or remove it.', 'error'); return; }
      allocationsPayload = projectRows.map((r) => ({ projectCode: r.code, allocatedHours: r.hours }));
    }

    setLoading(true); setMessage('');
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
    setLoading(true); setMessage('');
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, {
        userId: user.user_id, attendanceId, remark: clockRemark.trim() || undefined,
      });
      const recon = res.data?.data?.reconciliation;
      setClockedIn(false); setAttendanceId(null); setClockRemark(''); setAllocations([]);
      sessionStorage.removeItem('staff_attendance_id');
      sessionStorage.removeItem('staff_attendance_project');
      sessionStorage.removeItem('staff_attendance_user_id');
      if (recon?.mismatch) {
        showMsg(`Clocked out. Note: you planned ${fmtHours(recon.totalAllocatedHours)} across your projects, but actually worked ${fmtHours(recon.actualWorkedHours)}. Recorded hours use your actual clock time.`, 'success');
      } else {
        showMsg('Clocked out. Hours have been recorded.', 'success');
      }
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

  const handleSaveEditHours = async (allocationId) => {
    const hrs = parseFloat(editingHoursVal);
    if (!user?.user_id || !hrs || hrs <= 0) { setEditingAllocId(null); return; }
    try {
      const res = await axios.patch(`${API_BASE}/api/v1/attendance/allocations/${allocationId}`, { userId: user.user_id, allocatedHours: hrs });
      setAllocations((prev) => prev.map((a) => (a.allocation_id === allocationId ? res.data?.data : a)));
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to update hours.', 'error'); }
    finally { setEditingAllocId(null); }
  };

  const handleExtend = async (allocationId) => {
    const hrs = parseFloat(extendHoursVal);
    if (!user?.user_id || !hrs || hrs <= 0) { setExtendingAllocId(null); return; }
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/allocations/${allocationId}/extend`, { userId: user.user_id, extraHours: hrs });
      const updated = res.data?.data;
      setAllocations((prev) => prev.map((a) => (a.allocation_id === allocationId ? updated : a)));
      notifiedRef.current.delete(allocationId);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to extend time.', 'error'); }
    finally { setExtendingAllocId(null); }
  };

  const handleManualClockIn = async (e) => {
    e.preventDefault();
    if (!user?.user_id) return;
    if (!manualProject) { setManualMessage('Please select a project, or "General (non-project)".'); setManualMessageType('error'); return; }
    if (!manualClockInDate) { setManualMessage('Please select a date.'); setManualMessageType('error'); return; }
    if (!manualClockInTime) { setManualMessage('Please enter a clock-in time.'); setManualMessageType('error'); return; }
    setManualSubmitting(true); setManualMessage('');
    // Silently attempt location capture in the background, same as live Clock In
    const coords = await requestLocationSilently();
    const projectCode = manualProject === GENERAL ? undefined : manualProject;
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/clock-in`, {
        userId: user.user_id,
        projectCode,
        isManualLocation: !coords.latitude,
        latitude: coords.latitude,
        longitude: coords.longitude,
        clockInTime: combineDateTime(manualClockInDate, manualClockInTime),
        remark: manualRemark.trim() || undefined,
      });
      const id = res.data?.data?.attendance_id;
      setAttendanceId(id); setClockedIn(true); setSelectedProject(manualProject);
      sessionStorage.setItem('staff_attendance_id', id);
      sessionStorage.setItem('staff_attendance_project', manualProject);
      sessionStorage.setItem('staff_attendance_user_id', user.user_id);
      setManualMessage('Clock-in logged successfully.'); setManualMessageType('success');
      setManualClockInDate(todayISOStr()); setManualClockInTime(nowHHMM()); setManualRemark('');
    } catch (e) { setManualMessage(e.response?.data?.error || 'Manual clock-in failed.'); setManualMessageType('error'); }
    finally { setManualSubmitting(false); }
  };

  const handleManualClockOut = async (e) => {
    e.preventDefault();
    if (!attendanceId || !user?.user_id) return;
    if (!manualClockOutDate) { setManualMessage('Please select a date.'); setManualMessageType('error'); return; }
    if (!manualClockOutTime) { setManualMessage('Please enter a clock-out time.'); setManualMessageType('error'); return; }
    setManualSubmitting(true); setManualMessage('');
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, {
        userId: user.user_id, attendanceId,
        clockOutTime: combineDateTime(manualClockOutDate, manualClockOutTime),
        remark: manualRemark.trim() || undefined,
      });
      setClockedIn(false); setAttendanceId(null);
      sessionStorage.removeItem('staff_attendance_id');
      sessionStorage.removeItem('staff_attendance_project');
      sessionStorage.removeItem('staff_attendance_user_id');
      setManualMessage('Clock-out logged. Hours have been recorded.'); setManualMessageType('success');
      setManualClockOutDate(todayISOStr()); setManualClockOutTime(nowHHMM()); setManualRemark('');
    } catch (e) { setManualMessage(e.response?.data?.error || 'Manual clock-out failed.'); setManualMessageType('error'); }
    finally { setManualSubmitting(false); }
  };

  return (
    <div className="p-8">
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

      {/* Mobile: help card stacks above the Log Time card. Desktop: sits beside it in a second column. */}
      <div className={`grid gap-6 items-start ${showHelp ? 'lg:grid-cols-[minmax(0,42rem)_26rem]' : ''}`}>
        {showHelp && (
          <div className="order-first lg:order-last rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-4">How It Works</p>
            <ul className="space-y-4 text-sm text-slate-600">
              {[
                { n: '1', t: 'Pick project or general', d: 'Choose the project you are working on, or "General" for non-project work.' },
                { n: '2', t: 'Add a remark', d: 'Optionally note what you worked on — helps your manager review your attendance report.' },
                { n: '3', t: 'Clock In or log manually', d: 'Clock in/out live, or use Manual Entry if you forgot to clock in for a shift.' },
                { n: '4', t: 'Reviewed by your manager', d: 'Your total hours, overtime, and remarks appear in your manager\'s attendance report.' },
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
        )}

        {/* Log Time card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm max-w-2xl">
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

              {!clockedIn && (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">What are you clocking in for?</label>
                    <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
                      <button type="button" onClick={() => setClockMode('general')}
                        className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${clockMode === 'general' ? 'bg-white shadow-sm text-[#0c3b8f]' : 'text-slate-500'}`}>
                        General (non-project)
                      </button>
                      <button type="button" onClick={() => setClockMode('projects')}
                        className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${clockMode === 'projects' ? 'bg-white shadow-sm text-[#0c3b8f]' : 'text-slate-500'}`}>
                        Project(s)
                      </button>
                    </div>
                  </div>

                  {clockMode === 'projects' && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-semibold text-slate-700">How many projects today?</label>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setProjectCount(numProjects - 1)}
                            className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-50">−</button>
                          <span className="w-6 text-center text-sm font-semibold text-slate-800">{numProjects}</span>
                          <button type="button" onClick={() => setProjectCount(numProjects + 1)}
                            className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-50">+</button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mb-4">Hours default to an even split of an 8-hour day — you can overwrite any of them.</p>
                      <div className="space-y-4">
                        {projectRows.map((row, i) => (
                          <div key={i} className="flex gap-3 items-start">
                            <div className="flex-1 min-w-0">
                              <ProjectSearchSelect
                                value={row.code}
                                onChange={(code) => setProjectRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, code } : r)))}
                                projects={projects.filter((p) => !projectRows.some((r, idx) => idx !== i && r.code === p.project_code))}
                                placeholder={`Project ${i + 1}…`}
                              />
                            </div>
                            <div className="w-24 flex-shrink-0">
                              <input type="number" min="0.25" step="0.25" value={row.hours}
                                onChange={(e) => setProjectRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, hours: parseFloat(e.target.value) || 0 } : r)))}
                                className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!clockedIn && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                  <textarea rows={2} value={clockRemark} onChange={(e) => setClockRemark(e.target.value)}
                    placeholder="What are you working on?"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {clockedIn && (
                <div className="mb-6 space-y-3">
                  {allocations.map((a) => {
                    const isActive = a.status === 'ACTIVE';
                    const isCompleted = a.status === 'COMPLETED';
                    const elapsedHrs = isActive && a.started_at ? (nowTick - new Date(a.started_at).getTime()) / 3600000 : 0;
                    const pct = isCompleted ? 100 : Math.min(100, Math.round((elapsedHrs / Math.max(a.allocated_hours, 0.01)) * 100));
                    const overBudget = isActive && elapsedHrs >= a.allocated_hours;
                    return (
                      <div key={a.allocation_id}
                        className={`rounded-2xl border p-4 ${isActive ? 'border-blue-300 bg-blue-50/40' : isCompleted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className={`text-sm font-semibold ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            {projectLabel(a.project_code, projects)}
                          </span>
                          <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            isActive ? (overBudget ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')
                            : isCompleted ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isActive ? (overBudget ? 'Time up' : 'Active') : isCompleted ? 'Completed' : 'Pending'}
                          </span>
                        </div>

                        {!isCompleted && (
                          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden mb-2">
                            <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs text-slate-500">
                          {editingAllocId === a.allocation_id ? (
                            <div className="flex items-center gap-2">
                              <input type="number" min="0.25" step="0.25" autoFocus value={editingHoursVal}
                                onChange={(e) => setEditingHoursVal(e.target.value)}
                                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                              <button onClick={() => handleSaveEditHours(a.allocation_id)} className="text-blue-700 font-semibold">Save</button>
                              <button onClick={() => setEditingAllocId(null)} className="text-slate-400">Cancel</button>
                            </div>
                          ) : (
                            <span>
                              {isActive ? `${fmtHours(elapsedHrs)} of ` : ''}{fmtHours(a.allocated_hours)} planned
                              {!isCompleted && (
                                <button onClick={() => { setEditingAllocId(a.allocation_id); setEditingHoursVal(String(a.allocated_hours)); }}
                                  className="ml-2 text-[#0c3b8f] font-semibold">Edit</button>
                              )}
                            </span>
                          )}

                          {!isCompleted && extendingAllocId !== a.allocation_id && (
                            <div className="flex items-center gap-3">
                              <button onClick={() => handleCompleteAllocation(a.allocation_id)} className="text-slate-600 font-semibold hover:text-slate-900">
                                Mark Complete Now
                              </button>
                              <button onClick={() => { setExtendingAllocId(a.allocation_id); setExtendHoursVal('1'); }} className="text-[#0c3b8f] font-semibold">
                                Extend
                              </button>
                            </div>
                          )}
                          {extendingAllocId === a.allocation_id && (
                            <div className="flex items-center gap-2">
                              <input type="number" min="0.25" step="0.25" autoFocus value={extendHoursVal}
                                onChange={(e) => setExtendHoursVal(e.target.value)}
                                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                              <button onClick={() => handleExtend(a.allocation_id)} className="text-blue-700 font-semibold">+Add</button>
                              <button onClick={() => setExtendingAllocId(null)} className="text-slate-400">Cancel</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {addProjectOpen ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                      <ProjectSearchSelect value={addProjectCode} onChange={setAddProjectCode}
                        projects={projects.filter((p) => !allocations.some((a) => a.project_code === p.project_code))}
                        placeholder="Search or select a project…" />
                      <div className="mt-3 flex gap-2">
                        <button onClick={handleAddProject} disabled={!addProjectCode || addProjectBusy}
                          className="flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: '#0c3b8f' }}>
                          {addProjectBusy ? 'Adding…' : 'Add Project'}
                        </button>
                        <button onClick={() => { setAddProjectOpen(false); setAddProjectCode(''); }}
                          className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddProjectOpen(true)}
                      className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-[#0c3b8f] hover:bg-slate-50">
                      + Add Project
                    </button>
                  )}
                </div>
              )}

              {clockedIn && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                  <textarea rows={2} value={clockRemark} onChange={(e) => setClockRemark(e.target.value)}
                    placeholder="What are you working on?"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {!clockedIn ? (
                <button onClick={handleClockIn} disabled={loading}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
                  style={{ background: '#0c3b8f' }}>
                  {loading ? 'Please wait…' : 'CLOCK IN'}
                </button>
              ) : (
                <button onClick={handleClockOut} disabled={loading}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                  {loading ? 'Please wait…' : 'CLOCK OUT'}
                </button>
              )}

              {message && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium border ${
                  messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
                }`}>{message}</div>
              )}
            </>
          ) : !clockedIn ? (
            <form onSubmit={handleManualClockIn}>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Project</label>
                <ProjectSearchSelect value={manualProject} onChange={setManualProject} projects={projects}
                  placeholder="Search or select a project…" />
              </div>
              <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
                  <input type="date" value={manualClockInDate} max={todayISO} onChange={(e) => setManualClockInDate(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Time</label>
                  <input type="time" value={manualClockInTime} onChange={(e) => setManualClockInTime(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={2} value={manualRemark} onChange={(e) => setManualRemark(e.target.value)}
                  placeholder="What are you working on?"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={manualSubmitting || !manualProject || !manualClockInTime}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
                style={{ background: '#0c3b8f' }}>
                {manualSubmitting ? 'Please wait…' : 'LOG CLOCK IN'}
              </button>
              {manualMessage && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium border ${
                  manualMessageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
                }`}>{manualMessage}</div>
              )}
            </form>
          ) : (
            <form onSubmit={handleManualClockOut}>
              <div className="mb-5 flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-green-700">
                  Active session — {selectedProject === GENERAL ? 'General (non-project)' : selectedProject}
                </span>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
                  <input type="date" value={manualClockOutDate} max={todayISO} onChange={(e) => setManualClockOutDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Time</label>
                  <input type="time" value={manualClockOutTime} onChange={(e) => setManualClockOutTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={2} value={manualRemark} onChange={(e) => setManualRemark(e.target.value)}
                  placeholder="What did you work on?"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={manualSubmitting || !manualClockOutTime}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                {manualSubmitting ? 'Please wait…' : 'CLOCK OUT'}
              </button>
              {manualMessage && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium border ${
                  manualMessageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
                }`}>{manualMessage}</div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

