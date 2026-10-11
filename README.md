# KAU AI Program Studio

Private workspace for King Abdulaziz University program and course design. This is the **production foundation**: application shell, bilingual layout, design tokens and module routes. No external integrations, Blackboard connection, or public publishing yet.

## Features in this phase
- Arabic-first (RTL, default) and English (LTR) with a language switch; choice remembered per browser.
- Accessible responsive shell: skip link, labelled navigation, `aria-current`, keyboard focus rings, mobile drawer.
- Sections: Dashboard, Projects, Program Architect, Course Studio, Compliance Library, Reviews, Media, Exports, Settings.
- Restrained blue/teal tokens in `src/styles.css`, marked for replacement with the official KAU brand guide. No logo is invented (neutral placeholder mark).
- KAU email one-time-code sign-in and private, member-only project workspaces with invitations.
- Search engines blocked (`robots.txt` + `noindex`).

## Scripts
- `bun run dev` — development server (copy `.env.example` to `.env` first)
- `bun run build` / `bun run start` — production build and Node server
- `bun run db:migrate` / `bun run db:status` — apply / list database migrations (`DATABASE_URL` required)
- `bun run test` — unit and screen tests; `bash tests/sql/run.sh` — database checks on plain PostgreSQL; `bun run test:db` — tests against a live backend

## Hosting
Self-hosted: a Node server (or the `Dockerfile`) and a Supabase backend. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
