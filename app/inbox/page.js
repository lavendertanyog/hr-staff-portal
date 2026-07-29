"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function categoryLabel(cat) {
  if (cat === 'LEAVE') return 'Leave';
  if (cat === 'BUDGET') return 'Budget';
  return 'Notification';
}

function statusBadge(status) {
  const s = String(status || '').toUpperCase();
  const map = {
    UNREAD: 'bg-blue-50 text-blue-700',
    READ: 'bg-gray-100 text-gray-500',
    APPROVED: 'bg-green-50 text-green-700',
    REJECTED: 'bg-red-50 text-red-600',
    PENDING: 'bg-yellow-50 text-yellow-700',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-500'}`}>{s}</span>;
}

export default function InboxPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logoMissing, setLogoMissing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'LEAVE' | 'BUDGET' | 'NOTIFICATION'

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  const fetchInbox = useCallback(async (uid) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/${uid}/inbox`);
      setItems(res.data?.data || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.user_id) fetchInbox(user.user_id); }, [user?.user_id, fetchInbox]);

  const markRead = async (notifId) => {
    if (!notifId) return;
    try {
      await axios.patch(`${API_BASE}/api/v1/notifications/${notifId}/read`);
      setItems((prev) => prev.map((i) => i.notification_id === notifId ? { ...i, status: 'READ' } : i));
    } catch {}
  };

  const filtered = activeFilter === 'ALL' ? items : items.filter((i) => i.category === activeFilter);
  const unreadCount = items.filter((i) => i.status === 'UNREAD').length;

  const FILTERS = [
    { key: 'ALL', label: `All (${items.length})` },
    { key: 'LEAVE', label: 'Leave' },
    { key: 'BUDGET', label: 'Budget' },
    { key: 'NOTIFICATION', label: 'Notifications' },
  ];

  return (
    <div className="p-8">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Inbox</h1>
          <p className="mt-2 text-sm text-slate-500">
            {loading ? '…' : `${unreadCount} unread · ${items.length} total`}
          </p>
        </div>
        <div className="px-2 py-1">
          {!logoMissing ? (
            <Image src="/nextan-logo.png" alt="Nextan" width={140} height={46} className="h-auto w-full max-w-[140px] object-contain" priority onError={() => setLogoMissing(true)} />
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-4 pt-4">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setActiveFilter(f.key)}
              className={`rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeFilter === f.key ? 'bg-[#e8edf8] text-[#1a3a8f]' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400">No items to display.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {filtered.map((item, i) => (
              <li key={item.notification_id || i}
                onClick={() => markRead(item.notification_id)}
                className={`px-6 py-4 flex items-start gap-4 cursor-pointer hover:bg-slate-50 transition ${item.status === 'UNREAD' ? 'bg-blue-50/20' : ''}`}>
                <div className="mt-0.5 flex-shrink-0 rounded-xl px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-500">
                  {categoryLabel(item.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${item.status === 'UNREAD' ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.subtitle}</p>
                  {item.created_at && (
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(item.created_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
                {statusBadge(item.status)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}