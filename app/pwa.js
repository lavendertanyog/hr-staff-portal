// Installed-app helpers: registers the service worker (public/sw.js) and shows notifications.

export function registerServiceWorker() {
  try {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  } catch {}
}

// Shows a system notification if the user allowed them. Goes through the service worker when
// there is one, because Android ignores `new Notification()`; falls back to it on desktop.
export function showBrowserNotification(title, body) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const opts = { body, icon: '/icon-192.png', data: { url: '/attendance' } };
    const fallback = () => { try { new Notification(title, opts); } catch {} };
    if (!('serviceWorker' in navigator)) { fallback(); return; }
    navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.showNotification(title, opts) : fallback()))
      .catch(fallback);
  } catch {}
}
