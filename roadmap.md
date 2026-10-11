# Roadmap
- [x] Increment 4: guided intake, canonical brief, alignment
- [x] Increment 5: Course Studio (hierarchy, 10 block types, validation, versioning, review gate, author/preview)
- [x] Clear localized Previous lesson / Next lesson labels; no dead or confusing controls
- [x] Full suites (unit, db, e2e incl. mobile/RTL/LTR/keyboard), cleanup, ledger/readiness
- [ ] Media upload and media-rights workflow (next increment)
- [ ] Real PDF/DOCX text extraction

## Increment 6 — Compliance Library (in progress)
- [x] Migration 0007: project-scoped versioned sources (6 statuses, expiry computed by date), rulesets, versioned rules + evidence (activation trigger needs an active, in-date source), immutable runs with frozen snapshot, findings + events, blocker-closure rules enforced by trigger, review/approval gate on open blockers, server-verified file checksum
- [x] DB tests written (tests/db/compliance.db.ts); applicability/mirror unit tests and screen tests green
- [ ] Run DB tests against the backend (needs backend keys) and record the result
- [x] Compliance UI: Sources, Rules, Run, Findings board/detail; Arabic/English
- [ ] Browser scenario (owner + compliance reviewer; phone width) + cleanup
- [x] Ledger/readiness updated

## Increment 6b — Review segregation of duties
- [x] Migration 0008: protected compliance/export stages, no self-decision, exception approval
- [x] Reviews and Compliance UI updated; client mirror and tests
- [x] Local database verification (`tests/sql/run.sh`, 29/29)
- [ ] Run `bun run test:db` against the backend
- [ ] Policy decision: review route per artifact kind; quorum for committee stages

## Increment 7 — AI assistance (built; off by default)
- [x] Gateway, usage log, daily limit, glossary, settings (migration 0009)
- [x] Phase 1: brief drafting, PDF/DOCX reading, brief translation and consistency check
- [x] Phase 2: course specification + AI description/objectives/outcomes/topics/assessments/references + translation
- [x] Phase 3: Course Studio block drafting, translated copies, alt text, learner clarity check
- [x] Phase 4: compliance rule drafting, review change/discussion summaries
- [ ] Decide AI hosting; enable for a pilot group; measure acceptance/edit rates
- [ ] Live-backend and browser verification of AI flows
- [ ] Name the glossary owner and load the institutional glossary
