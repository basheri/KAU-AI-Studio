# AI assistance — setup and governance

AI assistance is **off by default**. Nothing is sent to an AI provider until a platform owner turns it on.

## Turning it on (platform owner)
1. Decide where the AI may run (university data policy; PDPL / SDAIA guidance). The built-in provider is Claude through Anthropic's API (`claude-opus-5-5` by default).
2. In the backend's server secrets (Lovable Cloud → secrets), add:
   - `ANTHROPIC_API_KEY` — the provider key (never exposed to browsers).
   - `AI_ENABLED` = `true` — the explicit switch. Without it, AI stays off even when a key exists.
   - Optional `AI_MODEL` — another model id, if policy requires.
   - Optional `AI_DAILY_LIMIT` — requests per person per day (default 200).
3. Make sure migration `0009_ai_assistance` has been applied.
4. Open **Settings**: "AI service" should show "Configured on server", with the provider and model.
5. Add the institutional glossary in **Settings → Institutional glossary** (platform administrators only). Drafting and translation use these terms exactly.

To turn AI off, set `AI_ENABLED` to anything other than `true`. Every AI button then shows "AI assistance is turned off".

## What AI does — and never does
| Area | AI drafts | A person must |
|---|---|---|
| Program brief | Empty fields from an idea; missing language; consistency check | Accept each AI field (review is blocked until then) |
| Uploaded proposal | Reads PDF (and DOCX/TXT without labels) into brief fields with page numbers | Accept each field — they are labelled AI drafts, not "extracted" |
| Architecture | Program outcomes; plain-language explanation of alignment defects; missing-language labels | Insert suggestions; save the architecture |
| Course specification | Description, objectives, learning outcomes (mapped to program outcomes), topic plan, assessments with weights, reference suggestions | Insert suggestions; tick "verified" for every reference (review is blocked until then) |
| Course Studio | Text blocks (rich text, knowledge check, scenario, rubric, glossary); translated copies; alt text; learner clarity check | Insert drafts; review translated copies |
| Compliance | Draft rules from a PDF source, citing clause and page | Save as draft; a compliance reviewer activates |
| Reviews | Summary of changes between versions; summary of the discussion | Decide — summaries are never stored or attached to decisions |

AI never approves, rejects, activates rules, closes findings or overwrites text a person wrote.

## Records
- Every call is logged in `ai_requests` (who, project, feature, model, tokens, status, outcome) and in `audit_events` (`ai.request`).
- Settings → AI usage shows the last 30 days. Drafts kept unchanged almost every time are flagged as a warning sign.
- Do not paste personal data about students or staff into AI tools.
