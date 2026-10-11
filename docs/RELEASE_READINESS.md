# Release readiness

Status: **not release-ready**. The core scope is incomplete (media-rights workflow and quality gate are still to come; exports are built but not yet tried in Blackboard; the compliance library and AI assistance are built but not yet verified against the live backend). The app is private and unpublished.

| Gate | Status | Evidence |
|---|---|---|
| Tests green | Partly (increment 6) | 73 unit/screen green. Database/RLS: 35 verified in increment 5; 8 new compliance tests **not yet run** (need backend keys). Browser: 3 from increment 5; no compliance scenario yet. See EXECUTION_LEDGER |
| Project tables have RLS | Yes, for all current tables (compliance tables: enabled; isolation test written, not yet run) | Non-member zero-row tests in `tests/db/*.db.ts` |
| Storage authorization | Yes (`project-sources`) | Non-member list/download/upload denied in `intake.db.ts` |
| Mutations via audited RPCs | Yes | Writes only through security-definer RPCs; tables are SELECT-only to users |
| AI assistance | Built; off by default; verified locally (0009) | Drafts only; AI provenance and review gates in the database; full usage log; `tests/sql/run.sh` 64/64; no live provider calls yet. See `docs/AI_SETUP.md` |
| Guidance and ease of use | Built; verified locally (0010) | My work, journey tracker, review-readiness checklist mirroring the gates, autosave for brief/architecture drafts, plain errors. `tests/sql/run.sh` 87/87; usability test with users pending (`docs/USABILITY_TEST.md`) |
| Exports | Built; verified locally (0011) | Official only from approved versions; watermarked previews; immutable log with SHA-256; files opened in LibreOffice and SCORM run in Chromium. `tests/sql/run.sh` 110/110; Blackboard import pending |
| Segregation of duties | Built and verified locally (0008) | No self-decision (except export freeze); compliance stage cannot be removed; exceptions need independent approval. `tests/sql/run.sh`: 29/29 on PostgreSQL 16; live-backend run pending |
| Immutability of approved/in-review | Yes | Lock triggers apply to every role, tested with the service key |
| Security linter | 1 info (intentional locked `platform_admins`) and 30 warnings for RPCs meant to be callable (each checks role itself) | `supabase linter` |
| Accessibility | Partial: labelled controls, keyboard tested in E2E; no full WCAG 2.2 AA audit yet | — |
| Pending external configuration | New backend (self-hosted Supabase recommended), SMTP sender for sign-in codes, HTTPS front end, backups, first platform admin | `docs/DEPLOYMENT.md` |
| Hosting independence | Done in code (no Lovable dependency) | Standard build, Node server, Dockerfile verified; migrations scripted (`scripts/migrate.sh`); 0012 adds the storage bucket |
| Course content safety | Yes | Strict per-type payload schema in the database; HTML/script text rejected; content rendered as text only (no injected HTML); embeds need https, render only for approved hosts, sandboxed iframe |
| Review gate for courses | Yes | Critical content defects block `request_review` in the database (`course.db.ts`) |
| Responsive / RTL | Course Studio checked at 1280 and 390 wide, Arabic and English | `course_studio.py` |
| Compliance gate | Built, not yet verified against the backend | Open blocker findings block review request and approval (triggers in `0007`); `compliance.db.ts` covers it |

## Open risks
- Leaving Lovable: until IT provisions the new backend, the only live environment is still Lovable Cloud. Disconnect Lovable only after the new system passes `docs/DEPLOYMENT.md` step 6.
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
- The course specification follows the NCAAA section structure; it must be checked against the current official template before first submission.
- SCORM packages link media by https; learners need network access to those hosts, and Blackboard import is not yet tested.
- Media are records with an https source and rights note; no upload or rights approval yet.
- `review_readiness` must be updated whenever a review gate changes, or the checklist will mislead (the database still blocks).
- Notifications are in-app only (My work count); no email until the sender domain is configured.
- Autosave sends the whole brief, architecture or course; two people editing the same draft at once: the last save wins.
