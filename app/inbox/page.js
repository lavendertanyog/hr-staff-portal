"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { authHeaders } from '../authSession';
import { useT, getLocale } from '../i18n/LanguageProvider';

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

function statusBadge(status, t) {
  const s = String(status || '').toUpperCase();
  const map = {
    UNREAD: 'bg-blue-50 text-blue-700',
    READ: 'bg-gray-100 text-gray-500',
    APPROVED: 'bg-green-50 text-green-700',
    REJECTED: 'bg-red-50 text-red-600',
    PENDING: 'bg-yellow-50 text-yellow-700',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-500'}`}>{t(s)}</span>;
}

export default function InboxPage() {
  const { t } = useT();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'LEAVE' | 'BUDGET' | 'NOTIFICATION'
  const [selectedItem, setSelectedItem] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  const fetchInbox = useCallback(async (uid) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/${uid}/inbox`, { headers: authHeaders() });
      setItems(res.data?.data || []);
    } catch (err) {
      setItems([]);
      // The inbox needs this tab's session token; a tab signed in before sessions existed, or
      // whose session has ended, gets 401 and is told to log in again.
      setLoadError(err.response?.data?.error || 'Failed to load your inbox.');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.user_id) fetchInbox(user.user_id); }, [user?.user_id, fetchInbox]);

  const markRead = async (notifId) => {
    if (!notifId) return;
    try {
      await axios.patch(`${API_BASE}/api/v1/notifications/${notifId}/read`, null, { headers: authHeaders() });
      setItems((prev) => prev.map((i) => i.notification_id === notifId ? { ...i, status: 'READ' } : i));
    } catch {}
  };

  const handleOpenItem = (item) => {
    setSelectedItem(item);
    if (item.status === 'UNREAD') markRead(item.notification_id);
  };

  const filtered = activeFilter === 'ALL' ? items : items.filter((i) => i.category === activeFilter);
  const unreadCount = items.filter((i) => i.status === 'UNREAD').length;

  const FILTERS = [
    { key: 'ALL', label: t("All ({length})", { length: items.length }) },
    { key: 'LEAVE', label: t("Leave") },
    { key: 'BUDGET', label: t("Budget") },
    { key: 'NOTIFICATION', label: t("Notifications") },
  ];

  return (
    <div className="p-8">
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">{t("Staff Dashboard")}</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">{t("Inbox")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {loading ? '…' : t("{unreadCount} unread · {length} total", { unreadCount: unreadCount, length: items.length })}
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-4 pt-4">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setActiveFilter(f.key)}
              className={`rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeFilter === f.key ? 'bg-[#e8edf8] text-[#1a3a8f]' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t(f.label)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400">{t("Loading…")}</p>
        ) : loadError ? (
          <p className="px-6 py-8 text-sm text-red-600">{loadError}</p>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400">{t("No items to display.")}</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {filtered.map((item, i) => (
              <li key={item.notification_id || i}
                onClick={() => handleOpenItem(item)}
                className={`grid grid-cols-[72px_1fr_72px] sm:grid-cols-[96px_1fr_96px] items-center gap-3 px-4 sm:px-6 py-4 cursor-pointer hover:bg-slate-50 transition ${item.status === 'UNREAD' ? 'bg-blue-50/20' : 'opacity-60'}`}>
                <div className="flex-shrink-0">
                  <span className="block w-full truncate rounded-xl px-2 py-1 text-center text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-500">
                    {t(categoryLabel(item.category))}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className={`text-sm truncate ${item.status === 'UNREAD' ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    {t(item.title)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{t(item.subtitle)}</p>
                  {item.created_at && (
                    <p className="text-xs text-slate-400 mt-1 truncate">
                      {new Date(item.created_at).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' })}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 flex justify-end">
                  {statusBadge(item.status, t)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Detail modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedItem(null)}>
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-xl px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-500">
                    {t(categoryLabel(selectedItem.category))}
                  </span>
                  {statusBadge(selectedItem.status, t)}
                </div>
                <h2 className="text-lg font-semibold text-slate-900 break-words">{t(selectedItem.title)}</h2>
              </div>
              <button onClick={() => setSelectedItem(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 text-xl leading-none flex-shrink-0">&times;</button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{t(selectedItem.subtitle)}</p>
              {selectedItem.created_at && (
                <p className="mt-4 text-xs text-slate-400">
                  {new Date(selectedItem.created_at).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' })}
                </p>
              )}
            </div>
            <div className="flex justify-end px-6 pb-6 pt-2">
              <button onClick={() => setSelectedItem(null)}
                className="rounded-2xl bg-[#1a3a8f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12307a] transition">{t("Close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}