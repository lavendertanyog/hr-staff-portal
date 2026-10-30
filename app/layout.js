import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import AppShell from './AppShell';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata = {
  title: 'Nextan Staff Portal',
  description: 'Staff workspace for attendance, leave and progress',
  applicationName: 'Nextan Staff',
  appleWebApp: { capable: true, title: 'Nextan Staff', statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
};

export const viewport = {
  themeColor: '#16307a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={jakarta.className}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
