# Release readiness

Status: **not release-ready**. The core scope is incomplete (media-rights workflow, quality gate and exports are still to come; the compliance library and AI assistance are built but not yet verified against the live backend). The app is private and unpublished.

| Gate | Status | Evidence |
|---|---|---|
| Tests green | Partly (increment 6) | 73 unit/screen green. Database/RLS: 35 verified in increment 5; 8 new compliance tests **not yet run** (need backend keys). Browser: 3 from increment 5; no compliance scenario yet. See EXECUTION_LEDGER |
| Project tables have RLS | Yes, for all current tables (compliance tables: enabled; isolation test written, not yet run) | Non-member zero-row tests in `tests/db/*.db.ts` |
| Storage authorization | Yes (`project-sources`) | Non-member list/download/upload denied in `intake.db.ts` |
| Mutations via audited RPCs | Yes | Writes only through security-definer RPCs; tables are SELECT-only to users |
| AI assistance | Built; off by default; verified locally (0009) | Drafts only; AI provenance and review gates in the database; full usage log; `tests/sql/run.sh` 64/64; no live provider calls yet. See `docs/AI_SETUP.md` |
| Segregation of duties | Built and verified locally (0008) | No self-decision (except export freeze); compliance stage cannot be removed; exceptions need independent approval. `tests/sql/run.sh`: 29/29 on PostgreSQL 16; live-backend run pending |
| Immutability of approved/in-review | Yes | Lock triggers apply to every role, tested with the service key |
| Security linter | 1 info (intentional locked `platform_admins`) and 30 warnings for RPCs meant to be callable (each checks role itself) | `supabase linter` |
| Accessibility | Partial: labelled controls, keyboard tested in E2E; no full WCAG 2.2 AA audit yet | — |
| Pending external configuration | Sender email domain and code-based sign-in emails; first platform admin | — |
| Course content safety | Yes | Strict per-type payload schema in the database; HTML/script text rejected; content rendered as text only (no injected HTML); embeds need https, render only for approved hosts, sandboxed iframe |
| Review gate for courses | Yes | Critical content defects block `request_review` in the database (`course.db.ts`) |
| Responsive / RTL | Course Studio checked at 1280 and 390 wide, Arabic and English | `course_studio.py` |
| Compliance gate | Built, not yet verified against the backend | Open blocker findings block review request and approval (triggers in `0007`); `compliance.db.ts` covers it |

## Open risks
- **AI hosting decision pending:** where the model may run and what data may leave the university (PDPL/SDAIA). AI stays off until `AI_ENABLED=true` and a key are set.
- AI output quality (Arabic register, outcome quality, references) is untested with real users; plan a pilot and watch the unchanged-acceptance rate.
- Course Studio and architecture AI insertions are accepted by the person who inserts them; only briefs keep a persistent AI label in the database.
- No owner yet for the institutional glossary.
- Migration 0008 turned all existing documented exceptions to *pending*; a compliance reviewer must approve them before they can be used again.
- Single-owner projects need a second approver for stage 1 (brief confirmation) under the no-self-decision rule.
- Review routing is still the same six stages for every artifact kind, with one decider per stage; per-kind routes and quorum await a policy decision.
- Compliance Library database tests have not been run since migration 0007 was written; treat compliance enforcement as unverified until `bun run test:db` passes.
- Compliance sources and rules are project-specific; there is no institution-wide, officially approved library yet.
- The embed allowlist (YouTube no-cookie, YouTube, Vimeo player) is an interim platform default and needs institutional approval.
- Media are records with an https source and rights note; no upload or rights approval yet.
- Autosave sends the whole course; two people editing the same draft at once: the last save wins.
