# Architecture note

- **Stack:** TanStack Start (React 19, SSR on edge workers), Tailwind v4 tokens, Vitest.
- **Feature modules** (`src/features/*`): typed, framework-light units.
  - `i18n` — `Locale`, `getDirection`, typed `MessageKey` dictionaries (Arabic must cover every English key at compile time), `LocaleProvider` syncing `<html lang dir>`.
  - `navigation` — single typed `NAV_ITEMS` registry driving the shell and dashboard.
  - `session` — discriminated `Session` union; currently always `signed-out`.
- **Shell** (`src/components/shell`): `AppShell` (layout, nav, language, session) and `ModulePage` (per-section header + empty state).
- **Routes** (`src/routes`): one file per section, each with its own head metadata.
- **Secrets boundary** (`src/features/*/*.functions.ts`): `createServerFn` handlers are the only place `process.env` is read; they return derived, non-secret values (e.g. `aiConfigured: boolean`). No keys use the `VITE_` prefix or ship to the browser.
- **Layout direction:** use logical utilities (`ms-`, `me-`, `start-`, `border-e`) so components flip automatically between RTL and LTR.

## Identity and data isolation (increment 2)
- **Auth:** email OTP via Lovable Cloud auth (`signInWithOtp` + `verifyOtp`). The client rejects non-`@kau.edu.sa` addresses before any request; a database trigger on account creation rejects them again.
- **Schema:** `profiles`, `platform_admins`, `projects`, `project_members`, `project_invitations`, `project_settings`, `project_files`, `project_comments`, `project_exports`, `audit_events`.
- **RLS:** every project-owned table is readable only when `is_project_member(project_id)`. No direct inserts into projects/members/invitations/audit; writes go through audited RPCs. Invitations require explicit `accept_invitation` by the matching signed-in email.
- **Admin:** `admin_list_projects()` works only for users in `platform_admins` (granted by service role only) and records an audit event.
- **Tests:** `bun run test` (unit), `bun run test:db` (RLS against the real backend), `bun run test:e2e` (signed-out OTP screen in a browser).

## Governed review workflow (migration `0001_governed_review_workflow`)

- States: draft → in_review → (changes_requested | approved) → superseded → archived. Enforced by a database trigger.
- Editing a draft changes it in place; editing an in_review, changes_requested or approved version creates a child draft (one open draft per artifact).
- Each project gets six default stages (owner-configurable via `save_workflow_stages`, only when no review is open). Approval at a stage opens the next stage on the same version; approval at the last stage marks it approved and supersedes older approved/returned versions.
- A corrected child of a returned version resumes at the stage that returned it; any other version starts at stage 1.
- Decisions record actor, project role, timestamp, version, stage and optional exception. Request changes and approve-with-exception require a comment; the latter also requires a documented exception (EXC-NNN).
- Every RPC writes an audit event. Code: `src/features/reviews/`, tests: `tests/db/reviews.db.ts`, `src/test/review-rules.test.ts`.

## Program intake, brief and alignment (migration `0002`)
- Feature modules: `src/features/intake` (canonical brief model, intake form, brief editor, server-only extraction), `src/features/architecture` (alignment rules, architecture editor). Route: `/program-architect`.
- See `docs/EXECUTION_LEDGER.md` for the design ruling and evidence.
