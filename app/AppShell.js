"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import SidebarClient from './SidebarClient';
import UpdateNotice from './UpdateNotice';
import AttendanceReminders from './AttendanceReminders';
import TopBar from './TopBar';

const SIDEBAR_PREFIXES = ['/dashboard', '/attendance', '/leave', '/calendar', '/progress', '/inbox', '/profile', '/whats-new'];
const MOBILE_MEDIA_QUERY = '(max-width: 860px)';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The desktop rail can collapse to icons only (TopBar hamburger); remembered in this browser.
  const [collapsed, setCollapsed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
    return next;
  });
  const scrollRef = useRef(null);

  // The content lives in its own scrollable div (not the window), so Next.js's
  // default scroll-restoration-on-navigate never touches it — reset it manually.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

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
    <div
      className="flex min-h-screen"
      // The whole page background is navy on desktop — the "rail" is just this backdrop
      // showing through wherever the white content card doesn't cover it, so its rounded
      // corners never need pixel-matched patches behind them; there's no seam to misalign.
      style={isMobile ? undefined : { background: '#16307a' }}
    >
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-slate-950/30" onClick={() => setSidebarOpen(false)} />
      )}

      {(!isMobile || sidebarOpen) && (
        <SidebarClient isDrawer={isMobile} onClose={() => setSidebarOpen(false)} collapsed={collapsed} />
      )}

      <UpdateNotice sessionKey="staff_portal_user" />

      <main
        className="flex-1 flex flex-col"
        style={isMobile ? { minHeight: '100vh', background: '#f9fafb' } : {
          margin: '10px 10px 10px 0',
          background: '#ffffff',
          borderRadius: 32,
          overflow: 'hidden',
          height: 'calc(100vh - 20px)',
          boxShadow: '0 12px 30px rgba(15, 43, 122, 0.08)',
        }}
      >
        {/* Vertical padding on this wrapper insets the scrollable element (and therefore its
            native scrollbar) from the card's own top/bottom rounded corners — otherwise the
            scrollbar ends up sitting right on the curve and gets visually clipped by it. */}
        <div className="flex-1 flex flex-col" style={{ minHeight: 0, padding: isMobile ? 0 : '24px 0' }}>
          <div ref={scrollRef} className={`flex-1 overflow-y-auto${isMobile ? '' : ' page-scrollbar'}`} style={isMobile ? undefined : { paddingLeft: 20, paddingRight: 16 }}>
            <AttendanceReminders />
            <TopBar onMenuClick={isMobile ? () => setSidebarOpen(true) : toggleCollapsed} menuLabel={isMobile ? 'Open menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'} />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
