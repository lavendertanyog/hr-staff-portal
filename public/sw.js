// Service worker for the installed app. It caches nothing, so every Vercel deploy shows up
// straight away; it's here so the portal can be installed and can show notifications on
// phones (Android only allows notifications from a service worker).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Push messages from the backend (not sent yet): { title, body, url }.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { body: event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Nextan Staff Portal', {
    body: data.body || '',
    icon: '/icon-192.png',
    data: { url: data.url || '/attendance' },
  }));
});

// Tapping a notification brings the open portal to the front, or opens it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/attendance';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      if ('navigate' in open) open.navigate(url).catch(() => {});
      return;
    }
    await self.clients.openWindow(url);
  })());
});
