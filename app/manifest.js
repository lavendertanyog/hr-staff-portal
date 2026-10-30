// Web app manifest: lets phones and desktops install the portal as an app (served at /manifest.webmanifest).
export default function manifest() {
  return {
    id: '/',
    name: 'Nextan Staff Portal',
    short_name: 'Nextan Staff',
    description: 'Staff workspace for attendance, leave and progress',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#16307a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
