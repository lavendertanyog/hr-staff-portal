// Steps for the first-login walkthrough (WalkthroughTour.js). Each portal has its own copy.
// `target` is a CSS selector for the element the step points at; leave it out for a centred card.
// The first step is the welcome card and isn't counted in "1 of N".

export const TOUR_PORTAL = 'staff';
export const TOUR_SESSION_KEY = 'staff_portal_user';

const nav = (href) => `nav[aria-label="Main"] a[href="${href}"]`;

export const TOUR_STEPS = [
  {
    title: 'Welcome to the Staff portal',
    body: "Here's a quick look around so you know where everything is. It takes about a minute, and you can skip it at any time.",
  },
  {
    target: nav('/dashboard'),
    title: 'Dashboard',
    body: 'Start here each day. See whether you are clocked in, your hours this week and anything that needs your attention.',
  },
  {
    target: nav('/attendance'),
    title: 'Attendance',
    body: 'Clock in and out live, or enter your actual times by hand for project or general work.',
  },
  {
    target: nav('/leave'),
    title: 'Leave',
    body: 'Apply for leave and follow each request until your manager approves it.',
  },
  {
    target: nav('/calendar'),
    title: 'Calendar',
    body: "Public holidays and who's on leave across the company.",
  },
  {
    target: nav('/progress'),
    title: 'Progress',
    body: 'Log progress updates on your projects and request extra budget hours.',
  },
  {
    target: nav('/claims'),
    title: 'Claims',
    body: 'Add photos of your receipts to claim expenses. Your manager, then HR, approve each claim, and it is paid with your salary.',
  },
  {
    target: nav('/inbox'),
    title: 'Inbox',
    body: 'Replies to your leave, claims and requests arrive here.',
  },
  {
    target: 'input[aria-label="Search"]',
    title: 'Search',
    body: 'Type what you want to do, for example "clock in", to jump straight to the right page.',
  },
  {
    target: 'button[aria-label^="Notifications"]',
    title: 'Notifications',
    body: 'The bell shows new updates as they arrive. Open it to see them, or go to your inbox.',
  },
  {
    target: 'aside a[href="/profile"]',
    title: 'Your profile',
    body: 'Change your password and see the devices you stay signed in on. You can take this tour again from here at any time.',
  },
];
