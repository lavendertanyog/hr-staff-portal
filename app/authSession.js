// Login session helpers, shared by the login page, Log out and the Profile page's device list.
// This file is identical in all four portals — change every copy together.
//
// Every login returns a session token, kept in sessionStorage for this tab. With "Remember me on
// this device" ticked it's also kept in localStorage, and the login page trades it for a fresh one
// (POST /auth/resume) so the user skips the password until it expires: 30 days, or 1 day for HR.
// Log out ends the session but keeps the remembered email; "Not you?" forgets both.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

export const REMEMBERED_EMAIL_KEY = 'remembered_email';
const DEVICE_TOKEN_KEY = 'device_token';
const SESSION_TOKEN_KEY = 'session_token';

function read(storage, key) {
  try { return storage.getItem(key) || null; } catch { return null; }
}

export function getDeviceToken() { return read(localStorage, DEVICE_TOKEN_KEY); }
export function getSessionToken() { return read(sessionStorage, SESSION_TOKEN_KEY); }

export function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Call after a successful /auth/login or /auth/resume.
export function saveSession({ session, rememberMe, email }) {
  try {
    if (session?.token) sessionStorage.setItem(SESSION_TOKEN_KEY, session.token);
    else sessionStorage.removeItem(SESSION_TOKEN_KEY);
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      if (session?.trusted) localStorage.setItem(DEVICE_TOKEN_KEY, session.token);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      localStorage.removeItem(DEVICE_TOKEN_KEY);
    }
  } catch {}
}

// Drops a remembered sign-in the server has rejected, unless another tab already replaced it.
export function clearDeviceToken(token) {
  try {
    if (!token || localStorage.getItem(DEVICE_TOKEN_KEY) === token) localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {}
}

// Ends one session on the server. Fire-and-forget, so signing out never waits on the network.
export function revokeSessionToken(token) {
  if (!token) return;
  fetch(`${API_BASE}/api/v1/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    .catch(() => {});
}

// Log out: ends this device's session on the server. The remembered email stays.
export function endSession() {
  const tokens = new Set([getSessionToken(), getDeviceToken()].filter(Boolean));
  tokens.forEach(revokeSessionToken);
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch {}
  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch {}
}

// "Not you?": ends the session and forgets the remembered email too.
export function forgetThisDevice() {
  endSession();
  try { localStorage.removeItem(REMEMBERED_EMAIL_KEY); } catch {}
}
