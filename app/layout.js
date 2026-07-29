import './globals.css';
import AppShell from './AppShell';

export const metadata = {
  title: 'Nextan Staff Portal',
  description: 'Staff workspace for attendance, leave and progress',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

