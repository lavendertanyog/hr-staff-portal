// Leave display helpers, shared by the leave screens. This file is identical in the Staff,
// Manager and HR portals — change every copy together.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Leave dates are shown as DD-MMM-YYYY, e.g. 31-Oct-2026. A YYYY-MM-DD value is a calendar date
// and is formatted as-is; a full timestamp (e.g. created_at) is first converted to its SGT date,
// so a request made at 1:30 am SGT doesn't show the previous (UTC) day.
export function formatLeaveDate(value) {
  if (!value) return '—';
  const s = String(value);
  let ymd = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (!ymd) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  }
  const [y, m, day] = ymd.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y}`;
}

// MCs are stored as base64 data: links, which Chrome refuses to open in a new tab (the tab stays
// blank). Turn the data into a temporary blob link first, then open that.
export function openMcFile(url) {
  if (!url) return;
  const s = String(url);
  if (!s.startsWith('data:')) { window.open(s, '_blank', 'noopener'); return; }
  const comma = s.indexOf(',');
  const meta = s.slice(5, comma);
  const mime = meta.split(';')[0] || 'application/octet-stream';
  const body = s.slice(comma + 1);
  const bytes = meta.includes(';base64')
    ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(body));
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(blobUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
