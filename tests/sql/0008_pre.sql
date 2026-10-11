-- State created BEFORE migration 0008: users, a normal project, and two projects that weakened compliance.
INSERT INTO auth.users (email) SELECT 't-' || n || '@kau.edu.sa' FROM unnest(ARRAY['owner','coowner','sme','designer','compliance','observer']) n;
SET ROLE authenticated;
SELECT t_as('owner');
SELECT set_config('t.p1', create_project('Main', NULL)::text, false);
SELECT set_config('t.p2', create_project('Legacy no compliance', NULL)::text, false);
SELECT set_config('t.p3', create_project('Legacy weak compliance', NULL)::text, false);
SELECT save_workflow_stages(current_setting('t.p2')::uuid, '[{"key":"program_brief_confirmed","name_ar":"أ","name_en":"Brief","approver_roles":["program_owner"]},{"key":"export_frozen","name_ar":"ب","name_en":"Export","approver_roles":["program_owner"]},{"key":"final_signoff","name_ar":"ج","name_en":"Final","approver_roles":["program_owner"]}]'::jsonb);
SELECT save_workflow_stages(current_setting('t.p3')::uuid, '[{"key":"program_brief_confirmed","name_ar":"أ","name_en":"Brief","approver_roles":["program_owner"]},{"key":"compliance_review","name_ar":"ب","name_en":"Compliance","approver_roles":["program_owner","compliance_reviewer"]},{"key":"export_frozen","name_ar":"ج","name_en":"Export","approver_roles":["program_owner"]}]'::jsonb);
-- A legacy exception created before 0008
SELECT set_config('t.legacyexc', create_exception(current_setting('t.p1')::uuid, NULL, 'Legacy', 'Old waiver')::text, false);
RESET ROLE;
-- Invitations
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES ('coowner','program_owner'),('sme','subject_matter_expert'),('designer','instructional_designer'),('compliance','compliance_reviewer'),('observer','observer')) v(n, role) LOOP
    PERFORM t_as('owner'); SET LOCAL ROLE authenticated;
    PERFORM set_config('t.inv', invite_to_project(current_setting('t.p1')::uuid, 't-' || r.n || '@kau.edu.sa', r.role::public.project_role)::text, false);
    PERFORM t_as(r.n);
    PERFORM accept_invitation(current_setting('t.inv')::uuid);
    RESET ROLE;
  END LOOP;
END $$;
