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
- `bun run dev` — dev server
- `bun run test` — Vitest (locale direction, signed-out shell, routing)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
