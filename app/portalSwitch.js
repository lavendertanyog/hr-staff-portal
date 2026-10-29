// Switch portal: someone with several roles moves between the Staff, Manager, Account Manager and
// HR portals without signing in again. The portals are separate sites, so this portal asks the
// backend for a one-time code (POST /auth/handoff) and opens the other portal's login page with
// it; that page trades it for its own session (POST /auth/handoff/exchange).
// This file is identical in all four portals (Staff, Manager, Account Manager, HR); change every copy together.

import { authHeaders } from './authSession';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

// devPort: where each portal runs locally (npm run dev -- -p <port>), used on localhost.
export const PORTALS = [
  { key: 'staff', label: 'Staff portal', url: 'https://staff.nextantech.com', devPort: 3003 },
  { key: 'manager', label: 'Manager portal', url: 'https://manager.nextantech.com', devPort: 3001 },
  { key: 'account_manager', label: 'Account Manager portal', url: 'https://accountmanager.nextantech.com', devPort: 3002 },
  { key: 'hr', label: 'HR portal', url: 'https://hr.nextantech.com', devPort: 3000 },
];

function portalOrigin(portal) {
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:${portal.devPort}`;
  return portal.url;
}

const rolesOf = (user) => (Array.isArray(user?.user_roles) && user.user_roles.length > 0 ? user.user_roles : [user?.user_role])
  .filter(Boolean).map((r) => String(r).toLowerCase());

// The other portals this user can open: the Staff portal is open to every role (as its login page
// is); the others need their own role. Same rule as the backend.
export function otherPortals(user, currentKey) {
  const roles = rolesOf(user);
  if (roles.length === 0) return [];
  return PORTALS.filter((p) => p.key !== currentKey && (p.key === 'staff' || roles.includes(p.key)));
}

// Opens another portal already signed in. Resolves to an error message if it can't.
export async function switchPortal(targetKey) {
  const portal = PORTALS.find((p) => p.key === targetKey);
  if (!portal) return 'Unknown portal.';
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ portal: targetKey }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.code) return payload.error || "Couldn't switch portal. Please try again.";
    window.location.assign(`${portalOrigin(portal)}/?handoff=${encodeURIComponent(payload.code)}`);
    return null;
  } catch {
    return "Couldn't reach the server. Please try again.";
  }
}

// On the login page: trades a ?handoff= code for a session in this portal.
// Resolves to { payload } (same shape as a login response) or { error }.
export async function exchangeHandoff(code, currentKey) {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/handoff/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, portal: currentKey }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { error: payload.error || 'That link has expired. Please sign in.' };
    return { payload };
  } catch {
    return { error: "Couldn't reach the server. Please sign in." };
  }
}
