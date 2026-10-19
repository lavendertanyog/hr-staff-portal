"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamCalendar from './TeamCalendar';
import { useT } from '../i18n/LanguageProvider';

export default function CalendarPage() {
  const { t } = useT();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  return (
    <div className="p-8">
      <div className="mb-8 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">{t("Staff Dashboard")}</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">{t("Calendar")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("Public holidays and who's on leave across the company.")}</p>
      </div>
      {user && <TeamCalendar backendBaseUrl={backendBaseUrl} sessionUser={user} />}
    </div>
  );
}
