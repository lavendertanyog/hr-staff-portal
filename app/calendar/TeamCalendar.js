"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';

// Company calendar: Singapore public holidays plus who is on approved leave. Read-only — HR
// manages holidays in the HR portal, and leave comes from approved leave requests. The same
// file is used in the Staff, Manager and Account Manager portals.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LEAVE_PILLS_PER_DAY = 2;

const toISODateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const monthLabel = (s) => parseISO(s).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
const shortDate = (s) => parseISO(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
const longDate = (s) => parseISO(s).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayCount = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000) + 1;
const rangeLabel = (a, b) => (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Chevron = ({ dir }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" {...svg}>{dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}</svg>
);

export default function TeamCalendar({ backendBaseUrl, sessionUser }) {
  const userId = sessionUser?.user_id || null;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [leave, setLeave] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [listTab, setListTab] = useState('all'); // all | upcoming
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('month'); // month | list
  const [gridMonth, setGridMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [dayOpen, setDayOpen] = useState(null); // ISO date whose details are shown

  const shiftGridMonth = (delta) => {
    setGridMonth((m) => {
      const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
      if (next.getFullYear() !== year) setYear(next.getFullYear());
      return next;
    });
  };
  const openPicker = () => { setPickerYear(year); setPickerOpen(true); };
  const pickMonthYear = (monthIdx) => { setGridMonth(new Date(pickerYear, monthIdx, 1)); setYear(pickerYear); setPickerOpen(false); };
  const jumpToToday = () => { const t = new Date(); t.setDate(1); setGridMonth(t); setYear(t.getFullYear()); setPickerOpen(false); };

  const fetchYear = useCallback(async (y) => {
    if (!userId) return;
    setLoading(true);
    setLoadError('');
    const [holidayRes, leaveRes] = await Promise.all([
      axios.get(`${backendBaseUrl}/api/v1/public-holidays`, { params: { year: y } }).catch(() => null),
      axios.get(`${backendBaseUrl}/api/v1/calendar/leave`, { params: { requesterId: userId, from: `${y}-01-01`, to: `${y}-12-31` } }).catch(() => null),
    ]);
    setHolidays(holidayRes?.data?.data || []);
    setLeave(leaveRes?.data?.data || []);
    if (!holidayRes || !leaveRes) setLoadError("Some of the calendar couldn't be loaded. Check your connection and refresh the page.");
    setLoading(false);
  }, [backendBaseUrl, userId]);

  useEffect(() => { void fetchYear(year); }, [year, fetchYear]);

  useEffect(() => {
    if (!dayOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDayOpen(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dayOpen]);

  const todayISO = toISODateStr(new Date());
  const query = searchQuery.trim().toLowerCase();

  // Filtered by the All/Upcoming tab and the search box (holiday name or person name)
  const shownHolidays = useMemo(() => holidays.filter((h) => (
    !(listTab === 'upcoming' && h.holiday_date < todayISO) && (!query || h.name.toLowerCase().includes(query))
  )), [holidays, listTab, todayISO, query]);
  const shownLeave = useMemo(() => leave.filter((l) => (
    !(listTab === 'upcoming' && l.end_date < todayISO) && (!query || (l.full_name || '').toLowerCase().includes(query))
  )), [leave, listTab, todayISO, query]);

  const holidayByDate = useMemo(() => {
    const map = {};
    shownHolidays.forEach((h) => { map[h.holiday_date] = h; });
    return map;
  }, [shownHolidays]);

  // Each leave spread across every day it covers within the loaded year
  const leaveByDate = useMemo(() => {
    const map = {};
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    shownLeave.forEach((l) => {
      const start = parseISO(l.start_date < yearStart ? yearStart : l.start_date);
      const end = parseISO(l.end_date > yearEnd ? yearEnd : l.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = toISODateStr(d);
        (map[iso] ||= []).push(l);
      }
    });
    return map;
  }, [shownLeave, year]);

  // Month-grouped agenda for the list view and the Upcoming tab
  const agenda = useMemo(() => {
    const items = [
      ...shownHolidays.map((h) => ({ kind: 'holiday', date: h.holiday_date, key: `h-${h.holiday_date}`, holiday: h })),
      ...shownLeave.map((l) => ({ kind: 'leave', date: l.start_date < `${year}-01-01` ? `${year}-01-01` : l.start_date, key: `l-${l.leave_id}`, leave: l })),
    ].sort((a, b) => (a.date === b.date ? (a.kind === 'holiday' ? -1 : 1) : a.date < b.date ? -1 : 1));
    const groups = [];
    items.forEach((it) => {
      const label = monthLabel(it.date);
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.items.push(it); else groups.push({ label, items: [it] });
    });
    return groups;
  }, [shownHolidays, shownLeave, year]);

  const gridYear = gridMonth.getFullYear();
  const gridMonthIdx = gridMonth.getMonth();
  const leadingBlanks = (new Date(gridYear, gridMonthIdx, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(gridYear, gridMonthIdx + 1, 0).getDate();
  const gridCells = [];
  for (let i = 0; i < leadingBlanks; i++) gridCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) gridCells.push(new Date(gridYear, gridMonthIdx, d));
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  const isMine = (l) => l.user_id === userId;
  const leaveName = (l) => (isMine(l) ? 'You' : l.full_name);
  const leavePill = (l) => (isMine(l) ? 'bg-[#1540A8] text-white' : 'bg-[#E8EEFF] text-[#1540A8]');

  const showMonth = listTab === 'all' && viewMode === 'month';
  const dayHoliday = dayOpen ? holidayByDate[dayOpen] : null;
  const dayLeave = dayOpen ? (leaveByDate[dayOpen] || []) : [];

  return (
    <>
      {loadError && <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</p>}

      <div className={`rounded-3xl border border-slate-200 bg-white ${pickerOpen ? 'overflow-visible' : 'overflow-hidden'}`}>
        {/* Tabs + search */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6">
          <div className="flex items-center gap-6">
            {[
              ['all', 'All', <path key="p" d="M8 2v4M16 2v4M3.5 9h17M4 5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />],
              ['upcoming', 'Upcoming', <path key="p" d="M12 2l2.6 6.6L22 9l-5.4 4.8L18 21l-6-3.6L6 21l1.4-7.2L2 9l7.4-.4Z" />],
            ].map(([key, label, icon]) => (
              <button key={key} type="button" onClick={() => setListTab(key)}
                className={`flex items-center gap-1.5 border-b-2 py-3.5 text-sm transition ${
                  listTab === key ? 'border-[#1540A8] font-bold text-slate-900' : 'border-transparent font-medium text-slate-400 hover:text-slate-600'
                }`}>
                <svg width="15" height="15" viewBox="0 0 24 24" {...svg}>{icon}</svg>
                {label}
              </button>
            ))}
          </div>
          <div className="relative py-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" {...svg} stroke="#94A3B8" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search holiday or name…"
              aria-label="Search holidays and people"
              className="w-60 max-w-full rounded-full border border-slate-200 py-1.5 pl-8 pr-3 text-sm transition-all focus:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* View toggle · month navigation · legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 md:grid md:grid-cols-[1fr_auto_1fr]">
          {listTab === 'all' ? (
            <div className="flex items-center gap-1 justify-self-start rounded-full bg-slate-50 p-1">
              {[
                ['month', 'Month', <><rect key="r" x="3" y="4" width="18" height="17" rx="2" /><line key="l" x1="3" y1="10" x2="21" y2="10" /></>],
                ['list', 'List', <><line key="l1" x1="8" y1="6" x2="21" y2="6" /><line key="l2" x1="8" y1="12" x2="21" y2="12" /><line key="l3" x1="8" y1="18" x2="21" y2="18" /><line key="l4" x1="3" y1="6" x2="3.01" y2="6" /><line key="l5" x1="3" y1="12" x2="3.01" y2="12" /><line key="l6" x1="3" y1="18" x2="3.01" y2="18" /></>],
              ].map(([key, label, icon]) => (
                <button key={key} type="button" onClick={() => setViewMode(key)} aria-pressed={viewMode === key}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" {...svg}>{icon}</svg>
                  {label}
                </button>
              ))}
            </div>
          ) : <div />}

          <div className="relative justify-self-center">
            {showMonth ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => shiftGridMonth(-1)} aria-label="Previous month"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><Chevron dir="left" /></button>
                <button type="button" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                  className="-mx-1 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-base font-bold text-slate-900 transition hover:bg-slate-50">
                  {gridMonth.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}
                  <svg width="12" height="12" viewBox="0 0 24 24" {...svg} stroke="#94A3B8" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <button type="button" onClick={() => shiftGridMonth(1)} aria-label="Next month"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><Chevron dir="right" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                className="-mx-1 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-base font-bold text-slate-900 transition hover:bg-slate-50">
                {listTab === 'upcoming' ? `Upcoming in ${year}` : year}
                <svg width="12" height="12" viewBox="0 0 24 24" {...svg} stroke="#94A3B8" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            )}

            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <button type="button" onClick={() => setPickerYear((y) => y - 1)} aria-label="Previous year"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><Chevron dir="left" /></button>
                    <p className="text-sm font-bold text-slate-900">{pickerYear}</p>
                    <button type="button" onClick={() => setPickerYear((y) => y + 1)} aria-label="Next year"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><Chevron dir="right" /></button>
                  </div>
                  <div className="grid grid-cols-3">
                    {MONTH_NAMES.map((m, i) => {
                      const isCurrent = showMonth && pickerYear === gridMonth.getFullYear() && i === gridMonth.getMonth();
                      return (
                        <button key={m} type="button" onClick={() => pickMonthYear(i)}
                          className={`border-slate-100 py-3 text-xs font-semibold transition ${i % 3 !== 2 ? 'border-r' : ''} ${i < 9 ? 'border-b' : ''} ${isCurrent ? 'bg-[#1540A8] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={jumpToToday}
                    className="w-full border-t border-slate-100 py-3 text-xs font-semibold text-[#1540A8] transition hover:bg-slate-50">
                    Today
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 justify-self-end text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />Public holiday</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#C9D5FF]" />On leave</span>
          </div>
        </div>

        {showMonth ? (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 border-b border-slate-100">
                {WEEKDAYS.map((d) => (
                  <span key={d} className="border-r border-slate-100 py-3 text-center text-xs font-semibold text-slate-400 last:border-r-0">{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {gridCells.map((d, i) => {
                  const isLastCol = (i + 1) % 7 === 0;
                  if (!d) return <div key={i} className={`min-h-[110px] border-b border-slate-100 bg-slate-50/40 ${isLastCol ? '' : 'border-r'}`} />;
                  const iso = toISODateStr(d);
                  const holiday = holidayByDate[iso];
                  const onLeave = leaveByDate[iso] || [];
                  const hasDetails = Boolean(holiday) || onLeave.length > 0;
                  const isToday = iso === todayISO;
                  const content = (
                    <>
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-[#1540A8] text-white' : 'text-slate-700'}`}>
                        {d.getDate()}
                      </span>
                      {holiday && (
                        <p className="mt-1.5 w-full rounded-md bg-red-500 px-2 py-1 text-left text-[10px] font-semibold leading-tight text-white line-clamp-2">{holiday.name}</p>
                      )}
                      {onLeave.slice(0, LEAVE_PILLS_PER_DAY).map((l) => (
                        <p key={l.leave_id} className={`mt-1 w-full truncate rounded-md px-2 py-1 text-left text-[10px] font-semibold leading-tight ${leavePill(l)}`}>
                          {leaveName(l)}
                        </p>
                      ))}
                      {onLeave.length > LEAVE_PILLS_PER_DAY && (
                        <p className="mt-1 w-full text-left text-[10px] font-semibold text-slate-500">+{onLeave.length - LEAVE_PILLS_PER_DAY} more on leave</p>
                      )}
                    </>
                  );
                  const cellClass = `min-h-[110px] p-2 flex flex-col items-end text-left border-b border-slate-100 ${isLastCol ? '' : 'border-r'}`;
                  return hasDetails ? (
                    <button key={i} type="button" onClick={() => setDayOpen(iso)} aria-label={`${longDate(iso)}: details`}
                      className={`${cellClass} transition hover:bg-slate-50`}>
                      {content}
                    </button>
                  ) : (
                    <div key={i} className={cellClass}>{content}</div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : agenda.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {query ? `Nothing matches "${searchQuery.trim()}" in ${year}.` : listTab === 'upcoming' ? `No more holidays or leave in ${year}.` : `No holidays or leave in ${year}.`}
              </p>
            ) : (
              agenda.map((group, gi) => (
                <div key={group.label} className={gi > 0 ? 'mt-6' : ''}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                    {group.items.map((it) => {
                      const weekday = parseISO(it.date).toLocaleDateString('en-SG', { weekday: 'short' });
                      const dNum = it.date.split('-')[2];
                      const isHoliday = it.kind === 'holiday';
                      return (
                        <div key={it.key} className="flex items-center gap-4 px-4 py-3.5">
                          <div className="w-10 flex-shrink-0 text-center">
                            <p className="text-base font-bold leading-tight text-[#1540A8]">{dNum}</p>
                            <p className="text-[10px] leading-tight text-slate-400">{weekday}</p>
                          </div>
                          <div className={`w-[3px] flex-shrink-0 self-stretch rounded-full ${isHoliday ? 'bg-red-500' : 'bg-[#1540A8]'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium leading-tight text-slate-400">{isHoliday ? 'Public holiday' : 'On leave'}</p>
                            <p className="truncate text-sm font-semibold leading-snug text-slate-800">
                              {isHoliday ? it.holiday.name : (isMine(it.leave) ? `${it.leave.full_name} (you)` : it.leave.full_name)}
                            </p>
                          </div>
                          {!isHoliday && (
                            <p className="flex-shrink-0 text-right text-xs text-slate-500">
                              {rangeLabel(it.leave.start_date, it.leave.end_date)}
                              <span className="block text-[11px] text-slate-400">{dayCount(it.leave.start_date, it.leave.end_date)} day{dayCount(it.leave.start_date, it.leave.end_date) === 1 ? '' : 's'}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Day details */}
      {dayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDayOpen(null); }}>
          <div role="dialog" aria-modal="true" aria-label={longDate(dayOpen)}
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-sm flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <p className="text-sm font-semibold text-slate-900">{longDate(dayOpen)}</p>
              <button type="button" onClick={() => setDayOpen(null)} aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">&times;</button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-5">
              {dayHoliday && (
                <div className="rounded-2xl bg-red-50 px-4 py-3">
                  <p className="text-[11px] font-medium text-red-500">Public holiday</p>
                  <p className="text-sm font-semibold text-red-700">{dayHoliday.name}</p>
                </div>
              )}
              {dayLeave.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">On leave ({dayLeave.length})</p>
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                    {dayLeave.map((l) => (
                      <div key={l.leave_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0 truncate text-sm font-medium text-slate-800">{isMine(l) ? `${l.full_name} (you)` : l.full_name}</span>
                        <span className="flex-shrink-0 text-xs text-slate-500">{rangeLabel(l.start_date, l.end_date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
