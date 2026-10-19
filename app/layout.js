import './globals.css';
import AppShell from './AppShell';
import { LanguageProvider } from './i18n/LanguageProvider';

export const metadata = {
  title: 'Nextan Staff Portal',
  description: 'Staff workspace for attendance, leave and progress',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <AppShell>{children}</AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
