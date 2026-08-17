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
  const [projectRows, setProjectRows] = useState([{ code: '', hours: STANDARD_WORKDAY_HOURS }]);

  // Active session allocation tracking (after clocking in)
  const [allocations, setAllocations] = useState([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addProjectCode, setAddProjectCode] = useState('');
  const [addProjectBusy, setAddProjectBusy] = useState(false);
  const [modalAllocId, setModalAllocId] = useState(null);
  const [modalHoursVal, setModalHoursVal] = useState('');
  const notifiedRef = useRef(new Set());

  // Manual entry state — same active session, allocation setup, and tracker as Clock In/Out,
  // just typed date/times instead of live "now".
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

  // Re-split the standard 8h workday evenly across however many rows exist, keeping any codes
  // already picked. Used whenever a row is added or removed.
  const resplitProjectRows = (rows) => {
    const hours = evenSplitHours(rows.length);
    return rows.map((r, i) => ({ ...r, hours: hours[i] }));
  };

  const addProjectRow = () => {
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
    let allocationsPayload;
    if (clockMode === 'general') {
      allocationsPayload = [{ projectCode: null, allocatedHours: null }];
    } else {
      if (projectRows.some((r) => !r.code)) { showMsg('Please select a project for every row, or remove it.', 'error'); return; }
      if (projectRows.some((r) => !(parseFloat(r.hours) > 0))) { showMsg('Please enter valid hours for every project.', 'error'); return; }
      allocationsPayload = projectRows.map((r) => ({ projectCode: r.code, allocatedHours: parseFloat(r.hours) }));
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
    try {
      const res = await axios.patch(`${API_BASE}/api/v1/attendance/allocations/${modalAllocId}`, { userId: user.user_id, allocatedHours: hrs });
      setAllocations((prev) => prev.map((a) => (a.allocation_id === modalAllocId ? res.data?.data : a)));
      notifiedRef.current.delete(modalAllocId);
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to update hours.', 'error'); }
    finally { setModalAllocId(null); }
  };

  const handleManualClockIn = async (e) => {
    e.preventDefault();
    if (!user?.user_id) return;
    let allocationsPayload;
    if (clockMode === 'general') {
      allocationsPayload = [{ projectCode: null, allocatedHours: null }];
    } else {
      if (projectRows.some((r) => !r.code)) { setManualMessage('Please select a project for every row, or remove it.'); setManualMessageType('error'); return; }
      if (projectRows.some((r) => !(parseFloat(r.hours) > 0))) { setManualMessage('Please enter valid hours for every project.'); setManualMessageType('error'); return; }
      allocationsPayload = projectRows.map((r) => ({ projectCode: r.code, allocatedHours: parseFloat(r.hours) }));
    }
    if (!manualClockInDate) { setManualMessage('Please select a date.'); setManualMessageType('error'); return; }
    if (!manualClockInTime) { setManualMessage('Please enter a clock-in time.'); setManualMessageType('error'); return; }
    setManualSubmitting(true); setManualMessage('');
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    // Silently attempt location capture in the background, same as live Clock In
    const coords = await requestLocationSilently();
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/clock-in`, {
        userId: user.user_id,
        isManualLocation: !coords.latitude,
        latitude: coords.latitude,
        longitude: coords.longitude,
        clockInTime: combineDateTime(manualClockInDate, manualClockInTime),
        remark: manualRemark.trim() || undefined,
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
      const res = await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, {
        userId: user.user_id, attendanceId,
        clockOutTime: combineDateTime(manualClockOutDate, manualClockOutTime),
        remark: manualRemark.trim() || undefined,
      });
      const recon = res.data?.data?.reconciliation;
      setClockedIn(false); setAttendanceId(null); setAllocations([]);
      sessionStorage.removeItem('staff_attendance_id');
      sessionStorage.removeItem('staff_attendance_project');
      sessionStorage.removeItem('staff_attendance_user_id');
      if (recon?.mismatch) {
        setManualMessage(`Clock-out logged. Note: you planned ${fmtHours(recon.totalAllocatedHours)} across your projects, but actually worked ${fmtHours(recon.actualWorkedHours)}. Recorded hours use your actual clock time.`);
      } else {
        setManualMessage('Clock-out logged. Hours have been recorded.');
      }
      setManualMessageType('success');
      setManualClockOutDate(todayISOStr()); setManualClockOutTime(nowHHMM()); setManualRemark('');
    } catch (e) { setManualMessage(e.response?.data?.error || 'Manual clock-out failed.'); setManualMessageType('error'); }
    finally { setManualSubmitting(false); }
  };

  // Shared between Clock In/Out and Manual Entry — both hit the same clock-in/out endpoints and
  // the same active session, so the setup form and the live tracker work identically either way.
  const projectSetupUI = (
    <>
      <div className="mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-3">Select Work Type</label>
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

      {clockMode === 'projects' && (() => {
        const totalRowHours = projectRows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
        const totalMatches = Math.abs(totalRowHours - STANDARD_WORKDAY_HOURS) < 0.01;
        return (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Projects</label>
            <p className="text-xs text-slate-400 mb-4">Hours auto-split across projects. Adjust as needed.</p>
            <div className="space-y-4">
              {projectRows.map((row, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="flex-1 min-w-0">
                    <ProjectSearchSelect
                      value={row.code}
                      onChange={(code) => setProjectRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, code } : r)))}
                      projects={projects.filter((p) => !projectRows.some((r, idx) => idx !== i && r.code === p.project_code))}
                      placeholder="Select or search project…"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input type="number" min="0.25" step="0.25" value={row.hours}
                      onChange={(e) => setProjectRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, hours: e.target.value } : r)))}
                      className="w-16 rounded-xl border-2 border-[#D1D5DB] px-2 py-3 text-sm text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    <span className="text-xs text-slate-400">hrs</span>
                  </div>
                  {projectRows.length > 1 && (
                    <button type="button" onClick={() => removeProjectRow(i)} title="Remove project"
                      className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-red-500 transition">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className={`mt-3 text-xs font-semibold ${totalMatches ? 'text-slate-400' : 'text-amber-600'}`}>
              Total: {totalRowHours.toFixed(2)} / {STANDARD_WORKDAY_HOURS} hrs
            </p>
            {projectRows.length < 8 && (
              <button type="button" onClick={addProjectRow}
                className="mt-4 w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-[#0c3b8f] hover:bg-slate-50">
                + Add Project
              </button>
            )}
          </div>
        );
      })()}
    </>
  );

  const totalAllocatedHours = allocations.reduce((sum, a) => sum + Number(a.allocated_hours || 0), 0);

  const allocationTracker = (
    <div className="mb-6 space-y-3">
      {allocations.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Allocated</span>
          <span className={`text-xs font-bold ${totalAllocatedHours > STANDARD_WORKDAY_HOURS ? 'text-amber-600' : 'text-slate-600'}`}>
            {fmtHours(totalAllocatedHours)} of {fmtHours(STANDARD_WORKDAY_HOURS)}
          </span>
        </div>
      )}
      {allocations.map((a) => {
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
                <button type="button" title="Edit"
                  onClick={() => { setModalAllocId(a.allocation_id); setModalHoursVal(String(a.allocated_hours)); }}
                  className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </div>
            </div>

            {!isCompleted && (
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-amber-500' : isPaused ? 'bg-indigo-400' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
              </div>
            )}

            <span className="text-xs text-slate-500">
              {(isActive || isPaused) ? `${fmtHours(trackedHrs)} tracked of ` : ''}{fmtHours(a.allocated_hours)} planned
              {isPaused && ' (paused)'}
              {a.edited_after_completion && <span className="ml-1.5 text-amber-600">· edited after completion</span>}
            </span>
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

      {modalAllocId && (() => {
        const modalAlloc = allocations.find((a) => a.allocation_id === modalAllocId);
        if (!modalAlloc) return null;
        const isActive = modalAlloc.status === 'ACTIVE';
        const isCompletedModal = modalAlloc.status === 'COMPLETED';
        const modalAccumulated = Number(modalAlloc.accumulated_hours || 0);
        const modalIsPaused = !isActive && !isCompletedModal && modalAccumulated > 0;
        const modalLiveElapsedHrs = isActive && modalAlloc.started_at ? (nowTick - new Date(modalAlloc.started_at).getTime()) / 3600000 : 0;
        const modalTrackedHrs = modalAccumulated + modalLiveElapsedHrs;
        const stepHours = (delta) => {
          const current = parseFloat(modalHoursVal) || 0;
          setModalHoursVal(String(Math.max(0.25, Math.round((current + delta) * 100) / 100)));
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
                <p className="text-lg font-semibold text-slate-900">Edit Allocation</p>
                <span className={`flex-shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-blue-100 text-blue-700' : isCompletedModal ? 'bg-slate-200 text-slate-500' : modalIsPaused ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {isActive ? 'Active' : isCompletedModal ? 'Completed' : modalIsPaused ? 'Paused' : 'Pending'}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-700">{projectLabel(modalAlloc.project_code, projects)}</p>
              {(isActive || modalIsPaused) ? (
                <p className="text-[11px] text-slate-400 mt-1 mb-8">
                  {fmtHours(modalTrackedHrs)} tracked so far of {fmtHours(modalAlloc.allocated_hours)} planned{modalIsPaused ? ' (paused)' : ''}
                </p>
              ) : (
                <div className="mb-8" />
              )}

              <label className="block text-sm font-semibold text-slate-700 mb-2">Allocated Hours</label>
              <div className="flex items-center gap-2 mb-6">
                <button type="button" onClick={() => stepHours(-0.25)}
                  className="flex-shrink-0 w-11 h-11 rounded-xl border-2 border-[#D1D5DB] text-slate-600 text-lg font-semibold hover:bg-slate-50 transition">−</button>
                <input type="number" min="0.25" step="0.25" autoFocus value={modalHoursVal} placeholder="e.g. 2.5"
                  onChange={(e) => setModalHoursVal(e.target.value)}
                  className="w-full min-w-0 rounded-xl border-2 border-[#D1D5DB] px-4 py-3 text-sm text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <button type="button" onClick={() => stepHours(0.25)}
                  className="flex-shrink-0 w-11 h-11 rounded-xl border-2 border-[#D1D5DB] text-slate-600 text-lg font-semibold hover:bg-slate-50 transition">+</button>
              </div>

              <button onClick={handleSaveEditHours}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition" style={{ background: '#0c3b8f' }}>
                Save Changes
              </button>
              {isCompletedModal ? (
                <button onClick={handleReopen}
                  className="w-full mt-3 py-1 text-sm font-semibold text-[#0c3b8f] hover:underline text-center transition">
                  Reopen — I'm still working on this
                </button>
              ) : (
                <button onClick={handleModalMarkComplete}
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

  const manualProjectSetupDisabled = clockMode === 'projects' && projectRows.some((r) => !r.code);

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

              {message && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium border ${
                  messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
                }`}>{message}</div>
              )}
            </>
          ) : !clockedIn ? (
            <form onSubmit={handleManualClockIn}>
              {projectSetupUI}
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
                  placeholder="Add notes or specific tasks (optional)"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={manualSubmitting || !manualClockInTime || manualProjectSetupDisabled}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
                style={{ background: '#0c3b8f' }}>
                {manualSubmitting ? 'Please wait…' : 'Clock In'}
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
                <span className="text-sm font-semibold text-green-700">Active session</span>
              </div>

              {allocationTracker}

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
                {manualSubmitting ? 'Please wait…' : 'Clock Out'}
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

