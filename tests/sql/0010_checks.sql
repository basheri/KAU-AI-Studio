\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
-- Migration 0010 (guidance) checks. Runs after 0009_checks.sql on the same database.
SELECT set_config('t.p1', (SELECT id FROM projects WHERE title = 'Main')::text, false);
SELECT set_config('t.bv2', (SELECT b.artifact_version_id FROM program_briefs b JOIN artifacts a ON a.id = b.artifact_id
  WHERE a.title = 'Cyber Security')::text, false);
INSERT INTO compliance_findings (project_id, run_id, rule_id, rule_code, rule_version, target_artifact_id, target_version_id, target_path,
  severity, check_type, outcome, rationale, evidence, rule_snapshot, assignee_id, due_on)
  VALUES (current_setting('t.p1')::uuid, '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 'R1', 1,
    (SELECT target_artifact_id FROM compliance_runs WHERE id = '00000000-0000-0000-0000-0000000000b1'),
    (SELECT target_version_id FROM compliance_runs WHERE id = '00000000-0000-0000-0000-0000000000b1'),
    'x', 'warning', 'manual', 'manual', 'manual_verification_required', '[]', '{}', t_user('designer'), current_date + 3);

SET ROLE authenticated;
-- ===== my_work =====
SELECT t_as('coowner');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'decide_review')::int, 2, 'co-owner must decide the two reviews the owner requested');
SELECT t_as('owner');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'decide_review')::int, 0, 'requester never sees their own reviews to decide');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'accept_ai' AND ref_id = current_setting('t.bv2')::uuid)::int, 1, 'contributors see AI text to accept');
SELECT t_as('observer');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'accept_ai')::int, 0, 'observers are not asked to accept AI text');
SELECT t_as('designer');
SELECT t_eq((SELECT title || '|' || due_on FROM my_work() WHERE kind = 'finding'), 'R1|' || (current_date + 3), 'assigned finding with due date');
SELECT t_as('sme');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'changes_requested')::int, 1, 'author sees the version returned for changes');
SELECT t_as('compliance');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'approve_exception' AND title LIKE '%Legacy')::int, 1, 'reviewer sees exceptions to approve');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'approve_exception' AND title LIKE '%Own')::int, 0, 'never their own exception');
SELECT t_eq((SELECT count(*) FROM my_work() WHERE kind = 'activate_rule')::int, 1, 'reviewer sees draft rules to activate');
SELECT t_as('outsider');
SELECT t_eq((SELECT count(*) FROM my_work())::int, 0, 'non-members see nothing');

-- ===== project_journey =====
SELECT t_err(format('SELECT project_journey(%L)', current_setting('t.p1')), 'Not a project member');
SELECT t_as('observer');
SELECT t_eq((project_journey(current_setting('t.p1')::uuid)->'architecture'->>'courses_specified')::int, 1, 'specified course counted');
SELECT t_eq((project_journey(current_setting('t.p1')::uuid)->'architecture'->>'defects')::int, 0, 'architecture defects reported');
SELECT t_eq((project_journey(current_setting('t.p1')::uuid)->'brief') IS NOT NULL, true, 'latest brief reported');
SELECT t_eq((project_journey(current_setting('t.p1')::uuid)->'reviews'->>'in_review')::int >= 2, true, 'reviews in progress counted');

-- ===== review_readiness mirrors the gates =====
SELECT t_as('owner');
SELECT t_eq((review_readiness(current_setting('t.bv2')::uuid)->>'ready')::boolean, false, 'AI-read brief not ready');
SELECT t_eq((SELECT c->>'count' FROM jsonb_array_elements(review_readiness(current_setting('t.bv2')::uuid)->'checks') c WHERE c->>'check' = 'ai_accepted'),
  '2', 'two AI fields still to accept');
SELECT t_eq((SELECT (c->>'ok')::boolean FROM jsonb_array_elements(review_readiness(current_setting('t.bv2')::uuid)->'checks') c WHERE c->>'check' = 'independent_approver'),
  true, 'a second program owner can decide stage 1');
-- A ready brief: readiness says ready, and the real request succeeds
SELECT set_config('t.bv4', create_program_brief(current_setting('t.p1')::uuid, 'guided_idea', 'academic_program',
  '{"title":{"en":"Ready brief"},"assumptions":{"en":"x"}}'::jsonb)::text, false);
SELECT confirm_brief_assumptions(current_setting('t.bv4')::uuid);
SELECT t_eq((review_readiness(current_setting('t.bv4')::uuid)->>'ready')::boolean, true, 'ready brief reported ready');
SELECT t_eq(request_review(current_setting('t.bv4')::uuid) IS NOT NULL, true, 'and the real request succeeds');
SELECT t_eq((SELECT (c->>'ok')::boolean FROM jsonb_array_elements(review_readiness(current_setting('t.bv4')::uuid)->'checks') c WHERE c->>'check' = 'is_draft'),
  false, 'in-review version is no longer a draft');
-- A single-owner project: nobody independent can decide stage 1
SELECT t_as('designer');
SELECT set_config('t.p6', create_project('Solo', NULL)::text, false);
SELECT set_config('t.bv6', create_program_brief(current_setting('t.p6')::uuid, 'guided_idea', 'academic_program',
  '{"title":{"en":"Solo brief"},"assumptions":{"en":"x"}}'::jsonb)::text, false);
SELECT confirm_brief_assumptions(current_setting('t.bv6')::uuid);
SELECT t_eq((SELECT (c->>'ok')::boolean FROM jsonb_array_elements(review_readiness(current_setting('t.bv6')::uuid)->'checks') c WHERE c->>'check' = 'independent_approver'),
  false, 'single-owner project flagged before submitting');
SELECT t_as('outsider');
SELECT t_err(format('SELECT review_readiness(%L)', current_setting('t.bv4')), 'Version not found');
RESET ROLE;
SELECT 'ALL 0010 CHECKS PASSED';
