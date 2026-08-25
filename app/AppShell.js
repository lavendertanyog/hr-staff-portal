"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import SidebarClient from './SidebarClient';
import AttendanceReminders from './AttendanceReminders';

const SIDEBAR_PREFIXES = ['/dashboard', '/attendance', '/leave', '/progress', '/inbox'];
const MOBILE_MEDIA_QUERY = '(max-width: 860px)';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateState = () => {
      setIsMobile(mql.matches);
      if (!mql.matches) {
        setSidebarOpen(false);
      }
    };
    updateState();
    mql.addEventListener?.('change', updateState);
    return () => mql.removeEventListener?.('change', updateState);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    setSidebarOpen(false);
  }, [pathname, isMobile]);

  const showSidebar = SIDEBAR_PREFIXES.some((p) => pathname.startsWith(p));

  if (!showSidebar) {
    return <main className="min-h-screen bg-gray-50">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-slate-950/30" onClick={() => setSidebarOpen(false)} />
      )}

      {(!isMobile || sidebarOpen) && (
        <SidebarClient isDrawer={isMobile} onClose={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 overflow-y-auto">
        <AttendanceReminders />
        {isMobile && (
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Menu
            </button>
            {!logoMissing ? (
              <img src="/nextan-logo.png" alt="Nextan" width={130} height={42}
                className="h-10 w-auto max-w-[130px] object-contain"
                onError={() => setLogoMissing(true)} />
            ) : (
              <span className="text-sm font-bold text-blue-900 tracking-tight">nextan</span>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
