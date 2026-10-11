\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
-- Migration 0011 (exports) checks. Runs after 0010_checks.sql on the same database.
SELECT set_config('t.p1', (SELECT id FROM projects WHERE title = 'Main')::text, false);
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.bv', create_program_brief(current_setting('t.p1')::uuid, 'guided_idea', 'academic_program',
  '{"title":{"en":"Export brief"},"assumptions":{"en":"x"}}'::jsonb)::text, false);
SELECT confirm_brief_assumptions(current_setting('t.bv')::uuid);
SELECT set_config('t.av', create_program_architecture(current_setting('t.bv')::uuid)::text, false);
RESET ROLE;
SELECT t_eq((SELECT state::text FROM artifact_versions WHERE id = current_setting('t.av')::uuid), 'draft', 'fixture: a draft architecture exists');

SET ROLE authenticated;
-- ===== export_options =====
SELECT t_as('owner');
SELECT t_eq((export_options(current_setting('t.av')::uuid, 'course_spec_docx')->>'preview')::boolean, true, 'contributor may preview a draft');
SELECT t_eq((export_options(current_setting('t.av')::uuid, 'course_spec_docx')->>'official')::boolean, false, 'no official export of a draft');
SELECT t_eq(export_options(current_setting('t.av')::uuid, 'course_spec_docx')->>'official_problem', 'Official exports need an approved version', 'reason given');
SELECT t_eq(export_options(current_setting('t.av')::uuid, 'scorm12')->>'preview_problem', 'This format does not fit this item', 'format must fit the item');
SELECT t_as('observer');
SELECT t_eq((export_options(current_setting('t.av')::uuid, 'program_summary_docx')->>'preview')::boolean, false, 'observers cannot preview drafts');
SELECT t_as('outsider');
SELECT t_eq(export_options(current_setting('t.av')::uuid, 'course_spec_docx')->>'preview_problem', 'Not a project member', 'non-members cannot export');

-- ===== record_export is server-only =====
SELECT t_as('owner');
SELECT t_err(format($q$SELECT record_export(gen_random_uuid(), t_user('owner'), %L, 'course_spec_docx', 'C1', false, 'ar', 'x.docx', repeat('a', 64), 10)$q$,
  current_setting('t.av')), 'permission denied');
SELECT t_err('INSERT INTO export_records (id, project_id, artifact_version_id, format, official, lang, file_name, sha256, byte_size, version_state, created_by)
  VALUES (gen_random_uuid(), current_setting(''t.p1'')::uuid, current_setting(''t.av'')::uuid, ''scorm12'', true, ''ar'', ''x'', repeat(''a'',64), 1, ''approved'', t_user(''owner''))',
  'permission denied');

RESET ROLE;
SET ROLE service_role;
SELECT t_eq(record_export('00000000-0000-0000-0000-0000000000e1', t_user('owner'), current_setting('t.av')::uuid, 'course_spec_docx', 'C1', false, 'ar',
  'spec.docx', repeat('ab', 32), 1200), '00000000-0000-0000-0000-0000000000e1'::uuid, 'server logs a preview');
SELECT t_err(format($q$SELECT record_export(gen_random_uuid(), t_user('owner'), %L, 'course_spec_docx', 'C1', true, 'ar', 'x.docx', repeat('a', 64), 10)$q$,
  current_setting('t.av')), 'approved version');
SELECT t_err(format($q$SELECT record_export(gen_random_uuid(), t_user('observer'), %L, 'program_summary_docx', '', false, 'en', 'x.docx', repeat('a', 64), 10)$q$,
  current_setting('t.av')), 'Observers');
SELECT t_err(format($q$SELECT record_export(gen_random_uuid(), t_user('outsider'), %L, 'program_summary_docx', '', false, 'en', 'x.docx', repeat('a', 64), 10)$q$,
  current_setting('t.av')), 'Not a project member');
SELECT t_err(format($q$SELECT record_export(gen_random_uuid(), t_user('owner'), %L, 'program_summary_docx', '', false, 'en', 'x.docx', 'not-a-hash', 10)$q$,
  current_setting('t.av')), 'check constraint');
SELECT t_err($q$UPDATE export_records SET file_name = 'changed' WHERE id = '00000000-0000-0000-0000-0000000000e1'$q$, 'immutable');
SELECT t_eq((SELECT count(*) FROM audit_events WHERE action = 'export.created'
  AND details->>'export_id' = '00000000-0000-0000-0000-0000000000e1')::int, 1, 'export is audited');

-- ===== Approved version: official exports for every member =====
RESET ROLE;
SET session_replication_role = replica;
UPDATE artifact_versions SET state = 'approved' WHERE id = current_setting('t.av')::uuid;
SET session_replication_role = origin;
SET ROLE authenticated;
SELECT t_as('observer');
SELECT t_eq((export_options(current_setting('t.av')::uuid, 'course_spec_docx')->>'official')::boolean, true, 'observer may export an approved version');
RESET ROLE;
SET ROLE service_role;
SELECT t_eq(record_export('00000000-0000-0000-0000-0000000000e2', t_user('observer'), current_setting('t.av')::uuid, 'program_summary_docx', '', true, 'en',
  'summary.docx', repeat('cd', 32), 900), '00000000-0000-0000-0000-0000000000e2'::uuid, 'server logs an official export');
SELECT t_eq((SELECT version_state::text FROM export_records WHERE id = '00000000-0000-0000-0000-0000000000e2'), 'approved', 'state at export is recorded');

-- ===== Reading the log =====
RESET ROLE;
SET ROLE authenticated;
SELECT t_as('sme');
SELECT t_eq((SELECT count(*) FROM export_records WHERE project_id = current_setting('t.p1')::uuid)::int, 2, 'members read the export log');
SELECT t_eq((SELECT official FROM export_records WHERE sha256 = repeat('cd', 32)), true, 'a file is verified by its hash');
SELECT t_as('outsider');
SELECT t_eq((SELECT count(*) FROM export_records)::int, 0, 'non-members read nothing');

-- ===== Replaced versions =====
RESET ROLE;
SET session_replication_role = replica;
UPDATE artifact_versions SET state = 'superseded' WHERE id = current_setting('t.av')::uuid;
SET session_replication_role = origin;
SET ROLE authenticated;
SELECT t_as('owner');
SELECT t_eq(export_options(current_setting('t.av')::uuid, 'course_spec_docx')->>'official_problem', 'A newer version replaced this one', 'superseded versions are not exported');
RESET ROLE;
SELECT 'ALL 0011 CHECKS PASSED';
