<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- UI strings live in `src/features/i18n/locale.ts` typed dictionaries; Arabic is default/RTL — why: Arabic-first university product.
- Navigation sections come only from `NAV_ITEMS` in `src/features/navigation/nav.ts` — why: one source for shell, dashboard and tests.
- `process.env` is read only inside `createServerFn` handlers in `src/features/*/*.functions.ts`, returning non-secret values — why: no secrets in browser code.
- Use logical CSS utilities (start/end, ms/me) — why: layouts must mirror for RTL/LTR.
- Brand colours are tokens in `src/styles.css`; no invented KAU logo — why: awaiting official brand guide.
- Project data is isolated by RLS using `is_project_member`/`has_project_role` security-definer helpers; never rely on UI filtering — why: non-members must get zero rows.
- Projects, memberships, invitations and audit events are written only through security-definer RPCs (`create_project`, `invite_to_project`, `accept_invitation`, `decline_invitation`) — why: atomic owner creation and audited, validated writes.
- Platform admin capability lives only in `public.platform_admins` (service-role writable) and is checked server-side by `is_platform_admin()`; admin RPCs must write an audit event — why: no client-side admin switch.
- KAU email rule exists in both `src/features/auth/kau-email.ts` and `public.normalize_kau_email`; change both together — why: client pre-check plus database enforcement.
- Database isolation tests (`tests/db`, `bun run test:db`) run against the real backend with throwaway users and must clean up after themselves — why: verify RLS through the real API.
- Artifact versions are immutable once out of draft: `guard_artifact_version_update` trigger blocks content edits and invalid state transitions for every role; edits go through `edit_artifact`, which creates a child version — why: approved/in-review versions must never silently change.
- Review tables (`workflow_stages`, `artifacts`, `artifact_versions`, `review_*`, `documented_exceptions`) are SELECT-only to members; all writes go through audited security-definer RPCs that check project role — why: authorization enforced in the database, not the UI.
- Client-side review rules in `src/features/reviews/rules.ts` mirror the database only for UI hints; the database stays authoritative — why: avoid divergent enforcement.
- Program briefs and architectures are "structured" artifacts: typed rows keyed by `artifact_version_id`, version text derived and writable only inside structured RPCs (`app.structured_write`), children copied by `copy_structured_to_child` — why: one versioning/review model with field-level data.
- Field provenance is assigned by the database (`extracted` only from service-role extraction results, `imported` only from snapshots, changed values become `manual`) — why: clients cannot forge provenance.
- Alignment rules live in `public.alignment_defects` and are mirrored in `src/features/architecture/alignment.ts` for live UI hints; change both together — why: the database gate is authoritative.
- Uploaded sources live in the private `project-sources` bucket under `<project_id>/…`, with storage RLS by membership — why: project-scoped file isolation.
- `docs/EXECUTION_LEDGER.md` and `docs/RELEASE_READINESS.md` are updated each increment with migrations, test counts and risks — why: auditable delivery evidence.
- Course content is a structured artifact (`course_contents` → `course_nodes` → `content_blocks`) saved whole-tree by `save_course_content`; course identity comes from the architecture `course` element — why: one versioning/review model and no duplicate course identities.
- Block payload schemas live in `public.validate_block_payload` and are mirrored in `src/features/course/blocks.ts`; content defects live in `public.course_content_defects`, mirrored in `src/features/course/tree.ts`; change both together — why: database is authoritative, the client gives live hints.
- Learner content is rendered only as React text from a parsed safe subset; never use `dangerouslySetInnerHTML`; embeds render only for `approved_embed_hosts()` in a sandboxed iframe — why: no arbitrary HTML/scripts.
- Compliance rules live in migration `0007` (`source_status_on`, `rule_applies`, `transition_finding`, …) and are mirrored in `src/features/compliance/rules.ts` for UI hints only; change both together — why: the database gate is authoritative.
- Compliance runs and finding events are immutable, and a blocker finding closes only by a later passing run or an approved exception with a comment — why: an auditable compliance trail.
