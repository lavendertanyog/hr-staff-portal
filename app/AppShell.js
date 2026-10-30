"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import SidebarClient, { PAGE_BG } from './SidebarClient';
import AttendanceReminders from './AttendanceReminders';
import TopBar from './TopBar';
import WalkthroughTour from './WalkthroughTour';
import { registerServiceWorker } from './pwa';

const SIDEBAR_PREFIXES = ['/dashboard', '/attendance', '/leave', '/calendar', '/progress', '/claims', '/inbox', '/profile', '/whats-new'];
const MOBILE_MEDIA_QUERY = '(max-width: 860px)';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop rail collapsed to icons only; toggled by the top bar's menu button and remembered
  // in this browser. Read after mount so the server and first client render match.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('sidebar_collapsed') === '1'); } catch {}
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
    return next;
  });
  // Lets the portal be installed as an app and show notifications on phones.
  useEffect(() => { registerServiceWorker(); }, []);
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

  if (isMobile) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_BG }}>
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-slate-950/30" onClick={() => setSidebarOpen(false)} />
        )}
        {sidebarOpen && <SidebarClient isDrawer onClose={() => setSidebarOpen(false)} />}
        <main ref={scrollRef}>
          <AttendanceReminders />
          <WalkthroughTour />
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
          {children}
        </main>
      </div>
    );
  }

  // Desktop: the page background is navy, so the icon rail is just that backdrop showing beside
  // the rounded content card; there's no seam between them to misalign.
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#16307a' }}>
      <SidebarClient collapsed={collapsed} />
      <main className="flex-1 min-w-0 flex flex-col"
        style={{
          margin: '10px 10px 10px 0',
          background: PAGE_BG,
          borderRadius: 32,
          overflow: 'hidden',
          boxShadow: '0 12px 30px rgba(15, 43, 122, 0.08)',
        }}>
        {/* Vertical padding on this wrapper insets the scrollable element (and therefore its
            scrollbar) from the card's rounded corners, so the scrollbar never sits on the curve. */}
        <div className="flex-1 flex flex-col" style={{ minHeight: 0, padding: '16px 0' }}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto page-scrollbar" style={{ paddingLeft: 12, paddingRight: 8 }}>
            <AttendanceReminders />
            <WalkthroughTour />
            <TopBar onMenuClick={toggleCollapsed} menuExpanded={!collapsed} />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
