"use client";

import React, { useEffect, useState } from 'react';
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

  // Manual entry state
  const [manualProject, setManualProject] = useState('');
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualRemark, setManualRemark] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState('');
  const [manualMessageType, setManualMessageType] = useState('');
  const [showHelp, setShowHelp] = useState(false);

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
          sessionStorage.setItem('staff_attendance_id', active.attendance_id);
          sessionStorage.setItem('staff_attendance_project', active.project_code || '');
          sessionStorage.setItem('staff_attendance_user_id', user.user_id);
        } else {
          setClockedIn(false);
          setAttendanceId(null);
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
  }, [user?.user_id]);

  useEffect(() => {
    if (!user?.user_id) return;
    axios.get(`${API_BASE}/api/v1/projects/active-list?userId=${user.user_id}`)
      .then((r) => setProjects(r.data?.data || [])).catch(() => {});
  }, [user?.user_id]);

  const showMsg = (text, type) => { setMessage(text); setMessageType(type); };

  const handleClockIn = async () => {
    if (!selectedProject) { showMsg('Please select a project, or "General (non-project)".', 'error'); return; }
    if (!user?.user_id) return;
    setLoading(true); setMessage('');
    // Silently attempt location capture in the background
    const coords = await requestLocationSilently();
    const projectCode = selectedProject === GENERAL ? undefined : selectedProject;
    try {
      const res = await axios.post(`${API_BASE}/api/v1/attendance/clock-in`, {
        userId: user.user_id,
        projectCode,
        isManualLocation: !coords.latitude,
        latitude: coords.latitude,
        longitude: coords.longitude,
        remark: clockRemark.trim() || undefined,
      });
      const id = res.data?.data?.attendance_id;
      setAttendanceId(id); setClockedIn(true);
      sessionStorage.setItem('staff_attendance_id', id);
      sessionStorage.setItem('staff_attendance_project', selectedProject);
      sessionStorage.setItem('staff_attendance_user_id', user.user_id);
      showMsg('Clocked in successfully.', 'success');
    } catch (e) { showMsg(e.response?.data?.error || 'Clock-in failed.', 'error'); }
    finally { setLoading(false); }
  };

  const handleClockOut = async () => {
    if (!attendanceId || !user?.user_id) return;
    setLoading(true); setMessage('');
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/clock-out`, {
        userId: user.user_id, attendanceId, remark: clockRemark.trim() || undefined,
      });
      setClockedIn(false); setAttendanceId(null); setClockRemark('');
      sessionStorage.removeItem('staff_attendance_id');
      sessionStorage.removeItem('staff_attendance_project');
      sessionStorage.removeItem('staff_attendance_user_id');
      showMsg('Clocked out. Hours have been recorded.', 'success');
    } catch (e) { showMsg(e.response?.data?.error || 'Clock-out failed.', 'error'); }
    finally { setLoading(false); }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!user?.user_id) return;
    if (!manualStart || !manualEnd) { setManualMessage('Please enter both a start and end time.'); setManualMessageType('error'); return; }
    setManualSubmitting(true); setManualMessage('');
    try {
      await axios.post(`${API_BASE}/api/v1/attendance/manual-entry`, {
        userId: user.user_id,
        projectCode: manualProject === GENERAL || !manualProject ? undefined : manualProject,
        startTime: manualStart,
        endTime: manualEnd,
        remark: manualRemark.trim() || undefined,
      });
      setManualMessage('Time entry logged successfully.'); setManualMessageType('success');
      setManualProject(''); setManualStart(''); setManualEnd(''); setManualRemark('');
    } catch (e) { setManualMessage(e.response?.data?.error || 'Manual entry failed.'); setManualMessageType('error'); }
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

      {showHelp && (
        <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm max-w-2xl">
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

      <div className="grid gap-6">
        {/* Log Time card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm max-w-2xl">
          {/* Segment tabs */}
          <div className="mb-6 flex gap-2 rounded-2xl bg-slate-100 p-1">
            <button type="button" onClick={() => setLogTab('clock')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${logTab === 'clock' ? 'bg-white shadow-sm text-[#0c3b8f]' : 'text-slate-500'}`}>
              Clock In/Out
            </button>
            <button type="button" onClick={() => setLogTab('manual')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${logTab === 'manual' ? 'bg-white shadow-sm text-[#0c3b8f]' : 'text-slate-500'}`}>
              Manual Entry
            </button>
          </div>

          {logTab === 'clock' ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${clockedIn ? 'bg-green-500' : 'bg-slate-300'}`} />
                <span className={`text-sm font-semibold ${clockedIn ? 'text-green-700' : 'text-slate-500'}`}>
                  {clockedIn ? `Active session — ${selectedProject === GENERAL ? 'General (non-project)' : selectedProject}` : 'Not clocked in'}
                </span>
              </div>

              {!clockedIn && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Select Project</label>
                  <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select a project…</option>
                    <option value={GENERAL}>General (non-project)</option>
                    {projects.map((p) => (
                      <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={2} value={clockRemark} onChange={(e) => setClockRemark(e.target.value)}
                  placeholder="What are you working on?"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {!clockedIn ? (
                <button onClick={handleClockIn} disabled={loading || !selectedProject}
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
          ) : (
            <form onSubmit={handleManualSubmit}>
              <p className="mb-5 text-sm text-slate-500">Forgot to clock in? Enter your actual start and end time directly.</p>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Project</label>
                <select value={manualProject} onChange={(e) => setManualProject(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value={GENERAL}>General (non-project)</option>
                  {projects.map((p) => (
                    <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Start Time</label>
                  <input type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">End Time</label>
                  <input type="datetime-local" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Remark <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={2} value={manualRemark} onChange={(e) => setManualRemark(e.target.value)}
                  placeholder="What did you work on?"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={manualSubmitting || !manualStart || !manualEnd}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition"
                style={{ background: '#0c3b8f' }}>
                {manualSubmitting ? 'Please wait…' : 'LOG TIME'}
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

