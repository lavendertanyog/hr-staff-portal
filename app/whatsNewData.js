// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 8,
    date: '12 Oct 2026',
    title: 'Manual entry: add your end time',
    body: 'When you enter today’s hours by hand, you can now add the end time at the same time instead of clocking out later.',
    points: [
      'Fill in "End Time (optional)" on the Manual Entry tab',
      'Leave it empty to clock in now and clock out as usual',
      'The button reads "Submit" when an end time is set, and "Clock In" when it is not',
    ],
  },
  {
    id: 7,
    date: '12 Oct 2026',
    title: 'Company calendar, and a more accurate dashboard',
    body: 'See who is on leave and when the public holidays are, and trust the numbers on your dashboard.',
    points: [
      'New Calendar page in the sidebar shows approved leave by name, in Month or List view, plus public holidays (leave type and reason stay private)',
      'The Unread Notifications card on the Dashboard now counts your whole Inbox, not just the latest 6',
      'Your Inbox is now private to you. If you see "Your sign-in has ended", log in again once',
    ],
  },
  {
    id: 6,
    date: '12 Oct 2026',
    title: 'Leave page improvements',
    body: 'Several things that were awkward on the Leave page now work the way you’d expect.',
    points: [
      'View MC now opens the photo or PDF properly',
      'Editing a leave request keeps your reason, and shows the MC you already attached',
      'Dates read like 31-Oct-2026 everywhere on the Leave page',
      '"Submitted" shows the correct Singapore date',
      'Deleting a request asks you in a proper window instead of a browser pop-up',
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
