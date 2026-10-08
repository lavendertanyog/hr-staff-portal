# hr-staff-portal

The Staff portal (clock in/out, manual entry, leave, progress logs, budget requests, inbox) of the Nextan Timesheet System. Next.js 16 (App Router, JavaScript), React 19, Tailwind CSS 4, axios. Runs locally on port 3003 (`npm run dev -- -p 3003`). Logged-in user is kept in `sessionStorage` under `staff_portal_user`.

Shared workspace notes, skills and agents live one folder up, in `../CLAUDE.md` and `../.claude/`. If the `nextan-*` skills are not loaded, read them directly from `../.claude/skills/<name>/SKILL.md`.

- Before any UI change, follow `nextan-ui-design`. If the same page or component exists in the other portals, follow `nextan-cross-portal` and change every copy.
- This Next.js version has breaking changes. Check `node_modules/next/dist/docs/` before using an unfamiliar API.
- Work on your own branch (see the Team table in `../CLAUDE.md`). Never run `vercel --prod`.
- Before reporting a task as done, run `nextan-release-check`.
