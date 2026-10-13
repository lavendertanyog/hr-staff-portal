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
