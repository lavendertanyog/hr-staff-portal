// Office time zones. Each user's office country (users.home_office_country) is set by HR on the
// Users page, and attendance is recorded and shown in that office's time: a 9:00 AM clock-in in
// Colombo reads 9:00 AM to the staff member and to their manager. None of these zones has
// daylight saving. Same file in all four portals; keep the copies identical.

export const OFFICE_COUNTRIES = [
  { code: 'SG', name: 'Singapore', timeZone: 'Asia/Singapore' },
  { code: 'MY', name: 'Malaysia', timeZone: 'Asia/Kuala_Lumpur' },
  { code: 'CN', name: 'China', timeZone: 'Asia/Shanghai' },
  { code: 'LK', name: 'Sri Lanka', timeZone: 'Asia/Colombo' },
];

export const DEFAULT_COUNTRY = 'SG';
export const DEFAULT_TIME_ZONE = 'Asia/Singapore';

function findCountry(code) {
  const upper = String(code || '').toUpperCase();
  return OFFICE_COUNTRIES.find((c) => c.code === upper) || null;
}

export function timeZoneForCountry(code) {
  return findCountry(code)?.timeZone || DEFAULT_TIME_ZONE;
}

export function countryName(code) {
  return findCountry(code)?.name || 'Singapore';
}

// Short label shown next to times outside Singapore, e.g. "LK". Empty for Singapore, so pages
// with only Singapore staff look exactly as before.
export function timeZoneLabel(code) {
  const c = findCountry(code);
  return c && c.code !== DEFAULT_COUNTRY ? c.code : '';
}

// Minutes the time zone is ahead of UTC at an instant (Colombo is +330, Singapore +480).
export function tzOffsetMinutes(instant, timeZone) {
  const d = new Date(instant);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

// "+05:30" for Colombo, "+08:00" for Singapore, for building an unambiguous datetime string.
export function offsetString(timeZone, instant = new Date()) {
  const mins = tzOffsetMinutes(instant, timeZone);
  const sign = mins < 0 ? '-' : '+';
  const abs = Math.abs(mins);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// The wall-clock time in `timeZone` as a Date whose UTC getters read that local time.
// Only the UTC getters on the result are meaningful.
export function zonedWallClock(instant, timeZone) {
  const d = new Date(instant);
  return new Date(d.getTime() + tzOffsetMinutes(d, timeZone) * 60000);
}

// Malaysia's states and federal territories. A Malaysian holiday that only some of them observe
// lists them in `states`; the backend uses the same names.
export const MALAYSIA_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Malacca', 'Negeri Sembilan', 'Pahang', 'Penang', 'Perak', 'Perlis',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
];

// A holiday's name as shown on the calendars: "Thaipusam (Selangor, Penang only)" when only some
// Malaysian states observe it, or "Deepavali (all states except Sarawak)" when nearly all do.
// Nationwide holidays keep their plain name.
export function holidayLabel(holiday) {
  const name = holiday?.name || '';
  const states = Array.isArray(holiday?.states) ? holiday.states : [];
  if (states.length === 0) return name;
  const missing = MALAYSIA_STATES.filter((st) => !states.includes(st));
  if (missing.length === 0) return name;
  const where = missing.length <= 3 && missing.length < states.length
    ? `all states except ${missing.join(', ')}`
    : `${states.join(', ')} only`;
  return `${name} (${where})`;
}
