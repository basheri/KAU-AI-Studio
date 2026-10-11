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
