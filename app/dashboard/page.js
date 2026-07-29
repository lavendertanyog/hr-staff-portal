"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

export default function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  useEffect(() => {
    if (!user?.user_id) return;
    const uid = user.user_id;
    setLoading(true);
    Promise.all([
      axios.get(`${API_BASE}/api/v1/projects/active-list?userId=${uid}`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/users/${uid}/inbox`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/leave/balance/${uid}`).catch(() => null),
    ]).then(([projRes, inboxRes, balRes]) => {
      setProjects(projRes?.data?.data || []);
      setInbox(inboxRes?.data?.data?.slice(0, 6) || []);
      setLeaveBalance(balRes?.data?.data || null);
    }).finally(() => setLoading(false));
  }, [user?.user_id]);

  const staffName = deriveNameFromEmail(user?.email) || user?.full_name || 'Staff';
  const unreadCount = inbox.filter((i) => i.status === 'UNREAD').length;

  const stats = [
    { label: 'Active Projects', value: loading ? '—' : projects.length },
    { label: 'Leave Balance', value: loading ? '—' : leaveBalance ? `${leaveBalance.remainingDays} days` : '—' },
    { label: 'Unread Notifications', value: loading ? '—' : unreadCount },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Welcome back, {staffName}</h1>
          <p className="mt-2 text-sm text-slate-500">Manage your attendance, leave, and project progress in one place.</p>
        </div>
        <div className="px-2 py-1">
          {!logoMissing ? (
            <img src="/nextan-logo.png" alt="Nextan" width={140} height={46}
              className="h-auto w-full max-w-[140px] object-contain"
              onError={() => setLogoMissing(true)} />
          ) : (
            <div className="text-[#163EAF]">
              <p className="text-xs uppercase tracking-[0.28em]">Nextan</p>
              <p className="mt-2 text-base font-semibold text-[#2D376B]">Staff Portal</p>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-6 xl:grid-cols-3 mb-10">
        {stats.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{item.label}</p>
            <p className="mt-4 text-4xl font-semibold text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 mb-5">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Clock In / Out', href: '/attendance', bg: '#EEF4FF', color: '#1a3a8f' },
            { label: 'Apply Leave', href: '/leave', bg: '#EEFBF3', color: '#166534' },
            { label: 'Log Progress', href: '/progress', bg: '#FFFBEB', color: '#92400e' },
            { label: 'Request Hours', href: '/progress?tab=budget', bg: '#FDF4FF', color: '#6b21a8' },
          ].map((a) => (
            <Link key={a.href} href={a.href}
              className="rounded-2xl px-4 py-4 text-sm font-semibold transition hover:opacity-90"
              style={{ background: a.bg, color: a.color }}>
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent inbox */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Recent Activity</p>
            <p className="mt-1 font-semibold text-slate-900">Inbox</p>
          </div>
          <Link href="/inbox" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            View all
          </Link>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400">Loading…</p>
        ) : inbox.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {inbox.map((item, i) => (
              <li key={item.notification_id || i} className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-slate-50 transition">
                <div className="min-w-0">
                  <p className={`text-sm truncate ${item.status === 'UNREAD' ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{item.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{item.subtitle}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  item.status === 'UNREAD' ? 'bg-blue-50 text-blue-700' :
                  item.status === 'APPROVED' ? 'bg-green-50 text-green-700' :
                  item.status === 'REJECTED' ? 'bg-red-50 text-red-600' :
                  'bg-gray-100 text-gray-500'
                }`}>{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}