"use client";

import React, { useEffect, useState, useCallback, Suspense } from 'react';
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
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const [showProgressForm, setShowProgressForm] = useState(false);
  const [progressProject, setProgressProject] = useState('');
  const [progressPct, setProgressPct] = useState('');
  const [progressSummary, setProgressSummary] = useState('');

  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetProject, setBudgetProject] = useState('');
  const [budgetHours, setBudgetHours] = useState('');
  const [budgetJustification, setBudgetJustification] = useState('');

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
      const [projRes, progressRes, inboxRes, allocRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/projects/active-list?userId=${uid}`).catch(() => null),
        axios.get(`${API_BASE}/api/v1/projects/progress-history/${uid}`).catch(() => null),
        axios.get(`${API_BASE}/api/v1/users/${uid}/inbox`).catch(() => null),
        axios.get(`${API_BASE}/api/v1/allocations/${uid}`).catch(() => null),
      ]);
      setProjects(projRes?.data?.data || []);
      setProgressHistory(progressRes?.data?.data || []);
      const allInbox = inboxRes?.data?.data || [];
      setBudgetRequests(allInbox.filter((i) => i.category === 'BUDGET'));
      setAllocations(allocRes?.data?.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.user_id) fetchData(user.user_id); }, [user?.user_id, fetchData]);

  const handleProgressSubmit = async (e) => {
    e.preventDefault();
    if (!progressProject || !progressPct) { setMessage('Project and completion % are required.'); setMessageType('error'); return; }
    const pct = parseFloat(progressPct);
    if (isNaN(pct) || pct < 0 || pct > 100) { setMessage('Completion % must be between 0 and 100.'); setMessageType('error'); return; }
    setSubmitting(true); setMessage('');
    try {
      await axios.post(`${API_BASE}/api/v1/projects/progress-log`, {
        projectCode: progressProject, reporterId: user.user_id,
        completionPercentage: pct, progressSummary: progressSummary.trim() || `Progress update: ${pct}%`,
      });
      setMessage('Progress logged successfully.'); setMessageType('success');
      setShowProgressForm(false); setProgressPct(''); setProgressSummary(''); setProgressProject('');
      await fetchData(user.user_id);
    } catch (err) { setMessage(err.response?.data?.error || 'Submission failed.'); setMessageType('error'); }
    finally { setSubmitting(false); }
  };

  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    if (!budgetProject || !budgetHours) { setMessage('Project and hours are required.'); setMessageType('error'); return; }
    const hrs = parseFloat(budgetHours);
    if (isNaN(hrs) || hrs <= 0) { setMessage('Hours must be a positive number.'); setMessageType('error'); return; }
    setSubmitting(true); setMessage('');
    try {
      await axios.post(`${API_BASE}/api/v1/projects/budget-request`, {
        userId: user.user_id, projectCode: budgetProject,
        requestedHours: hrs, justification: budgetJustification.trim() || undefined,
      });
      setMessage('Budget request submitted successfully.'); setMessageType('success');
      setShowBudgetForm(false); setBudgetHours(''); setBudgetJustification(''); setBudgetProject('');
      await fetchData(user.user_id);
    } catch (err) { setMessage(err.response?.data?.error || 'Submission failed.'); setMessageType('error'); }
    finally { setSubmitting(false); }
  };

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
          Progress Updates
        </button>
        <button onClick={() => setTab('budget')}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'budget' ? 'bg-[#1a3a8f] text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}>
          Budget Requests
        </button>
      </div>

      {message && (
        <div className={`mb-6 rounded-2xl px-5 py-3.5 text-sm font-medium border ${
          messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}>{message}</div>
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
                const totalHrs = Number(alloc.hours_per_week || 0);
                const usedHrs = +(pct / 100 * totalHrs).toFixed(2);
                const remainingHrs = +(totalHrs - usedHrs).toFixed(2);
                const projName = alloc.project_name || projects.find((p) => p.project_code === alloc.project_code)?.project_name || alloc.project_code;

                // Colour changes based on progress
                const barColor = pct >= 80 ? '#16a34a' : pct >= 40 ? '#1a3a8f' : '#0c3b8f';
                const bgColor = pct >= 80 ? '#f0fdf4' : '#EEF4FF';

                return (
                  <div key={alloc.allocation_id || alloc.project_code}
                    className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
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

                    {latestLog && (
                      <p className="mt-3 text-xs text-slate-400 text-right">
                        Last update: {String(latestLog.logged_at).slice(0, 10)}
                      </p>
                    )}

                    {/* Quick-log shortcut */}
                    <button type="button"
                      onClick={() => { setProgressProject(alloc.project_code); setShowProgressForm(true); setMessage(''); }}
                      className="mt-4 w-full rounded-2xl py-2 text-xs font-bold text-white transition"
                      style={{ background: '#0c3b8f' }}>
                      + Log Progress
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mb-6 flex gap-3">
            <button onClick={() => { setShowProgressForm(!showProgressForm); setMessage(''); }}
              className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{ background: showProgressForm ? '#64748b' : '#0c3b8f' }}>
              {showProgressForm ? 'Cancel' : '+ Log Progress Update'}
            </button>
          </div>

          {showProgressForm && (
            <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm max-w-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-5">New Progress Entry</p>
              <form onSubmit={handleProgressSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Project</label>
                  <select value={progressProject} onChange={(e) => setProgressProject(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                    <option value="">Select project…</option>
                    {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Completion % <span className="font-normal text-slate-400">(0 – 100)</span></label>
                  <input type="number" min="0" max="100" step="0.1" value={progressPct} onChange={(e) => setProgressPct(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
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
          )}

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Progress Log</p>
              <p className="mt-1 font-semibold text-slate-900">History</p>
            </div>
            {loading ? (
              <p className="px-6 py-8 text-sm text-slate-400">Loading…</p>
            ) : progressHistory.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400">No progress logs yet. Use the button above to log your first update.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-6 py-4 whitespace-nowrap">Project</th>
                      <th className="px-6 py-4 whitespace-nowrap">Completion</th>
                      <th className="px-6 py-4 whitespace-nowrap">Summary</th>
                      <th className="px-6 py-4 whitespace-nowrap">Logged</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {progressHistory.slice(0, 50).map((r) => (
                      <tr key={r.log_id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">{r.project_code}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 rounded-full bg-slate-100 shrink-0">
                              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, Number(r.completion_percentage))}%`, background: '#1a3a8f' }} />
                            </div>
                            <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">{Number(r.completion_percentage).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500 max-w-[220px] truncate">{r.progress_summary || '—'}</td>
                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{String(r.logged_at).slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-6">
            <button onClick={() => { setShowBudgetForm(!showBudgetForm); setMessage(''); }}
              className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{ background: showBudgetForm ? '#64748b' : '#0c3b8f' }}>
              {showBudgetForm ? 'Cancel' : '+ Request Additional Hours'}
            </button>
          </div>

          {showBudgetForm && (
            <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm max-w-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-5">New Budget Request</p>
              <form onSubmit={handleBudgetSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Project</label>
                  <select value={budgetProject} onChange={(e) => setBudgetProject(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                    <option value="">Select project…</option>
                    {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Additional Hours Requested</label>
                  <input type="number" min="0.5" step="0.5" value={budgetHours} onChange={(e) => setBudgetHours(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
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
          )}

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Budget Requests</p>
              <p className="mt-1 font-semibold text-slate-900">My Requests</p>
            </div>
            {loading ? (
              <p className="px-6 py-8 text-sm text-slate-400">Loading…</p>
            ) : budgetRequests.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400">No budget requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-6 py-4 whitespace-nowrap">Project</th>
                      <th className="px-6 py-4 whitespace-nowrap">Hours</th>
                      <th className="px-6 py-4 whitespace-nowrap">Status</th>
                      <th className="px-6 py-4 whitespace-nowrap">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {budgetRequests.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">{String(r.subtitle || '').split(' • ')[0] || '—'}</td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{String(r.subtitle || '').split(' • ')[1] || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap"><StatusPill status={r.status} /></td>
                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{r.created_at ? String(r.created_at).slice(0, 10) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
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
