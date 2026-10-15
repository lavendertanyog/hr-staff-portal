// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 7,
    date: '13 Oct 2026',
    title: 'A fresh new look',
    body: 'The portal has a cleaner design, and the Dashboard now shows what matters today at a glance.',
    points: [
      'Dashboard greets you with your clock-in status and a Clock in / Clock out button',
      'Coming up shows your next leave and public holidays',
      'This week shows your hours timeline next to your project budgets',
      'My statistics shows a progress ring for each of your projects; click one to open Progress',
      'The menu button next to search hides or shows the sidebar labels; Profile and Log out are at the bottom of the sidebar',
      'Leave has a new plane icon, and the Calendar has a cleaner month view',
    ],
  },
  {
    id: 6,
    date: '12 Oct 2026',
    title: 'Claim expenses from a receipt photo',
    body: 'Open Claims, add photos of your receipts, and the portal fills in the date, shop, items and amount for you. Check the details, submit, and your manager and then HR approve each claim. Approved claims are paid with your salary.',
    points: [
      'Add up to 10 receipts at once; each one becomes its own claim',
      'Always check every field before you submit; you can correct anything the photo reading got wrong',
      'If the photo can’t be read, just type the details in yourself',
      'Service charge, each tax (such as SST or GST), rounding and discounts are listed under Charges and tax, and the form checks they add up to the amount paid',
      'You can edit or delete a claim until your manager reviews it',
      'Your Inbox tells you when a claim is approved, rejected or paid',
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
