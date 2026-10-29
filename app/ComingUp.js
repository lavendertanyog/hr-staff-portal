"use client";

// Dashboard "Coming up": the next three things on the signed-in user's calendar, their own
// approved or pending leave that hasn't ended yet and their office's upcoming public holidays,
// as compact one-line cards. Loads its own data.
// This file is identical in all four portals (Staff, Manager, Account Manager, HR); change every copy together.
//
//   <ComingUp user={user} />   (user: the signed-in user from sessionStorage)

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { holidayLabel, timeZoneForCountry } from './officeTime';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

// Card surface used across the dashboards: white, no border, a soft navy-tinted shadow.
const CARD = 'rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(22,48,122,0.18)]';
const LEAVE_LABELS = { ANNUAL: 'Annual leave', EMERGENCY: 'Emergency leave', SICK: 'Sick leave' };
const BADGE_COLORS = {
  APPROVED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  HOLIDAY: 'bg-[#E8EEFF] text-[#1a3a8f]',
};

function toYMD(value) {
  const s = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}
// "16 Oct" and "Fri" for a YYYY-MM-DD date.
const dayMonth = (ymd) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
const weekday = (ymd) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short' });

export default function ComingUp({ user }) {
  const [myLeave, setMyLeave] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const userId = user?.user_id;
  const country = user?.home_office_country || 'SG';

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/api/v1/leave/my-requests/${userId}`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/public-holidays`, { params: { country } }).catch(() => null),
    ]).then(([leaveRes, holidayRes]) => {
      if (!alive) return;
      setMyLeave(leaveRes?.data?.data || []);
      setHolidays(holidayRes?.data?.data || []);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, country]);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: timeZoneForCountry(country) });
  const upcoming = useMemo(() => {
    const leaveItems = myLeave
      .filter((l) => ['APPROVED', 'PENDING'].includes(String(l.workflow_status)) && toYMD(l.end_date) >= today)
      .map((l) => {
        const start = toYMD(l.start_date);
        const end = toYMD(l.end_date);
        const days = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
        const status = String(l.workflow_status);
        return {
          key: `leave-${l.leave_id}`,
          date: start,
          // Leave by the hour shows its hours; full-day leave its days.
          when: l.leave_hours != null ? `${weekday(start)} · ${Number(l.leave_hours)} h`
            : days === 1 ? `${weekday(start)} · 1 day` : `Until ${dayMonth(end)} · ${days} days`,
          title: LEAVE_LABELS[String(l.category)] || 'Leave',
          badge: status === 'APPROVED' ? 'Approved' : 'Pending',
          badgeClass: BADGE_COLORS[status],
        };
      });
    const holidayItems = holidays
      .map((h) => ({ ...h, ymd: toYMD(h.holiday_date) }))
      .filter((h) => h.ymd >= today)
      .map((h) => ({
        key: `holiday-${h.holiday_id ?? h.ymd}`,
        date: h.ymd,
        when: `${weekday(h.ymd)} · Public holiday`,
        title: holidayLabel(h),
        badge: 'Holiday',
        badgeClass: BADGE_COLORS.HOLIDAY,
      }));
    return [...leaveItems, ...holidayItems].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  }, [myLeave, holidays, today]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-slate-900">Coming up</h2>
        <Link href="/calendar" className="flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#1540A8]">
          View calendar
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
      {loading ? (
        <div className={`${CARD} px-6 py-6 text-center text-sm text-slate-400`}>Loading…</div>
      ) : upcoming.length === 0 ? (
        <div className={`${CARD} px-6 py-6 text-center text-sm text-slate-400`}>Nothing coming up. Your approved leave and public holidays will show here.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {upcoming.map((u) => (
            <div key={u.key} className={`${CARD} flex min-w-0 items-center gap-3 px-4 py-3`}>
              {/* Compact date block: day number over the short month. */}
              <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-[#EAF0FF] text-[#1540A8]" aria-label={dayMonth(u.date)}>
                <span className="text-base font-extrabold leading-none">{dayMonth(u.date).split(' ')[0]}</span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none">{dayMonth(u.date).split(' ')[1]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{u.title}</p>
                <p className="truncate text-xs text-slate-400">{u.when}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.badgeClass}`}>{u.badge}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
