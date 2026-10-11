# Execution ledger

## Increment 4 — Guided intake, canonical Program Brief, learning alignment (from `efc60f8` / `5ea1607`)

### Architecture ruling (options compared)
| Option | Security | Maintainability | Speed | Value | Cost |
|---|---|---|---|---|---|
| A. Brief/architecture as free text in `artifact_versions.content` | Weak: no field validation or provenance | Simple but unqueryable | Fastest | Low: no alignment checks | None |
| B. **Typed tables per version (`program_briefs`, `arch_elements`, `arch_mappings`) under the existing artifact/version/review model; copy-on-child trigger; derived version text** | Strong: RLS + RPC + lock triggers; reuses review lock | One element table + one mapping table; one versioning system | Moderate | High: SQL alignment, provenance, review gate | None |
| C. Separate versioning system for briefs/architecture | Duplicate lock logic, more risk | Two parallel models | Slowest | Same as B | None |

**Ruling: B.** Structured artifacts (`artifacts.structured`) reuse `edit_artifact`/review states. Their version text is derived and writable only inside structured RPCs (`app.structured_write` transaction setting). Child versions copy brief, architecture, element and mapping rows with new ids, so the parent stays frozen. Extraction is a deterministic, key-free server function (`extract.functions.ts`); only a service-role RPC can record results, so clients cannot forge "extracted" provenance.

### Migrations
- `0002_program_intake_brief_alignment`: enums `program_category`, `intake_mode`, `arch_element_type`; tables `source_files`, `program_source_snapshots`, `program_briefs`, `program_architectures`, `arch_elements`, `arch_mappings`; private bucket `project-sources` (10 MB) with storage RLS; RPCs `register_source_file`, `record_source_extraction` (service role only), `create_program_brief`, `update_program_brief`, `confirm_brief_assumptions`, `create_program_architecture`, `save_architecture`, `check_architecture_alignment`; triggers for the lock, immutable snapshots, one-time extraction, copy-to-child, and a review gate (brief assumptions confirmed; architecture with zero alignment defects).
- `0003_revoke_trigger_function_execute`: removes API execute rights on trigger-only functions (security linter).

### TDD evidence
- RED: `intake-alignment.test.ts` and `program-studio-ui.test.tsx` failed (missing modules); `tests/db/intake.db.ts` failed. Existing 25 unit tests passed.
- GREEN (final run):
  - typecheck `tsgo --noEmit`: clean
  - lint: 0 errors, 9 warnings (fast-refresh hints in existing UI kit/providers). Auto-generated backend client files are excluded.
  - unit/integration `bun run test`: 8 files, **39 passed**
  - database/RLS `bun run test:db`: 3 files, **28 passed** (9 isolation + 8 review + 11 intake)
  - browser `bun run test:e2e`: signed-out OTP **PASS**; signed-in program studio **PASS** (guided, bad-type upload rejected, text upload extracted, redevelopment snapshot, confirm assumptions, architecture built to "fully aligned", saved; Arabic RTL and English LTR; keyboard entry)
  - Cleanup verified by query: 0 throwaway users, 0 projects, 0 storage objects, 0 source files.

### Exact behaviour
- Three categories and three intake modes; all create one `program_briefs` row with 11 canonical fields, each `{ar, en, provenance, source_ref}`.
- Provenance: `extracted` only from a recorded successful extraction (`source_file:<id>`); `imported` only from the snapshot (`snapshot:<id>`); any changed value becomes `manual`. `AI_draft` is reserved; nothing produces it yet.
- Upload: PDF/DOCX/TXT/MD, 1 byte–10 MB, path must be `<project_id>/…`. TXT/MD are parsed; other types are recorded as `unsupported`, never as success.
- Changing assumptions clears the confirmation. Architecture creation and brief review need confirmed assumptions. Architecture review also needs elements and zero defects.

### Remaining highest-value gap
Real document text extraction for PDF/DOCX (currently stored as sources and marked unsupported), and a Course Studio view that reuses the architecture elements.

## Increment 5 — Course Studio and learner-facing content (from `4de8e63` / `6f4a6d2`)

### Architecture ruling (options compared, 1–5, higher is better)
| Option | Security | Maintainability | Value | Speed | Cost | Total |
|---|---|---|---|---|---|---|
| A. One JSON document per version in `artifact_versions.content` | 2 (no per-block checks or RLS rows) | 2 | 2 (no row-level validation/gate) | 5 | 5 | 16 |
| B. **Typed rows (`course_contents`, `course_nodes`, `content_blocks`) keyed by version; whole-tree save RPC with per-type database validation; reuse structured-artifact lock, copy-to-child and review gate** | 5 | 4 (same pattern as architecture) | 5 | 4 | 5 | **23** |
| C. Per-block granular RPCs (add/move/delete each audited separately) | 5 | 3 (many RPCs; reorder races; each edit of a locked version would branch) | 4 | 2 | 4 | 18 |

**Ruling: B.** Author operations (add, edit, delete, duplicate, reorder) happen in the editor and persist through one audited `save_course_content` call (debounced autosave). Every save rewrites contiguous positions, so reordering can't leave gaps or duplicates. Course identity is the architecture `course` element (code + element id + architecture version); a second content artifact for the same course code is rejected.

### Migrations
- `0004_course_studio_content`: enum `course_block_type` (10 types); tables `media_assets`, `course_contents`, `course_nodes` (module/lesson), `content_blocks`, with member-only SELECT RLS and no client write grants; lock triggers; `approved_embed_hosts()` (interim platform default); `validate_block_payload` (exact keys and types per block, project/kind-checked media, https-only embed/captions, no HTML/script text anywhere); `course_content_defects` (13 critical checks + 1 warning); RPCs `register_media_asset`, `create_course_content`, `save_course_content`, `check_course_content` (all role-checked and audited); `copy_structured_to_child` extended to copy the whole course tree with new ids; `gate_structured_review` blocks review on critical defects.
- `0005_artifact_kind_course_content`: allows artifact kind `course_content`.
- `0006_course_heading_levels`: heading rule fix found by a RED test (`###` = level 3, the first level allowed under a lesson title).

### Validation (database authoritative, mirrored in `src/features/course/tree.ts`)
Critical: missing_title, missing_language, no_lessons, empty_payload, invalid_heading_hierarchy, missing_alt_text, missing_transcript, missing_captions, invalid_embed_domain, kc_missing_answer, kc_missing_feedback, outcome_link_missing (must be a program outcome or this course's outcome in the linked architecture version), reference_url_invalid. Warning: media_metadata_incomplete.

### TDD evidence
- RED: `course-blocks.test.ts` and `course-studio-ui.test.tsx` failed because the modules were missing; `tests/db/course.db.ts` failed because the RPCs were missing. Then failures led to two fixes: artifact kind constraint (migration 0005) and heading level rule (0006).
- GREEN (final):
  - typecheck: clean
  - lint: 0 errors, 9 old warnings
  - unit/screen: 10 files, **63 passed** (39 existing + 20 block/tree + 4 screen)
  - database/RLS: 4 files, **35 passed** (28 existing + 7 course)
  - browser: **3 passed** (signed-out; program studio; new course studio)
  - cleanup query: 0 test users, projects, media, courses, blocks, stored files.
- Browser course flow (1280×1800 English and Arabic, 390×844 phone): build an aligned architecture → create course content → add module/lesson → keyboard-add rich text → knowledge check with outcome link → unapproved embed shows a defect → delete it through the confirmation dialog → move up/down → "All changes saved" → reload proves it was saved → learner preview (headings, answer check, Previous/Next lesson) → Arabic RTL → phone has no sideways scrolling.
- The phone check found that the top bar overflowed sideways by 115px; fixed (status badge and email hidden on phones; sign-out still available).

### Remaining highest-value gap
Real media upload and the media-rights workflow (records currently hold an https source and a rights note), then the versioned compliance library.

## Increment 6 — Compliance Library (database layer + UI; database tests pending a run)

### Architecture ruling
Project-scoped, versioned compliance sources and rules; immutable runs with a frozen snapshot; findings with an append-only event log. Same pattern as earlier increments: tables are SELECT-only to members, every write goes through an audited security-definer RPC that checks the project role, and lock triggers apply to every role (including the service role).

### Migrations
- `0007_compliance_library`: enums `compliance_source_status` (6), `compliance_rule_status`, `rule_severity`, `rule_check_type`, `finding_status`; tables `compliance_sources`, `compliance_rulesets`, `compliance_rules`, `compliance_rule_evidence`, `compliance_runs`, `compliance_findings`, `compliance_finding_events` (member-only SELECT RLS, no client write grants); view `compliance_sources_current` (`security_invoker`, computes expiry by date); triggers: source/rule freeze after draft, rule activation needs an active in-date source, evidence frozen for non-draft rules, runs and finding events immutable, blocker-closure invariants on findings, review request/approval gate on open blockers; RPCs `save/revise/transition_compliance_source`, `record_source_checksum` (service role only), `save_compliance_ruleset`, `save/revise_compliance_rule`, `set_compliance_rule_status`, `run_compliance`, `assign_finding`, `comment_finding`, `transition_finding`, `compliance_readiness` — all audited.

### UI (this change)
- `/compliance` now hosts the Compliance Library (`src/features/compliance/ComplianceLibrary.tsx`): Sources (create/edit draft, submit, approve, reject with comment, withdraw, revise), Rules (rulesets, draft rules with automated check, applicability, dates and cited evidence; activate, retire with comment, revise), Run check (target version, ruleset, program context; frozen run results), Findings board (open / in progress / closed) with detail: evidence, assignment, comments, status changes that ask up front for the comment, approved exception or verification run the database requires, and history.
- Client mirror for live hints only: `src/features/compliance/rules.ts` (source status by date, applicability, form checks, allowed finding transitions per role). The database stays authoritative.
- Arabic (default, RTL) and English strings in `locale.ts` (`cl.*`, plus `kind.course_content`).

### TDD evidence
- RED: `compliance-rules.test.ts` failed (module missing) before `rules.ts` existed.
- GREEN (this change):
  - typecheck: clean
  - lint: 0 errors, 9 old warnings (was 49 errors: formatting in `tests/db/compliance.db.ts`, fixed)
  - unit/screen: 12 files, **73 passed** (63 existing + 4 mirror + 6 compliance screen)
  - build: succeeds
- **Not run in this change:** `bun run test:db` (8 compliance database tests in `tests/db/compliance.db.ts`) and the browser suite. Both need the backend keys (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), which this build environment does not have. Run them before treating compliance as verified.

### Remaining highest-value gap
1. Run `bun run test:db` against the backend and record the result here.
2. Browser scenario for compliance (needs two throwaway users: owner + compliance reviewer), including the 390-wide phone check.
3. Then media upload and the media-rights workflow.

## Increment 6b — Review segregation of duties (migration 0008)

### Why
A governance review found that a program owner could remove the compliance stage, that whoever submitted or wrote a version could approve it, and that any contributor could create the exception used to approve their own work.

### Ruling (options compared)
| Option | Control strength | Workflow impact | Ruling |
|---|---|---|---|
| A. Policy only ("owners must not…") | None in the database | None | Rejected: contradicts "database is authoritative" |
| B. **Database triggers + RPC checks** | Holds for every role, including the service role | Single-owner projects need a second approver for stage 1 | **Chosen** |
| C. Full redesign (quorum, per-kind routes) | Strongest | Large | Deferred: needs a policy decision on routes per artifact kind |

### Migration `0008_review_segregation_of_duties`
- **Protected stages:** every project keeps an active `compliance_review` stage, decided only by `compliance_reviewer` / `system_administrator`, and `export_frozen` as its last stage. Enforced in `save_workflow_stages` and by trigger `workflow_stages_protected`. Existing projects were repaired in the migration: missing or deactivated protected stages are re-activated (compliance before export), and widened compliance approvers are reset to `compliance_reviewer`.
- **No self-decision:** trigger `review_decisions_segregation` refuses a decision by the review requester or the version's creator. `export_frozen` is exempt because it is an administrative freeze after independent stages.
- **Exception approval:** `documented_exceptions.status` (`pending` → `approved` / `rejected`, final). New RPC `decide_exception` (compliance reviewer or system administrator, never the creator; rejection needs a comment; audited `exception.approved` / `exception.rejected`). Exceptions are otherwise immutable. `approve_exception` decisions and `accepted_exception` findings require an approved exception. **Existing exceptions became `pending`** and need approval before reuse.
- UI: the Reviews screen explains when you cannot decide your own work, offers only approved exceptions, and gives compliance reviewers an exceptions panel to approve or reject. Compliance findings offer only approved exceptions. Client mirror: `selfDecisionBlocked`, `canDecideException` in `src/features/reviews/rules.ts`.

### TDD evidence
- RED: new mirror tests in `review-rules.test.ts` failed before the rules existed.
- **Local database run (new, key-free):** `bash tests/sql/run.sh` applies migrations 0000–0008 to a fresh PostgreSQL 16 database with Supabase stand-ins, acts as six throwaway users through the real functions and row-level security, and checks repair of two pre-existing weakened projects. **29/29 checks passed.** A mutation check (guard trigger removed) made the self-decision check fail as expected.
- All migrations 0000–0007 also apply cleanly to that local database.
- typecheck clean; lint 0 errors (9 old warnings); unit/screen **75 passed**; build succeeds.
- `tests/db/reviews.db.ts` and `tests/db/compliance.db.ts` were updated for the new rules (second program owner, instructional designer approver, exception approval, protected stages, forged self-decision). **They have not been run against the live backend yet** (no keys in this environment).

### Consequences to manage
- A project with a single program owner cannot confirm a brief that owner wrote and submitted. Add a second program owner, or give stage 1 an additional approver role.
- Edits made in place to a draft by a contributor other than its creator do not block that contributor from deciding; only the requester and the creator are blocked.

## Increment 7 — AI assistance under human control (migration 0009)

### Architecture ruling (options compared)
| Option | Governance | Data control | Value | Ruling |
|---|---|---|---|---|
| A. General chat assistant on every screen | Weak: output bypasses structured fields and provenance | Hard to scope | Demo value | Rejected |
| B. **Feature-specific drafting through one governed server gateway; schema-validated output; suggestions a person inserts; persistent AI provenance on briefs; review gates** | Strong | Off by default, explicit switch, per-user daily limit, full log | High | **Chosen** |
| C. AI pre-screening reviews / auto-scoring compliance | Undermines independent human judgement (0008) | — | — | Rejected |

Provider: Claude via the official Anthropic SDK (`claude-opus-5-5` default, adaptive thinking, per-feature effort, server-side refusal fallback `fallbacks: "default"`), behind a provider interface (`src/features/ai/gateway.ts`) so a Saudi-hosted or university-hosted model can be added without changing features. Every response is validated against a Zod schema before use.

### Migration `0009_ai_assistance`
- `ai_requests` usage log (service-role writes via `record_ai_request`, audited `ai.request`; immutable except a one-time `outcome` set by the requester through `record_ai_outcome`); `ai_authorize` (contributors only + today's count).
- `glossary_terms` (readable by all signed-in users; `save_glossary_term` / `delete_glossary_term` platform-admin only, audited).
- Brief provenance: `AI_draft` → `AI_accepted`; per-language `ar_prov`/`en_prov` `AI_translation` → `AI_translation_accepted`. `record_ai_brief_output` (service role) only fills empty fields or the empty language; `accept_ai_brief_field` (contributors); `brief_apply_manual` keeps the other language's AI label when one language is edited.
- Source files: `extraction_method` (`deterministic`|`ai`) and `extraction_request_id`; `record_source_extraction` gains `_method`/`_request_id`; `create_program_brief` labels AI-read fields `AI_draft` with `#p<page>` in `source_ref`.
- Course specification on the architecture `course` element (`details.spec`), validated by trigger (`course_spec_problem`, mirrored in `src/features/architecture/spec.ts`).
- Review gate `gate_ai_review`: blocks review while a brief has unaccepted AI text or an architecture has unverified course references.

### Features (by phase)
1. Briefs: draft empty fields from an idea; translate missing languages; Arabic–English consistency check; DOCX read deterministically (`src/features/intake/docx.ts`), PDF (and unlabelled text) read by AI with page numbers.
2. Architecture: suggest program outcomes; explain alignment defects; translate missing labels; course specification panel (description, credit hours, prerequisites, teaching strategies, objectives, topics with weeks and outcome coverage, assessment weights, references with "verified"); AI chain for description, objectives, learning outcomes (inserted as course-outcome elements mapped to program outcomes), topics, assessments (inserted as assessment elements mapped to outcomes, with weights), references (inserted unverified). Deterministic outcome wording checks (vague verbs, compound outcomes) without AI.
3. Course Studio: draft text blocks (validated by `parsePayload`), translated copies placed after originals, alt-text suggestions, learner clarity check.
4. Compliance: draft rules from a PDF source citing clause and page, saved only as drafts. Reviews: change summary and discussion summary (not stored).
- Settings: AI status, institutional glossary (admin-edited), 30-day usage with an "unchanged acceptance" warning. The old status row that reported `LOVABLE_API_KEY` as "AI configured" was removed.

### TDD evidence
- RED observed: `docx-text.test.ts`, `course-spec.test.ts` (modules missing). Other new tests were written alongside their modules.
- Local database run `bash tests/sql/run.sh`: migrations 0000–0009 on PostgreSQL 16 — **64/64 checks passed** (29 from 0008 + 35 for 0009: authorisation, logging immutability, daily count, no-overwrite drafting/translation, per-language provenance after manual edit, acceptance, review gate, outcome feedback, AI-read PDF provenance with page, glossary admin-only and audited, course specification validation, reference gate).
- typecheck clean; lint 0 errors (9 old warnings); unit/screen **110 passed** (21 files; 35 new: engine 9, gate 3, DOCX 2, spec 6, block text 3, brief UI 4, spec UI 3, lesson UI 2, phase-4 UI 3); build succeeds.
- Client bundle checked: no API key name, no provider address; the AI SDK is server-only.
- **Not run:** live calls to the AI provider (no key here) and `bun run test:db` (no backend keys). Prompts and schemas are unit-tested; real output quality must be checked in a pilot.

### Remaining highest-value gap
1. Pilot with real users once hosting is decided; measure acceptance/edit/discard rates per feature.
2. Run `bun run test:db` and a browser scenario for the AI flows against the live backend.
3. Institutional glossary content (owner to be named).
