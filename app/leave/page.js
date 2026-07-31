"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const CATEGORIES = ['ANNUAL', 'EMERGENCY', 'SICK'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MC_ACCEPT = '.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf';
const MC_MAX_BYTES = 5 * 1024 * 1024; // 5MB

function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function MiniCalendar({ startDate, endDate, onDateClick }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getStyle = (day) => {
    if (!day) return '';
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isStart = ymd === startDate;
    const isEnd = ymd === endDate;
    const todayYmd = toYMD(today);
    const inRange = startDate && endDate && ymd > startDate && ymd < endDate;
    const isToday = ymd === todayYmd;

    if (isStart || isEnd) return 'bg-[#0c3b8f] text-white rounded-full font-bold';
    if (inRange) return 'bg-[#dbeafe] text-[#1a3a8f] rounded-full';
    if (isToday) return 'border border-[#0c3b8f] text-[#0c3b8f] rounded-full font-semibold';
    return 'hover:bg-slate-100 rounded-full text-slate-700';
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm select-none">
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

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center">
            {day ? (
              <button type="button"
                onClick={() => {
                  const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  onDateClick(ymd);
                }}
                className={`w-8 h-8 text-xs flex items-center justify-center transition cursor-pointer ${getStyle(day)}`}>
                {day}
              </button>
            ) : <span />}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 space-y-1">
        {startDate && <p><span className="font-semibold text-slate-600">Start:</span> {startDate}</p>}
        {endDate && <p><span className="font-semibold text-slate-600">End:</span> {endDate}</p>}
        {!startDate && <p>Click a date to set start, then click another for end.</p>}
        {startDate && !endDate && <p>Now click an end date (same day or later).</p>}
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
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [mcFile, setMcFile] = useState(null);
  const [mcFileError, setMcFileError] = useState('');
  const [uploadingMcId, setUploadingMcId] = useState(null);

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
    if (!startDate || (startDate && endDate)) {
      setStartDate(ymd); setEndDate('');
    } else {
      if (ymd >= startDate) setEndDate(ymd);
      else { setStartDate(ymd); setEndDate(''); }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) { setMessage('Please select a start and end date on the calendar.'); setMessageType('error'); return; }
    setSubmitting(true); setMessage('');
    try {
      const mcFileUrl = mcFile ? await fileToBase64(mcFile) : undefined;
      if (editingId) {
        await axios.patch(`${API_BASE}/api/v1/leave/${editingId}`, {
          userId: user.user_id, category, startDate, endDate, reason: reason.trim() || undefined, mcFileUrl,
        });
        setMessage('Leave request updated successfully.'); setMessageType('success');
      } else {
        await axios.post(`${API_BASE}/api/v1/leave/apply`, {
          userId: user.user_id, category, startDate, endDate, reason: reason.trim() || undefined, mcFileUrl,
        });
        setMessage('Leave request submitted successfully.'); setMessageType('success');
      }
      setShowForm(false); setStartDate(''); setEndDate(''); setReason(''); setCategory('ANNUAL'); setEditingId(null);
      setMcFile(null); setMcFileError('');
      await fetchData(user.user_id);
    } catch (err) { setMessage(err.response?.data?.error || 'Submission failed.'); setMessageType('error'); }
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
    setStartDate(String(r.start_date).slice(0, 10));
    setEndDate(String(r.end_date).slice(0, 10));
    setReason(r.reason || '');
    setMcFile(null); setMcFileError('');
    setMessage('');
    setShowForm(true);
  };

  const handleMcUpload = async (leaveId, file) => {
    if (!file || !user?.user_id) return;
    if (file.size > MC_MAX_BYTES) { setMessage('File is too large — max 5MB.'); setMessageType('error'); return; }
    setUploadingMcId(leaveId); setMessage('');
    try {
      const mcFileUrl = await fileToBase64(file);
      await axios.post(`${API_BASE}/api/v1/leave/${leaveId}/mc-upload`, { userId: user.user_id, mcFileUrl });
      setMessage('MC document uploaded successfully.'); setMessageType('success');
      await fetchData(user.user_id);
    } catch (err) { setMessage(err.response?.data?.error || 'MC upload failed.'); setMessageType('error'); }
    finally { setUploadingMcId(null); }
  };

  const handleCancelLeave = async (leaveId) => {
    if (!user?.user_id) return;
    const confirmed = window.confirm('Delete this pending leave request?');
    if (!confirmed) return;

    try {
      await axios.delete(`${API_BASE}/api/v1/leave/${leaveId}`, {
        data: { userId: user.user_id },
      });
      setMessage('Leave request deleted successfully.');
      setMessageType('success');
      await fetchData(user.user_id);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Cancellation failed.');
      setMessageType('error');
    }
  };

  return (
    <div className="p-8">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Leave</h1>
          <p className="mt-2 text-sm text-slate-500">Apply for leave and track your request history.</p>
        </div>
        {balance && (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Annual Leave Balance</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{balance.remainingDays} <span className="text-base font-normal text-slate-400">/ {balance.totalDays} days</span></p>
          </div>
        )}
      </div>

      {message && (
        <div className={`mb-6 rounded-2xl px-5 py-3.5 text-sm font-medium border ${
          messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}>{message}</div>
      )}

      {showForm && (
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          {/* Form card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-3">{editingId ? 'Edit Leave Request' : 'New Leave Request'}</p>
            {balance && (
              <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#EEF4FF] bg-[#F7FAFF] px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Balance</span>
                <span className="text-sm font-bold text-[#0c3b8f]">Annual/Emergency: {balance.remainingDays} of {balance.totalDays} days left</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Dates: type directly, or click the calendar on the right */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Start Date</label>
                  <input type="date" value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${startDate ? 'border-[#0c3b8f] bg-[#EEF4FF] text-[#0c3b8f] font-semibold' : 'border-slate-300 text-slate-700'}`} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                  <input type="date" value={endDate} min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${endDate ? 'border-[#0c3b8f] bg-[#EEF4FF] text-[#0c3b8f] font-semibold' : 'border-slate-300 text-slate-700'}`} />
                </div>
                <p className="col-span-2 text-xs text-slate-400">Type dates directly, or click them on the calendar →</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Reason <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief reason for leave…"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {category === 'SICK' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">MC Upload <span className="font-normal text-slate-400">(optional — you can also upload this later)</span></label>
                  <input type="file" accept={MC_ACCEPT} onChange={(e) => handleMcFileChange(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#EEF4FF] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#0c3b8f]" />
                  <p className="mt-1.5 text-xs text-slate-400">Accepts PNG, JPG, or PDF — max 5MB.</p>
                  {mcFile && <p className="mt-1.5 text-xs font-medium text-[#0c3b8f]">Selected: {mcFile.name}</p>}
                  {mcFileError && <p className="mt-1.5 text-xs font-medium text-red-600">{mcFileError}</p>}
                </div>
              )}

              <button type="submit" disabled={submitting || !startDate || !endDate}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                {submitting ? 'Please wait…' : editingId ? 'SAVE CHANGES' : 'SUBMIT'}
              </button>
            </form>
          </div>

          {/* Calendar */}
          <MiniCalendar
            startDate={startDate}
            endDate={endDate}
            onDateClick={handleCalendarClick}
          />
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Leave History</p>
            <p className="mt-1 font-semibold text-slate-900">My Requests</p>
          </div>
          {!showForm ? (
            <button onClick={() => { setShowForm(true); setMessage(''); setEditingId(null); setStartDate(''); setEndDate(''); setReason(''); setCategory('ANNUAL'); setMcFile(null); setMcFileError(''); }}
              className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{ background: '#0c3b8f' }}>
              + Apply for Leave
            </button>
          ) : (
            <button onClick={() => { setShowForm(false); setMessage(''); setStartDate(''); setEndDate(''); setReason(''); setEditingId(null); setMcFile(null); setMcFileError(''); }}
              className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{ background: '#64748b' }}>
              ← Back
            </button>
          )}
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400">No leave requests yet.</p>
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
                {requests.map((r) => (
                  <tr key={r.leave_id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">{r.category}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{String(r.start_date).slice(0, 10)}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{String(r.end_date).slice(0, 10)}</td>
                    <td className="px-6 py-4 whitespace-nowrap"><StatusPill status={r.workflow_status} /></td>
                    <td className="px-6 py-4 text-slate-500 max-w-[180px] truncate">{r.reviewer_remarks || '—'}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{String(r.created_at).slice(0, 10)}</td>
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
                            <a href={r.mc_file_url} target="_blank" rel="noreferrer"
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                              View MC
                            </a>
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


