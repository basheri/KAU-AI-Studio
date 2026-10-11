\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
-- Migration 0009 (AI assistance) checks. Runs after 0008_checks.sql on the same database.
SELECT set_config('t.p1', (SELECT id FROM projects WHERE title = 'Main')::text, false);
INSERT INTO auth.users (email) VALUES ('t-outsider@kau.edu.sa'), ('t-admin@kau.edu.sa');
INSERT INTO platform_admins (user_id) SELECT t_user('admin');

-- ===== Authorisation and logging =====
SELECT t_eq((ai_authorize(current_setting('t.p1')::uuid, t_user('sme'))->>'role'), 'subject_matter_expert', 'contributor authorised');
SELECT t_err(format('SELECT ai_authorize(%L, %L)', current_setting('t.p1'), t_user('observer')), 'Observers cannot');
SELECT t_err(format('SELECT ai_authorize(%L, %L)', current_setting('t.p1'), t_user('outsider')), 'Not a project member');
SET ROLE authenticated;
SELECT t_as('owner');
SELECT t_err(format('SELECT ai_authorize(%L, %L)', current_setting('t.p1'), t_user('owner')), 'permission denied');
SELECT t_err(format('SELECT record_ai_request(%L, %L, ''x'', ''anthropic'', ''m'', ''succeeded'', 1, 1, NULL, NULL)', current_setting('t.p1'), t_user('owner')), 'permission denied');
RESET ROLE;
SET ROLE service_role;
SELECT set_config('t.req', record_ai_request(current_setting('t.p1')::uuid, t_user('owner'), 'brief_draft', 'anthropic', 'claude-opus-5-5', 'succeeded', 900, 400, NULL, NULL)::text, false);
SELECT t_eq((ai_authorize(current_setting('t.p1')::uuid, t_user('owner'))->>'used_today')::int, 1, 'daily usage counted');
SELECT t_err(format('UPDATE ai_requests SET model = ''other'' WHERE id = %L', current_setting('t.req')), 'immutable');
RESET ROLE;
SELECT t_eq((SELECT count(*) FROM audit_events WHERE action = 'ai.request')::int, 1, 'AI request audited');

-- ===== Brief: AI draft and translation never overwrite people =====
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.bv', create_program_brief(current_setting('t.p1')::uuid, 'guided_idea', 'academic_program',
  '{"title":{"en":"Data Science"}}'::jsonb)::text, false);
RESET ROLE;
SET ROLE service_role;
SELECT t_eq(record_ai_brief_output(current_setting('t.bv')::uuid, t_user('owner'), current_setting('t.req')::uuid, 'draft',
  '{"title":{"en":"AI title","ar":"عنوان"},"rationale":{"ar":"مبررات","en":"Rationale"},"assumptions":{"en":"30 learners"},"category":{"en":"x"}}'::jsonb)::text,
  '{rationale,assumptions}', 'draft fills only empty fields; never the title a person wrote or the category');
SELECT t_eq(record_ai_brief_output(current_setting('t.bv')::uuid, t_user('owner'), current_setting('t.req')::uuid, 'translate',
  '{"title":{"ar":"علم البيانات","en":"overwrite attempt"}}'::jsonb)::text, '{title}', 'translation fills only the missing language');
SELECT t_err(format('SELECT record_ai_brief_output(%L, %L, %L, ''draft'', ''{}'')', current_setting('t.bv'), t_user('observer'), current_setting('t.req')), 'Not a contributing member');
SELECT t_err(format('SELECT record_ai_brief_output(%L, %L, %L, ''draft'', ''{}'')', current_setting('t.bv'), t_user('sme'), current_setting('t.req')), 'Unknown AI request');
RESET ROLE;
SELECT t_eq((SELECT fields->'title'->>'en' || '|' || (fields->'title'->>'ar') || '|' || (fields->'title'->>'ar_prov') || '|' || (fields->'title'->>'provenance')
  FROM program_briefs WHERE artifact_version_id = current_setting('t.bv')::uuid), 'Data Science|علم البيانات|AI_translation|manual', 'human English kept; Arabic marked AI translation');
SELECT t_eq((SELECT fields->'rationale'->>'provenance' || '|' || (fields->'rationale'->>'source_ref') FROM program_briefs WHERE artifact_version_id = current_setting('t.bv')::uuid),
  'AI_draft|ai_request:' || current_setting('t.req'), 'AI draft labelled with its request');

-- A person editing the English title keeps the Arabic AI-translation label pending
SET ROLE authenticated;
SELECT t_as('owner');
SELECT update_program_brief(current_setting('t.bv')::uuid, '{"title":{"en":"Data Science (BSc)"}}'::jsonb, 'academic_program');
SELECT t_eq((SELECT fields->'title'->>'ar_prov' FROM program_briefs WHERE artifact_version_id = current_setting('t.bv')::uuid), 'AI_translation', 'other language keeps its AI label after a manual edit');
SELECT confirm_brief_assumptions(current_setting('t.bv')::uuid);
SELECT t_err(format('SELECT request_review(%L)', current_setting('t.bv')), 'accept the AI-drafted brief fields');
SELECT t_as('observer');
SELECT t_err(format('SELECT accept_ai_brief_field(%L, ''rationale'')', current_setting('t.bv')), 'Observers');
SELECT t_as('sme');
SELECT t_err(format('SELECT accept_ai_brief_field(%L, ''risks'')', current_setting('t.bv')), 'no AI text');
SELECT accept_ai_brief_field(current_setting('t.bv')::uuid, 'rationale');
SELECT accept_ai_brief_field(current_setting('t.bv')::uuid, 'assumptions');
SELECT accept_ai_brief_field(current_setting('t.bv')::uuid, 'title');
SELECT t_eq((SELECT fields->'rationale'->>'provenance' || '|' || (fields->'title'->>'ar_prov') FROM program_briefs WHERE artifact_version_id = current_setting('t.bv')::uuid),
  'AI_accepted|AI_translation_accepted', 'acceptance recorded, AI origin kept');
-- The AI-drafted assumptions reset the confirmation; confirm again, then review is allowed
SELECT t_as('owner');
SELECT confirm_brief_assumptions(current_setting('t.bv')::uuid);
SELECT t_eq(request_review(current_setting('t.bv')::uuid) IS NOT NULL, true, 'review allowed once AI text is accepted');
RESET ROLE;

-- ===== Outcome feedback =====
SET ROLE authenticated;
SELECT t_as('sme');
SELECT t_err(format('SELECT record_ai_outcome(%L, ''accepted'')', current_setting('t.req')), 'not found');
SELECT t_as('owner');
SELECT record_ai_outcome(current_setting('t.req')::uuid, 'edited');
SELECT t_err(format('SELECT record_ai_outcome(%L, ''accepted'')', current_setting('t.req')), 'not found or already decided');
RESET ROLE;

-- ===== AI document extraction is labelled AI draft with the page =====
INSERT INTO storage.objects (bucket_id, name) VALUES ('project-sources', current_setting('t.p1') || '/proposal.pdf');
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.file', register_source_file(current_setting('t.p1')::uuid, current_setting('t.p1') || '/proposal.pdf', 'proposal.pdf', 'application/pdf', 2048)::text, false);
RESET ROLE;
SET ROLE service_role;
SELECT t_err(format('SELECT record_source_extraction(%L, ''succeeded'', ''t'', ''{"title":"X"}'', NULL, ''ai'')', current_setting('t.file')), 'needs its request record');
SELECT record_source_extraction(current_setting('t.file')::uuid, 'succeeded', 'text', '{"title":"Cyber Security","rationale":"Market need","_pages":{"title":"1","rationale":"3"}}'::jsonb, NULL, 'ai', current_setting('t.req')::uuid);
RESET ROLE;
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.bv2', create_program_brief(current_setting('t.p1')::uuid, 'document_upload', 'academic_program', '{}'::jsonb, current_setting('t.file')::uuid)::text, false);
SELECT t_eq((SELECT fields->'rationale'->>'provenance' || '|' || (fields->'rationale'->>'source_ref') FROM program_briefs WHERE artifact_version_id = current_setting('t.bv2')::uuid),
  'AI_draft|source_file:' || current_setting('t.file') || '#p3', 'AI-read field is an AI draft citing its page');
RESET ROLE;

-- ===== Glossary: admins only, audited =====
SET ROLE authenticated;
SELECT t_as('owner');
SELECT t_err('SELECT save_glossary_term(NULL, ''مخرجات التعلم'', ''Learning outcomes'')', 'Administrator role required');
SELECT t_as('admin');
SELECT set_config('t.term', save_glossary_term(NULL, 'مخرجات التعلم', 'Learning outcomes', 'curriculum')::text, false);
SELECT t_err('SELECT save_glossary_term(NULL, ''x'', ''learning outcomes'')', 'duplicate key');
SELECT t_as('sme');
SELECT t_eq((SELECT term_ar FROM glossary_terms WHERE id = current_setting('t.term')::uuid), 'مخرجات التعلم', 'every signed-in user reads the glossary');
SELECT t_err(format('SELECT delete_glossary_term(%L)', current_setting('t.term')), 'Administrator role required');
RESET ROLE;
SELECT t_eq((SELECT count(*) FROM audit_events WHERE action = 'admin.glossary.saved')::int, 1, 'glossary change audited');

-- ===== Course specification validation and the reference gate =====
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.bv3', create_program_brief(current_setting('t.p1')::uuid, 'guided_idea', 'academic_program',
  '{"title":{"en":"Statistics","ar":"الإحصاء"},"assumptions":{"en":"x","ar":"س"}}'::jsonb)::text, false);
SELECT confirm_brief_assumptions(current_setting('t.bv3')::uuid);
SELECT set_config('t.av', create_program_architecture(current_setting('t.bv3')::uuid)::text, false);
SELECT t_err(format($q$SELECT save_architecture(%L, '[{"key":"c","type":"course","code":"STAT101","label_en":"Stats","details":{"spec":{"credit_hours":99}}}]', '[]')$q$, current_setting('t.av')), 'Credit hours');
SELECT t_err(format($q$SELECT save_architecture(%L, '[{"key":"p","type":"program_outcome","code":"P1","label_en":"x","details":{"spec":{}}}]', '[]')$q$, current_setting('t.av')), 'Only courses');
SELECT t_err(format($q$SELECT save_architecture(%L, '[{"key":"c","type":"course","code":"S","label_en":"S","details":{"spec":{"html":"<b>"}}}]', '[]')$q$, current_setting('t.av')), 'Unknown course specification field');
SELECT save_architecture(current_setting('t.av')::uuid, $j$[
  {"key":"p","type":"program_outcome","code":"PLO1","label_en":"Analyse data"},
  {"key":"c","type":"course","code":"STAT101","label_en":"Statistics","details":{"spec":{"description_en":"Intro","credit_hours":3,
     "objectives":[{"en":"Build intuition"}],"topics":[{"en":"Descriptive statistics","weeks":2,"outcomes":["CLO1"]}],
     "references":[{"citation":"Freedman, Statistics (4th ed.)","verified":false}]}}},
  {"key":"o","type":"course_outcome","parent_key":"c","code":"CLO1","label_en":"Apply tests"},
  {"key":"a","type":"assessment","parent_key":"c","code":"E1","label_en":"Exam"}]$j$::jsonb,
  '[{"from":"p","to":"c"},{"from":"p","to":"o"},{"from":"o","to":"a"}]'::jsonb);
SELECT t_eq((SELECT count(*) FROM check_architecture_alignment(current_setting('t.av')::uuid))::int, 0, 'architecture aligned');
SELECT t_err(format('SELECT request_review(%L)', current_setting('t.av')), 'Verify every course reference');
SELECT save_architecture(current_setting('t.av')::uuid, $j$[
  {"key":"p","type":"program_outcome","code":"PLO1","label_en":"Analyse data"},
  {"key":"c","type":"course","code":"STAT101","label_en":"Statistics","details":{"spec":{"description_en":"Intro","credit_hours":3,
     "references":[{"citation":"Freedman, Statistics (4th ed.)","verified":true}]}}},
  {"key":"o","type":"course_outcome","parent_key":"c","code":"CLO1","label_en":"Apply tests"},
  {"key":"a","type":"assessment","parent_key":"c","code":"E1","label_en":"Exam"}]$j$::jsonb,
  '[{"from":"p","to":"c"},{"from":"p","to":"o"},{"from":"o","to":"a"}]'::jsonb);
SELECT t_eq(request_review(current_setting('t.av')::uuid) IS NOT NULL, true, 'review allowed once references are verified');
RESET ROLE;
SELECT 'ALL 0009 CHECKS PASSED';
