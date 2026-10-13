// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 8,
    date: '12 Oct 2026',
    title: 'Manual entry: add your end time',
    summary: "Add the end time when you enter today’s hours by hand",
    chips: ['Optional end time','Clock in and out in one go','Clearer button'],
    body: 'When you enter today’s hours by hand, you can now add the end time at the same time instead of clocking out later.',
    points: [
      { icon: "clock", lead: "End Time (optional)", text: "on the Manual Entry tab sets today’s clock-out in one go" },
      { icon: "check", lead: "Leave it empty", text: "to clock in now and clock out as usual" },
      { icon: "sparkles", lead: "The button", text: "reads \"Submit\" when an end time is set, and \"Clock In\" when it is not" },
    ],
  },
  {
    id: 7,
    date: '12 Oct 2026',
    title: 'Company calendar, and a more accurate dashboard',
    summary: "See who is on leave, and a Dashboard count you can trust",
    chips: ['New Calendar page','Accurate unread count','Private Inbox'],
    body: 'See who is on leave and when the public holidays are, and trust the numbers on your dashboard.',
    points: [
      { icon: "calendar", lead: "New Calendar page", text: "in the sidebar shows approved leave by name, in Month or List view, plus public holidays" },
      { icon: "lock", lead: "Leave type and reason", text: "stay private" },
      { icon: "bell", lead: "Unread Notifications", text: "on the Dashboard now counts your whole Inbox, not just the latest 6" },
      { icon: "shield", lead: "Your Inbox is now private", text: "to you. If you see \"Your sign-in has ended\", log in again once" },
    ],
  },
  {
    id: 6,
    date: '12 Oct 2026',
    title: 'Leave page improvements',
    summary: "View MC, editing and dates all work the way you’d expect",
    chips: ['View MC opens','Edit keeps your reason','Dates as 31-Oct-2026'],
    body: 'Several things that were awkward on the Leave page now work the way you’d expect.',
    points: [
      { icon: "file", lead: "View MC", text: "now opens the photo or PDF properly" },
      { icon: "edit", lead: "Editing a leave request", text: "keeps your reason, and shows the MC you already attached" },
      { icon: "calendar", lead: "Dates", text: "read like 31-Oct-2026 everywhere on the Leave page" },
      { icon: "clock", lead: "\"Submitted\"", text: "shows the correct Singapore date" },
      { icon: "window", lead: "Deleting a request", text: "asks you in a proper window instead of a browser pop-up" },
    ],
  },
  {
    id: 5,
    date: '8 Oct 2026',
    title: 'Remember me on this device',
    body: 'Tick "Remember me on this device" when you log in and you’ll stay signed in on that browser for 30 days (1 day for HR accounts). Next time, the portal signs you straight in without your password.',
    points: [
      'Log out ends the sign-in but keeps your email filled in, partly hidden (e.g. ju•••@nextan.com.sg)',
      'Click "Not you?" on the login page to forget the email and use a different account',
      'See and sign out your remembered devices from your Profile page',
      'Changing your password signs out your other devices',
      'Don’t tick it on a shared or public computer',
    ],
  },
  {
    id: 4,
    date: '18 Sept 2026',
    title: 'Find anything faster',
    body: 'The search bar in the top bar now actually works — type a page name or an action like "clock in" or "budget" and jump straight there.',
    points: [
      'Type a page name (e.g. "leave", "budget") to jump straight there',
      'Matching text is highlighted as you type',
      'Use the arrow keys and Enter to jump to a result without touching the mouse',
    ],
  },
  {
    id: 3,
    date: '18 Sept 2026',
    title: 'Clearer attendance history',
    body: 'Recent Entries now shows how long each session lasted, and overnight shifts get a clear "Ends <date>" label instead of a confusing "+1 day".',
    points: [
      'Each entry now shows the total duration worked',
      'Overnight shifts show a clear "Ends <date>" label instead of a confusing "+1 day"',
      'Recent Entries can be filtered by this week, this month, or a custom date range',
    ],
  },
  {
    id: 2,
    date: '17 Sept 2026',
    title: 'Leave calendar improvements',
    body: 'Hover any marked date to see what it is. Approved and pending are now easier to tell apart, and Sick Leave no longer uses an alarming red.',
    points: [
      'Hover any marked date to see what it is',
      'Approved and pending leave are now visually distinct',
      'Sick Leave no longer uses an alarming red color',
    ],
  },
  {
    id: 1,
    date: '16 Sept 2026',
    title: 'Attendance hours fixed',
    body: 'Fixed a bug where an hour was deducted from your worked time even on shifts that never crossed lunch.',
    points: [
      'Fixed a bug that deducted an hour from worked time even on shifts that never crossed lunch',
      'Applies retroactively to shifts already logged before the fix',
    ],
  },
];
export const WHATS_NEW_LATEST_ID = WHATS_NEW[0].id;
export const WHATS_NEW_SEEN_KEY = 'staff_portal_whats_new_seen';

// Short summary shown in the one-time update notice after login (see UpdateNotice.js). Keep it to
// three lines and update it with each release; the full list stays in WHATS_NEW above.
export const WHATS_NEW_NOTICE = {
  portal: "Staff portal",
  highlights: [
    { icon: "calendar", lead: "Company calendar", text: "shows who is on leave and the public holidays" },
    { icon: "file", lead: "Leave page fixes:", text: "View MC opens, and editing keeps your reason" },
    { icon: "clock", lead: "Manual entry", text: "now takes an optional end time" },
  ],
};
