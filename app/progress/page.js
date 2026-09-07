"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function StatusPill({ status }) {
  const s = String(status || '').toUpperCase();
  const map = {
    APPROVED: 'bg-green-50 text-green-700', REJECTED: 'bg-red-50 text-red-600',
    PENDING: 'bg-yellow-50 text-yellow-700', MANAGER_APPROVED: 'bg-blue-50 text-blue-700',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-600'}`}>{s.replace('_', ' ')}</span>;
}

function SourceBadge({ isAuto }) {
  return isAuto
    ? <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-purple-50 text-purple-700">Auto</span>
    : <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-sky-50 text-sky-700">Manual</span>;
}

const isAutoEntry = (summary) => String(summary || '').startsWith('Auto-progress baseline');

function ProgressContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [progressHistory, setProgressHistory] = useState([]);
  const [budgetRequests, setBudgetRequests] = useState([]);
  const [allocations, setAllocations] = useState([]); // user's approved hour allocations per project
  const [tab, setTab] = useState(searchParams.get('tab') === 'budget' ? 'budget' : 'progress');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Toast notifications — small auto-dismissing pill, matching the attendance page's pattern.
  const [toast, setToast] = useState(null); // { text, type }
  const toastTimeoutRef = useRef(null);
  const showToast = (text, type) => {
    setToast({ text, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  const [showProgressForm, setShowProgressForm] = useState(false);
  const [progressProject, setProgressProject] = useState('');
  const [progressPct, setProgressPct] = useState('');
  const [progressSummary, setProgressSummary] = useState('');
  const [progressFieldErrors, setProgressFieldErrors] = useState([]); // 'project' | 'pct'

  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetProject, setBudgetProject] = useState('');
  const [budgetHours, setBudgetHours] = useState('');
  const [budgetJustification, setBudgetJustification] = useState('');
  const [budgetFieldErrors, setBudgetFieldErrors] = useState([]); // 'project' | 'hours'

  // Editing/deleting an already-submitted progress entry (manual entries only — system-generated
  // "Auto-progress baseline" rows can't be touched, see isAutoEntry above).
  const [editingProgressLog, setEditingProgressLog] = useState(null);
  const [editProgressPct, setEditProgressPct] = useState('');
  const [editProgressSummary, setEditProgressSummary] = useState('');
  const [deleteProgressConfirm, setDeleteProgressConfirm] = useState(null);

  // Editing/deleting a budget request — only while it's still PENDING (once a manager or AM has
  // acted on it, the review decision is final and it can no longer be changed).
  const [editingBudgetRequest, setEditingBudgetRequest] = useState(null);
  const [editBudgetHours, setEditBudgetHours] = useState('');
  const [editBudgetJustification, setEditBudgetJustification] = useState('');
  const [deleteBudgetConfirm, setDeleteBudgetConfirm] = useState(null);

  // Progress history filters
  const [progressSearch, setProgressSearch] = useState('');
  const [progressStatusFilter, setProgressStatusFilter] = useState('ALL'); // ALL | COMPLETED | ONGOING | DELETED

  // Budget history filters
  const [budgetStatusFilter, setBudgetStatusFilter] = useState('ALL');
  const [budgetSearch, setBudgetSearch] = useState('');
  const [expandedBudgetId, setExpandedBudgetId] = useState(null);

  const historyRef = useRef(null);

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
      const [projRes, progressRes, budgetRes, allocRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/projects/active-list?userId=${uid}`).catch(() => null),
        axios.get(`${API_BASE}/api/v1/projects/progress-history/${uid}`).catch(() => null),
        axios.get(`${API_BASE}/api/v1/projects/budget-requests/mine/${uid}`).catch(() => null),
        axios.get(`${API_BASE}/api/v1/allocations/${uid}`).catch(() => null),
      ]);
      setProjects(projRes?.data?.data || []);
      setProgressHistory(progressRes?.data?.data || []);
      setBudgetRequests(budgetRes?.data?.data || []);
      setAllocations(allocRes?.data?.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.user_id) fetchData(user.user_id); }, [user?.user_id, fetchData]);

  // The latest logged completion % for a project — shown as context in the update form, since
  // staff now enter how much progress they made, not the running total from scratch.
  const getCurrentPct = (code) => {
    const log = progressHistory.find((h) => h.project_code === code);
    return log ? Math.min(100, Math.max(0, Number(log.completion_percentage || 0))) : 0;
  };

  const handleProgressSubmit = async (e) => {
    e.preventDefault();
    const missing = [];
    if (!progressProject) missing.push('project');
    if (!progressPct) missing.push('pct');
    if (missing.length > 0) {
      setProgressFieldErrors(missing);
      showToast('Please fill in the highlighted field(s).', 'error');
      return;
    }
    const pct = parseFloat(progressPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setProgressFieldErrors(['pct']);
      showToast('Progress added must be greater than 0 and at most 100.', 'error'); return;
    }
    setProgressFieldErrors([]);
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/v1/projects/progress-log`, {
        projectCode: progressProject, reporterId: user.user_id,
        completionPercentage: pct, progressSummary: progressSummary.trim() || `Progress update: +${pct}%`,
      });
      showToast('Progress logged successfully.', 'success');
      setShowProgressForm(false); setProgressPct(''); setProgressSummary(''); setProgressProject('');
      await fetchData(user.user_id);
    } catch (err) { showToast(err.response?.data?.error || 'Submission failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    const missing = [];
    if (!budgetProject) missing.push('project');
    if (!budgetHours) missing.push('hours');
    if (missing.length > 0) {
      setBudgetFieldErrors(missing);
      showToast('Please fill in the highlighted field(s).', 'error');
      return;
    }
    const hrs = parseFloat(budgetHours);
    if (isNaN(hrs) || hrs <= 0) {
      setBudgetFieldErrors(['hours']);
      showToast('Hours must be a positive number.', 'error'); return;
    }
    setBudgetFieldErrors([]);
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/v1/projects/budget-request`, {
        userId: user.user_id, projectCode: budgetProject,
        requestedHours: hrs, justification: budgetJustification.trim() || undefined,
      });
      showToast('Budget request submitted successfully.', 'success');
      setShowBudgetForm(false); setBudgetHours(''); setBudgetJustification(''); setBudgetProject('');
      await fetchData(user.user_id);
    } catch (err) { showToast(err.response?.data?.error || 'Submission failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const openEditProgressLog = (log) => {
    setEditingProgressLog(log);
    setEditProgressPct(String(log.completion_percentage));
    setEditProgressSummary(log.progress_summary || '');
  };

  const submitEditProgressLog = async (e) => {
    e.preventDefault();
    const pct = parseFloat(editProgressPct);
    if (isNaN(pct) || pct < 0 || pct > 100) { showToast('Completion % must be between 0 and 100.', 'error'); return; }
    setSubmitting(true);
    try {
      await axios.patch(`${API_BASE}/api/v1/projects/progress-log/${editingProgressLog.log_id}`, {
        userId: user.user_id, completionPercentage: pct, progressSummary: editProgressSummary.trim(),
      });
      showToast('Progress entry updated.', 'success');
      setEditingProgressLog(null);
      await fetchData(user.user_id);
    } catch (err) { showToast(err.response?.data?.error || 'Update failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const confirmDeleteProgressLog = async () => {
    if (!deleteProgressConfirm) return;
    setSubmitting(true);
    try {
      await axios.delete(`${API_BASE}/api/v1/projects/progress-log/${deleteProgressConfirm.log_id}`, { data: { userId: user.user_id } });
      showToast('Progress entry deleted.', 'success');
      setDeleteProgressConfirm(null);
      await fetchData(user.user_id);
    } catch (err) { showToast(err.response?.data?.error || 'Delete failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const openEditBudgetRequest = (req) => {
    setEditingBudgetRequest(req);
    setEditBudgetHours(String(req.requested_hours));
    setEditBudgetJustification(req.justification || '');
  };

  const submitEditBudgetRequest = async (e) => {
    e.preventDefault();
    const hrs = parseFloat(editBudgetHours);
    if (isNaN(hrs) || hrs <= 0) { showToast('Hours must be a positive number.', 'error'); return; }
    setSubmitting(true);
    try {
      await axios.patch(`${API_BASE}/api/v1/projects/budget-request/${editingBudgetRequest.request_id}`, {
        userId: user.user_id, requestedHours: hrs, justification: editBudgetJustification.trim() || undefined,
      });
      showToast('Budget request updated.', 'success');
      setEditingBudgetRequest(null);
      await fetchData(user.user_id);
    } catch (err) { showToast(err.response?.data?.error || 'Update failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const confirmDeleteBudgetRequest = async () => {
    if (!deleteBudgetConfirm) return;
    setSubmitting(true);
    try {
      await axios.delete(`${API_BASE}/api/v1/projects/budget-request/${deleteBudgetConfirm.request_id}`, { data: { userId: user.user_id } });
      showToast('Budget request deleted.', 'success');
      setDeleteBudgetConfirm(null);
      await fetchData(user.user_id);
    } catch (err) { showToast(err.response?.data?.error || 'Delete failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const scrollToHistory = () => {
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredProgressHistory = progressHistory.filter((r) => {
    const q = progressSearch.trim().toLowerCase();
    if (q && !String(r.project_code || '').toLowerCase().includes(q) && !String(r.project_name || '').toLowerCase().includes(q)) return false;
    const isDeleted = !r.project_name;
    const isCompleted = Number(r.completion_percentage) >= 100;
    if (progressStatusFilter === 'DELETED' && !isDeleted) return false;
    if (progressStatusFilter === 'COMPLETED' && !(isCompleted && !isDeleted)) return false;
    if (progressStatusFilter === 'ONGOING' && !(!isCompleted && !isDeleted)) return false;
    return true;
  });

  const filteredBudgetRequests = budgetRequests.filter((r) => {
    if (budgetStatusFilter !== 'ALL' && String(r.status).toUpperCase() !== budgetStatusFilter) return false;
    const q = budgetSearch.trim().toLowerCase();
    if (q && !String(r.project_code || '').toLowerCase().includes(q) && !String(r.project_name || '').toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="p-8">
      <div className="mb-10">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Progress & Budget</h1>
        <p className="mt-2 text-sm text-slate-500">Log project progress updates and request additional budget hours.</p>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 w-fit shadow-sm">
        <button onClick={() => setTab('progress')}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'progress' ? 'bg-[#1a3a8f] text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}>
          Progress
        </button>
        <button onClick={() => setTab('budget')}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'budget' ? 'bg-[#1a3a8f] text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}>
          Budget
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white' : 'bg-slate-900 border-slate-950 text-white'
          }`}>
            {toast.text}
          </div>
        </div>
      )}

      {tab === 'progress' ? (
        <>
          {/* ── Visual project progress cards ── */}
          {!loading && allocations.length > 0 && (
            <div className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {allocations.map((alloc) => {
                // Get the latest logged progress for this project
                const latestLog = progressHistory.find((h) => h.project_code === alloc.project_code);
                const pct = latestLog ? Math.min(100, Math.max(0, Number(latestLog.completion_percentage || 0))) : 0;
                const isComplete = pct >= 100;
                const totalHrs = Number(alloc.hours_per_week || 0);
                const usedHrs = +(pct / 100 * totalHrs).toFixed(2);
                const remainingHrs = +(totalHrs - usedHrs).toFixed(2);
                const projName = alloc.project_name || projects.find((p) => p.project_code === alloc.project_code)?.project_name || alloc.project_code;

                // Colour changes based on progress
                const barColor = pct >= 80 ? '#16a34a' : pct >= 40 ? '#1a3a8f' : '#0c3b8f';
                const bgColor = pct >= 80 ? '#f0fdf4' : '#EEF4FF';

                return (
                  <div key={alloc.allocation_id || alloc.project_code}
                    className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                    {/* Project header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{alloc.project_code}</p>
                        <p className="mt-0.5 text-base font-bold text-slate-900 truncate max-w-[160px]">{projName}</p>
                      </div>
                      {/* Circular progress badge */}
                      <div className="relative flex items-center justify-center flex-shrink-0"
                        style={{ width: 56, height: 56 }}>
                        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                          <circle cx="28" cy="28" r="22" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                          <circle cx="28" cy="28" r="22" fill="none" stroke={barColor} strokeWidth="5"
                            strokeDasharray={`${2 * Math.PI * 22}`}
                            strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
                            strokeLinecap="round" />
                        </svg>
                        <span className="absolute text-xs font-bold" style={{ color: barColor }}>{pct.toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* Linear progress bar */}
                    <div className="mb-4">
                      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-2.5 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <div className="flex justify-between mt-1.5 text-xs text-slate-400">
                        <span>0%</span><span>50%</span><span>100%</span>
                      </div>
                    </div>

                    {/* Hours stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-2xl p-3" style={{ background: bgColor }}>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Used</p>
                        <p className="mt-1 text-lg font-bold" style={{ color: barColor }}>{usedHrs}</p>
                        <p className="text-xs text-slate-400">hrs</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</p>
                        <p className="mt-1 text-lg font-bold text-slate-800">{totalHrs}</p>
                        <p className="text-xs text-slate-400">hrs</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Left</p>
                        <p className="mt-1 text-lg font-bold text-slate-800">{remainingHrs}</p>
                        <p className="text-xs text-slate-400">hrs</p>
                      </div>
                    </div>

                    {/* Spacer pushes the footer (timestamp + button) to the bottom of the card */}
                    <div className="flex-1" />

                    {latestLog && (
                      <p className="mt-3 text-xs text-slate-400 text-right">
                        Last update: {String(latestLog.logged_at).slice(0, 10)}
                      </p>
                    )}

                    {isComplete ? (
                      <button type="button"
                        onClick={scrollToHistory}
                        className="mt-4 w-full rounded-2xl py-2 text-xs font-bold text-white transition"
                        style={{ background: '#16a34a' }}>
                        View History
                      </button>
                    ) : (
                      <button type="button"
                        onClick={() => { setProgressProject(alloc.project_code); setShowProgressForm(true); setProgressFieldErrors([]); }}
                        className="mt-4 w-full rounded-2xl py-2 text-xs font-bold text-white transition"
                        style={{ background: '#0c3b8f' }}>
                        + Update
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showProgressForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowProgressForm(false); } }}>
              <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">New Progress Entry</p>
                  <button type="button" onClick={() => { setShowProgressForm(false); }} aria-label="Close"
                    className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <form onSubmit={handleProgressSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Project</label>
                    <select value={progressProject} onChange={(e) => { setProgressProject(e.target.value); setProgressFieldErrors([]); }}
                      className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${progressFieldErrors.includes('project') ? 'border-red-400' : 'border-slate-300'}`}>
                      <option value="">Select project…</option>
                      {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
                    </select>
                    {progressProject && (
                      <p className="mt-2 text-xs text-slate-400">Current progress: {getCurrentPct(progressProject).toFixed(0)}%</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Progress Made <span className="font-normal text-slate-400">(added to your current progress)</span></label>
                    <input type="number" min="0.1" max={progressProject ? Math.max(0.1, 100 - getCurrentPct(progressProject)) : 100} step="0.1"
                      value={progressPct} onChange={(e) => { setProgressPct(e.target.value); setProgressFieldErrors([]); }} placeholder="e.g. 10"
                      className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${progressFieldErrors.includes('pct') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Summary <span className="font-normal text-slate-400">(optional)</span></label>
                    <textarea rows={3} value={progressSummary} onChange={(e) => setProgressSummary(e.target.value)} placeholder="What did you work on?"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                    {submitting ? 'Please wait…' : 'SUBMIT PROGRESS'}
                  </button>
                </form>
              </div>
            </div>
          )}

          <div ref={historyRef} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden scroll-mt-6">
            <div className="px-6 py-5 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Progress Log</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-wrap gap-1.5">
                {['ALL', 'ONGOING', 'COMPLETED', 'DELETED'].map((s) => (
                  <button key={s} type="button" onClick={() => setProgressStatusFilter(s)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      progressStatusFilter === s ? 'bg-[#1a3a8f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="relative w-64">
                <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" value={progressSearch} onChange={(e) => setProgressSearch(e.target.value)}
                  placeholder="Search project code or name…"
                  className="rounded-2xl border border-slate-200 bg-white pl-9 pr-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full" />
              </div>
            </div>

            {loading ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">Loading…</p>
            ) : filteredProgressHistory.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">
                {progressHistory.length === 0 ? "You haven't logged any progress yet." : 'No progress logs match this filter.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-6 py-4 whitespace-nowrap">Project</th>
                      <th className="px-6 py-4 whitespace-nowrap">Completion</th>
                      <th className="px-6 py-4 whitespace-nowrap">Source</th>
                      <th className="px-6 py-4 whitespace-nowrap">Summary</th>
                      <th className="px-6 py-4 whitespace-nowrap">Logged</th>
                      <th className="px-6 py-4 whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredProgressHistory.slice(0, 50).map((r) => {
                      const isAuto = isAutoEntry(r.progress_summary);
                      return (
                      <tr key={r.log_id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">
                          {r.project_code}{!r.project_name && <span className="ml-1.5 text-xs font-normal text-red-500">(deleted)</span>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 rounded-full bg-slate-100 shrink-0">
                              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, Number(r.completion_percentage))}%`, background: '#1a3a8f' }} />
                            </div>
                            <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">{Number(r.completion_percentage).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap"><SourceBadge isAuto={isAuto} /></td>
                        <td className="px-6 py-4 text-slate-500 max-w-[220px] truncate">{r.progress_summary || '—'}</td>
                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{String(r.logged_at).slice(0, 10)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {!isAuto && (
                            <div className="flex items-center justify-end gap-3">
                              <button type="button" onClick={() => openEditProgressLog(r)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                              <button type="button" onClick={() => setDeleteProgressConfirm(r)} className="text-xs font-semibold text-red-500 hover:text-red-700">Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {showBudgetForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowBudgetForm(false); } }}>
              <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">New Budget Request</p>
                  <button type="button" onClick={() => { setShowBudgetForm(false); }} aria-label="Close"
                    className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <form onSubmit={handleBudgetSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Project</label>
                    <select value={budgetProject} onChange={(e) => { setBudgetProject(e.target.value); setBudgetFieldErrors([]); }}
                      className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${budgetFieldErrors.includes('project') ? 'border-red-400' : 'border-slate-300'}`}>
                      <option value="">Select project…</option>
                      {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Additional Hours Requested</label>
                    <input type="number" min="0.5" step="0.5" value={budgetHours} onChange={(e) => { setBudgetHours(e.target.value); setBudgetFieldErrors([]); }}
                      className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${budgetFieldErrors.includes('hours') ? 'border-red-400' : 'border-slate-300'}`} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Justification <span className="font-normal text-slate-400">(optional)</span></label>
                    <textarea rows={3} value={budgetJustification} onChange={(e) => setBudgetJustification(e.target.value)} placeholder="Explain why additional hours are needed…"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                    {submitting ? 'Please wait…' : 'SUBMIT REQUEST'}
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Budget Requests</p>
              <button onClick={() => { setShowBudgetForm(!showBudgetForm); setBudgetFieldErrors([]); }}
                className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
                style={{ background: showBudgetForm ? '#64748b' : '#0c3b8f' }}>
                {showBudgetForm ? 'Cancel' : '+ Request Additional Hours'}
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-wrap gap-1.5">
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
                  <button key={s} type="button" onClick={() => setBudgetStatusFilter(s)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      budgetStatusFilter === s ? 'bg-[#1a3a8f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}>
                    {s.replace('_', ' ').charAt(0) + s.replace('_', ' ').slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="relative w-64">
                <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" value={budgetSearch} onChange={(e) => setBudgetSearch(e.target.value)}
                  placeholder="Search project code or name…"
                  className="rounded-2xl border border-slate-200 bg-white pl-9 pr-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full" />
              </div>
            </div>

            {loading ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">Loading…</p>
            ) : filteredBudgetRequests.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">
                {budgetRequests.length === 0 ? "You haven't submitted any budget requests yet." : 'No budget requests match this filter.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-6 py-4 whitespace-nowrap">Project</th>
                      <th className="px-6 py-4 whitespace-nowrap">Hours</th>
                      <th className="px-6 py-4 whitespace-nowrap">Status</th>
                      <th className="px-6 py-4">Reason</th>
                      <th className="px-6 py-4 whitespace-nowrap">Details</th>
                      <th className="px-6 py-4 whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredBudgetRequests.map((r) => {
                      const isOpen = expandedBudgetId === r.request_id;
                      return (
                        <React.Fragment key={r.request_id}>
                          <tr className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">{r.project_code}</td>
                            <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{r.requested_hours}</td>
                            <td className="px-6 py-4 whitespace-nowrap"><StatusPill status={r.status} /></td>
                            <td className="px-6 py-4 text-slate-500 max-w-[220px] truncate">{r.justification || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button type="button" onClick={() => setExpandedBudgetId(isOpen ? null : r.request_id)}
                                aria-label={isOpen ? 'Hide details' : 'View details'}
                                className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                  className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              {r.status === 'PENDING' && (
                                <div className="flex items-center justify-end gap-3">
                                  <button type="button" onClick={() => openEditBudgetRequest(r)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                                  <button type="button" onClick={() => setDeleteBudgetConfirm(r)} className="text-xs font-semibold text-red-500 hover:text-red-700">Delete</button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50/60">
                              <td colSpan={6} className="px-6 py-4">
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Justification</p>
                                    <p className="mt-0.5 text-sm text-slate-700">{r.justification || '—'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Reviewer Remarks</p>
                                    <p className="mt-0.5 text-sm text-slate-700">{r.reviewer_remarks || '—'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Submitted</p>
                                    <p className="mt-0.5 text-sm text-slate-700">{r.created_at ? String(r.created_at).slice(0, 10) : '—'}</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {editingProgressLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingProgressLog(null); }}>
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Edit Progress Entry</p>
              <button type="button" onClick={() => setEditingProgressLog(null)} aria-label="Close"
                className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={submitEditProgressLog} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Completion % <span className="font-normal text-slate-400">(0 – 100)</span></label>
                <input type="number" min="0" max="100" step="0.1" value={editProgressPct} onChange={(e) => setEditProgressPct(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Summary <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={3} value={editProgressSummary} onChange={(e) => setEditProgressSummary(e.target.value)} placeholder="What did you work on?"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={submitting} className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                {submitting ? 'Please wait…' : 'SAVE'}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteProgressConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteProgressConfirm(null); }}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-lg font-semibold text-slate-900 mb-2">Delete this progress entry?</p>
            <p className="text-sm text-slate-500 mb-6">
              {deleteProgressConfirm.project_code} &middot; {Number(deleteProgressConfirm.completion_percentage).toFixed(0)}% &middot; this can't be undone.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteProgressConfirm(null)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteProgressLog} disabled={submitting}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                {submitting ? 'Please wait…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingBudgetRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingBudgetRequest(null); }}>
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Edit Budget Request</p>
              <button type="button" onClick={() => setEditingBudgetRequest(null)} aria-label="Close"
                className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={submitEditBudgetRequest} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Additional Hours Requested</label>
                <input type="number" min="0.5" step="0.5" value={editBudgetHours} onChange={(e) => setEditBudgetHours(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Justification <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={3} value={editBudgetJustification} onChange={(e) => setEditBudgetJustification(e.target.value)} placeholder="Explain why additional hours are needed…"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={submitting} className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                {submitting ? 'Please wait…' : 'SAVE'}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteBudgetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteBudgetConfirm(null); }}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-lg font-semibold text-slate-900 mb-2">Delete this budget request?</p>
            <p className="text-sm text-slate-500 mb-6">
              {deleteBudgetConfirm.project_code} &middot; {deleteBudgetConfirm.requested_hours} hrs &middot; this can't be undone.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteBudgetConfirm(null)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteBudgetRequest} disabled={submitting}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition">
                {submitting ? 'Please wait…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Loading…</div>}>
      <ProgressContent />
    </Suspense>
  );
}
