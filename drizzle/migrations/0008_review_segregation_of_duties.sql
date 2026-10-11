-- Segregation of duties for governed reviews:
--  1. Protected stages: every project keeps an active compliance_review stage decided only by compliance
--     reviewers / system administrators, and export_frozen as its last stage.
--  2. No self-decision: whoever requested the review or created the version cannot decide on it
--     (export_frozen is exempt: it is an administrative freeze after independent stages).
--  3. Documented exceptions start pending and must be approved by a compliance reviewer or system
--     administrator other than their creator before any review decision or finding can rely on them.
-- Enforced by triggers so the rules hold for every role, including the service role.

-- ===== 3. Exception approval =====
CREATE TYPE public.exception_status AS ENUM ('pending','approved','rejected');
ALTER TABLE public.documented_exceptions
  ADD COLUMN status public.exception_status NOT NULL DEFAULT 'pending',
  ADD COLUMN decided_by uuid,
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN decision_comment text CHECK (decision_comment IS NULL OR length(decision_comment) <= 2000);

CREATE OR REPLACE FUNCTION public.guard_documented_exception() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE mutable text[] := ARRAY['status','decided_by','decided_at','decision_comment'];
BEGIN
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'Documented exceptions cannot be edited; create a new one' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' OR NEW.status = 'pending' THEN
      RAISE EXCEPTION 'Exception decisions are final' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decided_by IS NULL OR NEW.decided_by = OLD.created_by THEN
      RAISE EXCEPTION 'An exception must be decided by someone other than its creator' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'rejected' AND nullif(btrim(coalesce(NEW.decision_comment, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A comment is required to reject an exception' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (NEW.decided_by, NEW.decided_at, NEW.decision_comment) IS DISTINCT FROM (OLD.decided_by, OLD.decided_at, OLD.decision_comment) THEN
    RAISE EXCEPTION 'Exception decisions are final' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documented_exceptions_guard BEFORE UPDATE ON public.documented_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_documented_exception();

CREATE OR REPLACE FUNCTION public.decide_exception(_exception_id uuid, _approve boolean, _comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.documented_exceptions; c text := nullif(btrim(coalesce(_comment, '')), '');
  to_status public.exception_status := CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;
BEGIN
  SELECT * INTO e FROM public.documented_exceptions WHERE id = _exception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exception not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_compliance_role(e.project_id, ARRAY['compliance_reviewer','system_administrator']::public.project_role[]);
  IF e.status <> 'pending' THEN RAISE EXCEPTION 'Exception decisions are final' USING ERRCODE = 'check_violation'; END IF;
  IF e.created_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot decide an exception you created' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT _approve AND c IS NULL THEN
    RAISE EXCEPTION 'A comment is required to reject an exception' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.documented_exceptions SET status = to_status, decided_by = auth.uid(), decided_at = now(), decision_comment = c
    WHERE id = e.id;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (e.project_id, auth.uid(), 'exception.' || to_status::text,
      jsonb_build_object('exception_id', e.id, 'reference', e.reference, 'comment', c));
END $$;

-- ===== 2. No self-decision, and only approved exceptions =====
CREATE OR REPLACE FUNCTION public.guard_review_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.review_requests; stage_key text; creator uuid;
BEGIN
  SELECT * INTO r FROM public.review_requests WHERE id = NEW.review_request_id;
  SELECT s.stage_key INTO stage_key FROM public.workflow_stages s WHERE s.id = NEW.stage_id;
  SELECT v.created_by INTO creator FROM public.artifact_versions v WHERE v.id = NEW.artifact_version_id;
  IF stage_key IS DISTINCT FROM 'export_frozen' AND NEW.actor_id IN (r.requested_by, creator) THEN
    RAISE EXCEPTION 'You cannot decide a review you requested or a version you created' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.decision = 'approve_exception' AND NOT EXISTS (
       SELECT 1 FROM public.documented_exceptions e WHERE e.id = NEW.exception_id AND e.status = 'approved') THEN
    RAISE EXCEPTION 'The exception has not been approved' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_decisions_segregation BEFORE INSERT ON public.review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_decision();

CREATE OR REPLACE FUNCTION public.guard_finding_exception() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'accepted_exception' AND OLD.status <> 'accepted_exception' AND NOT EXISTS (
       SELECT 1 FROM public.documented_exceptions e WHERE e.id = NEW.exception_id AND e.status = 'approved') THEN
    RAISE EXCEPTION 'The exception has not been approved' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compliance_findings_exception_gate BEFORE UPDATE ON public.compliance_findings
  FOR EACH ROW EXECUTE FUNCTION public.guard_finding_exception();

-- ===== 1. Protected stages =====
-- Repair existing projects first: re-add or re-activate the protected stages and fix compliance approvers.
INSERT INTO public.workflow_stages (project_id, stage_key, position, name_ar, name_en, approver_roles, is_active)
SELECT p.id, s.stage_key, 2000 + s.ord, s.name_ar, s.name_en, s.roles, false
FROM public.projects p
CROSS JOIN (VALUES
  ('compliance_review', 1, 'مراجعة الامتثال', 'Compliance review', ARRAY['compliance_reviewer']::public.project_role[]),
  ('export_frozen', 2, 'التجميد للتصدير', 'Export frozen', ARRAY['program_owner']::public.project_role[])
) AS s(stage_key, ord, name_ar, name_en, roles)
ON CONFLICT (project_id, stage_key) DO NOTHING;

UPDATE public.workflow_stages SET approver_roles = ARRAY['compliance_reviewer']::public.project_role[]
WHERE stage_key = 'compliance_review'
  AND NOT (approver_roles <@ ARRAY['compliance_reviewer','system_administrator']::public.project_role[]);

UPDATE public.workflow_stages w SET is_active = true,
  position = (SELECT coalesce(max(x.position), 0) + 1 FROM public.workflow_stages x
              WHERE x.project_id = w.project_id AND x.is_active AND x.stage_key <> 'export_frozen')
WHERE w.stage_key = 'compliance_review' AND NOT w.is_active;

UPDATE public.workflow_stages w SET is_active = true,
  position = (SELECT coalesce(max(x.position), 0) + 1 FROM public.workflow_stages x
              WHERE x.project_id = w.project_id AND x.is_active AND x.stage_key <> 'export_frozen')
WHERE w.stage_key = 'export_frozen'
  AND (NOT w.is_active OR w.position <= (SELECT coalesce(max(x.position), 0) FROM public.workflow_stages x
                                         WHERE x.project_id = w.project_id AND x.is_active AND x.stage_key <> 'export_frozen'));

CREATE OR REPLACE FUNCTION public.guard_workflow_stage() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.stage_key IN ('compliance_review','export_frozen') AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'The % stage is required and cannot be removed', NEW.stage_key USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage_key = 'compliance_review'
     AND NOT (NEW.approver_roles <@ ARRAY['compliance_reviewer','system_administrator']::public.project_role[]) THEN
    RAISE EXCEPTION 'Compliance review can only be decided by compliance reviewers or system administrators' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_stages_protected BEFORE INSERT OR UPDATE ON public.workflow_stages
  FOR EACH ROW EXECUTE FUNCTION public.guard_workflow_stage();

CREATE OR REPLACE FUNCTION public.save_workflow_stages(_project_id uuid, _stages jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; i int := 0; keys text[] := '{}';
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_project_role(_project_id, ARRAY['program_owner']::public.project_role[]) THEN
    RAISE EXCEPTION 'Only the program owner can configure the workflow' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(_stages) <> 'array' OR jsonb_array_length(_stages) = 0 THEN
    RAISE EXCEPTION 'At least one stage is required' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.review_requests WHERE project_id = _project_id AND status = 'open') THEN
    RAISE EXCEPTION 'Close open reviews before changing the workflow' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_stages) x WHERE x ->> 'key' = 'compliance_review') THEN
    RAISE EXCEPTION 'The compliance_review stage is required and cannot be removed' USING ERRCODE = 'check_violation';
  END IF;
  IF _stages -> -1 ->> 'key' IS DISTINCT FROM 'export_frozen' THEN
    RAISE EXCEPTION 'The export_frozen stage is required and must be the last stage' USING ERRCODE = 'check_violation';
  END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(_stages) LOOP
    i := i + 1;
    keys := keys || (s->>'key');
    INSERT INTO public.workflow_stages (project_id, stage_key, position, name_ar, name_en, approver_roles, is_active)
      VALUES (_project_id, s->>'key', i, btrim(s->>'name_ar'), btrim(s->>'name_en'),
              ARRAY(SELECT jsonb_array_elements_text(s->'approver_roles'))::public.project_role[], true)
      ON CONFLICT (project_id, stage_key) DO UPDATE SET position = EXCLUDED.position, name_ar = EXCLUDED.name_ar,
        name_en = EXCLUDED.name_en, approver_roles = EXCLUDED.approver_roles, is_active = true;
  END LOOP;
  UPDATE public.workflow_stages SET is_active = false, position = 1000 + position WHERE project_id = _project_id AND NOT (stage_key = ANY(keys)) AND is_active;
  UPDATE public.artifacts SET current_stage_id = public.first_stage(_project_id)
    WHERE project_id = _project_id AND (current_stage_id IS NULL OR current_stage_id IN (SELECT id FROM public.workflow_stages WHERE project_id = _project_id AND NOT is_active));
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'workflow.configured', jsonb_build_object('stages', to_jsonb(keys)));
END $$;

REVOKE ALL ON FUNCTION public.guard_documented_exception(), public.guard_review_decision(), public.guard_finding_exception(),
  public.guard_workflow_stage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_exception(uuid, boolean, text), public.save_workflow_stages(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_exception(uuid, boolean, text), public.save_workflow_stages(uuid, jsonb)
  TO authenticated, service_role;
