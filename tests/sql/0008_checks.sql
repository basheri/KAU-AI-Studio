\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
SELECT set_config('t.p1', (SELECT id FROM projects WHERE title = 'Main')::text, false);
SELECT set_config('t.p2', (SELECT id FROM projects WHERE title = 'Legacy no compliance')::text, false);
SELECT set_config('t.p3', (SELECT id FROM projects WHERE title = 'Legacy weak compliance')::text, false);
SELECT set_config('t.legacyexc', (SELECT id FROM documented_exceptions WHERE title = 'Legacy')::text, false);
-- ===== Repair of existing projects =====
SELECT t_eq((SELECT string_agg(stage_key, ',' ORDER BY position) FROM workflow_stages WHERE project_id = current_setting('t.p2')::uuid AND is_active),
  'program_brief_confirmed,final_signoff,compliance_review,export_frozen', 'legacy p2 repaired: compliance re-added, export last');
SELECT t_eq((SELECT approver_roles::text FROM workflow_stages WHERE project_id = current_setting('t.p3')::uuid AND stage_key = 'compliance_review'),
  '{compliance_reviewer}', 'legacy p3 compliance approvers restricted');
SELECT t_eq((SELECT string_agg(stage_key, ',' ORDER BY position) FROM workflow_stages WHERE project_id = current_setting('t.p1')::uuid AND is_active),
  'program_brief_confirmed,program_architecture_review,course_architecture_review,learner_content_review,compliance_review,export_frozen', 'default p1 unchanged');
SELECT t_eq((SELECT status::text FROM documented_exceptions WHERE id = current_setting('t.legacyexc')::uuid), 'pending', 'legacy exception now pending');

-- ===== Self-decision =====
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.a1', create_artifact(current_setting('t.p1')::uuid, 'program_brief', 'Brief', 'x')::text, false);
SELECT set_config('t.v1', (SELECT id FROM artifact_versions WHERE artifact_id = current_setting('t.a1')::uuid)::text, false);
SELECT request_review(current_setting('t.v1')::uuid, NULL, '{}');
CREATE OR REPLACE FUNCTION pg_temp.req(_v text) RETURNS text LANGUAGE sql AS $$ SELECT id::text FROM review_requests WHERE artifact_version_id = _v::uuid AND status = 'open' $$;
SELECT t_err(format('SELECT decide_review(%L, ''approve'')', pg_temp.req(current_setting('t.v1'))), 'cannot decide a review you requested');
SELECT t_as('coowner');
SELECT t_eq(decide_review(pg_temp.req(current_setting('t.v1'))::uuid, 'approve') IS NOT NULL, true, 'another program owner approves stage 1');
SELECT t_as('designer');
SELECT decide_review(pg_temp.req(current_setting('t.v1'))::uuid, 'approve');
SELECT decide_review(pg_temp.req(current_setting('t.v1'))::uuid, 'approve');
SELECT decide_review(pg_temp.req(current_setting('t.v1'))::uuid, 'approve');

-- ===== Exceptions =====
SELECT t_as('owner');
SELECT set_config('t.e1', create_exception(current_setting('t.p1')::uuid, current_setting('t.a1')::uuid, 'Credit hours', 'Council waiver')::text, false);
SELECT t_as('compliance');
SELECT t_err(format('SELECT decide_review(%L, ''approve_exception'', ''ok'', %L)', pg_temp.req(current_setting('t.v1')), current_setting('t.e1')), 'not been approved');
SELECT t_as('sme');
SELECT t_err(format('SELECT decide_exception(%L, true)', current_setting('t.e1')), 'role cannot');
SELECT t_as('owner');
SELECT t_err(format('SELECT decide_exception(%L, true)', current_setting('t.e1')), 'role cannot');
SELECT t_as('compliance');
SELECT t_err(format('SELECT decide_exception(%L, false, '' '')', current_setting('t.e1')), 'comment is required');
SELECT decide_exception(current_setting('t.e1')::uuid, true, 'Verified with council minutes');
SELECT t_err(format('SELECT decide_exception(%L, false, ''changed mind'')', current_setting('t.e1')), 'final');
SELECT set_config('t.e2', create_exception(current_setting('t.p1')::uuid, NULL, 'Own', 'Self-made')::text, false);
SELECT t_err(format('SELECT decide_exception(%L, true)', current_setting('t.e2')), 'you created');
SELECT t_eq(decide_review(pg_temp.req(current_setting('t.v1'))::uuid, 'approve_exception', 'Accepted', current_setting('t.e1')::uuid) IS NOT NULL, true, 'compliance approves with an approved exception');
-- Export frozen: the requester (owner) may freeze
SELECT t_as('owner');
SELECT decide_review(pg_temp.req(current_setting('t.v1'))::uuid, 'approve');
SELECT t_eq((SELECT state::text FROM artifact_versions WHERE id = current_setting('t.v1')::uuid), 'approved', 'version approved after six independent stages');

-- Version creator cannot decide even when someone else requested
SELECT t_as('sme');
SELECT set_config('t.v2', edit_artifact(current_setting('t.v1')::uuid, 'amended', 'sme change')::text, false);
SELECT t_as('owner');
SELECT request_review(current_setting('t.v2')::uuid, NULL, '{}');
SELECT t_as('coowner');
SELECT decide_review(pg_temp.req(current_setting('t.v2'))::uuid, 'approve');
SELECT t_as('sme');
SELECT t_err(format('SELECT decide_review(%L, ''approve'')', pg_temp.req(current_setting('t.v2'))), 'version you created');
SELECT t_as('designer');
SELECT t_eq(decide_review(pg_temp.req(current_setting('t.v2'))::uuid, 'request_changes', 'Needs work') IS NOT NULL, true, 'independent reviewer can still return it');
RESET ROLE;

-- ===== Exception immutability and privileged bypass =====
SET ROLE service_role;
SELECT t_err(format('UPDATE documented_exceptions SET title = ''x'' WHERE id = %L', current_setting('t.e1')), 'cannot be edited');
SELECT t_err(format('UPDATE documented_exceptions SET status = ''approved'', decided_by = created_by WHERE id = %L', current_setting('t.e2')), 'other than its creator');
SELECT t_err(format('UPDATE documented_exceptions SET status = ''pending'' WHERE id = %L', current_setting('t.e1')), 'final');
-- Self-decision blocked even with full access
SELECT t_err(format($q$INSERT INTO review_decisions (project_id, review_request_id, artifact_version_id, stage_id, decision, comment, actor_id, actor_role)
  SELECT project_id, id, artifact_version_id, stage_id, 'approve', NULL, requested_by, 'program_owner' FROM review_requests WHERE artifact_version_id = %L LIMIT 1$q$, current_setting('t.v1')), 'cannot decide');
RESET ROLE;

-- ===== Protected stages =====
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.p4', create_project('Config', NULL)::text, false);
SELECT t_err(format($q$SELECT save_workflow_stages(%L, '[{"key":"a","name_ar":"أ","name_en":"A","approver_roles":["program_owner"]},{"key":"export_frozen","name_ar":"ب","name_en":"E","approver_roles":["program_owner"]}]')$q$, current_setting('t.p4')), 'compliance_review stage is required');
SELECT t_err(format($q$SELECT save_workflow_stages(%L, '[{"key":"export_frozen","name_ar":"ب","name_en":"E","approver_roles":["program_owner"]},{"key":"compliance_review","name_ar":"أ","name_en":"C","approver_roles":["compliance_reviewer"]}]')$q$, current_setting('t.p4')), 'must be the last stage');
SELECT t_err(format($q$SELECT save_workflow_stages(%L, '[{"key":"compliance_review","name_ar":"أ","name_en":"C","approver_roles":["program_owner"]},{"key":"export_frozen","name_ar":"ب","name_en":"E","approver_roles":["program_owner"]}]')$q$, current_setting('t.p4')), 'only be decided by compliance');
SELECT save_workflow_stages(current_setting('t.p4')::uuid, '[{"key":"program_brief_confirmed","name_ar":"أ","name_en":"Brief","approver_roles":["program_owner","subject_matter_expert"]},{"key":"compliance_review","name_ar":"ب","name_en":"C","approver_roles":["compliance_reviewer","system_administrator"]},{"key":"export_frozen","name_ar":"ج","name_en":"E","approver_roles":["program_owner"]}]'::jsonb);
SELECT t_eq((SELECT string_agg(stage_key, ',' ORDER BY position) FROM workflow_stages WHERE project_id = current_setting('t.p4')::uuid AND is_active),
  'program_brief_confirmed,compliance_review,export_frozen', 'valid custom workflow saved');
RESET ROLE;
SET ROLE service_role;
SELECT t_err(format('UPDATE workflow_stages SET is_active = false WHERE project_id = %L AND stage_key = ''compliance_review''', current_setting('t.p4')), 'cannot be removed');
SELECT t_err(format('UPDATE workflow_stages SET approver_roles = ''{program_owner}'' WHERE project_id = %L AND stage_key = ''compliance_review''', current_setting('t.p4')), 'only be decided by compliance');
RESET ROLE;

-- ===== Compliance findings need an approved exception =====
INSERT INTO compliance_rulesets (id, project_id, code, title_en, created_by) VALUES ('00000000-0000-0000-0000-0000000000a1', current_setting('t.p1')::uuid, 'RS', 'RS', t_user('owner'));
INSERT INTO compliance_runs (id, project_id, ruleset_id, ruleset_revision, target_artifact_id, target_version_id, target_kind, as_of, context, snapshot, summary, created_by)
  VALUES ('00000000-0000-0000-0000-0000000000b1', current_setting('t.p1')::uuid, '00000000-0000-0000-0000-0000000000a1', 0, current_setting('t.a1')::uuid, current_setting('t.v1')::uuid, 'program_brief', current_date, '{}', '{}', '{}', t_user('owner'));
INSERT INTO compliance_sources (id, project_id, lineage_id, title_en, issuing_authority, document_type, source_url, official_identifier, created_by)
  VALUES ('00000000-0000-0000-0000-0000000000c1', current_setting('t.p1')::uuid, gen_random_uuid(), 'S', 'A', 'policy', 'https://example.org', 'S-1', t_user('owner'));
INSERT INTO compliance_rules (id, project_id, ruleset_id, rule_code, severity, check_type, created_by)
  VALUES ('00000000-0000-0000-0000-0000000000d1', current_setting('t.p1')::uuid, '00000000-0000-0000-0000-0000000000a1', 'R1', 'blocker', 'manual', t_user('owner'));
INSERT INTO compliance_findings (id, project_id, run_id, rule_id, rule_code, rule_version, target_artifact_id, target_version_id, target_path, severity, check_type, outcome, rationale, evidence, rule_snapshot)
  VALUES ('00000000-0000-0000-0000-0000000000e1', current_setting('t.p1')::uuid, '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 'R1', 1, current_setting('t.a1')::uuid, current_setting('t.v1')::uuid, 'x', 'blocker', 'manual', 'manual', 'manual_verification_required', '[]', '{}');
SET ROLE authenticated;
SELECT t_as('compliance');
SELECT t_err(format('SELECT transition_finding(%L, ''accepted_exception'', ''waiver'', %L)', '00000000-0000-0000-0000-0000000000e1', current_setting('t.e2')), 'not been approved');
SELECT transition_finding('00000000-0000-0000-0000-0000000000e1', 'accepted_exception', 'waiver', current_setting('t.e1')::uuid);
SELECT t_eq((SELECT status::text FROM compliance_findings WHERE id = '00000000-0000-0000-0000-0000000000e1'), 'accepted_exception', 'finding closed with approved exception');
RESET ROLE;

-- ===== Audit =====
SELECT t_eq((SELECT count(*) FROM audit_events WHERE action = 'exception.approved') >= 1, true, 'exception approval audited');
SELECT 'ALL CHECKS PASSED';
