CREATE TYPE public.artifact_state AS ENUM ('draft','in_review','changes_requested','approved','superseded','archived');
CREATE TYPE public.review_decision_kind AS ENUM ('approve','request_changes','approve_exception');
CREATE TYPE public.review_request_status AS ENUM ('open','approved','changes_requested','cancelled');

CREATE TABLE public.workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_key text NOT NULL CHECK (stage_key ~ '^[a-z0-9_]{1,60}$'),
  position int NOT NULL,
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 120),
  name_en text NOT NULL CHECK (length(btrim(name_en)) BETWEEN 1 AND 120),
  approver_roles public.project_role[] NOT NULL CHECK (cardinality(approver_roles) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage_key)
);

CREATE TABLE public.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('program_brief','program_architecture','course_architecture','learner_content','other')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  current_stage_id uuid REFERENCES public.workflow_stages(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  parent_version_id uuid REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  state public.artifact_state NOT NULL DEFAULT 'draft',
  content text NOT NULL DEFAULT '' CHECK (length(content) <= 200000),
  change_summary text CHECK (change_summary IS NULL OR length(change_summary) <= 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version_number)
);
CREATE UNIQUE INDEX artifact_versions_one_draft ON public.artifact_versions(artifact_id) WHERE state = 'draft';

CREATE TABLE public.documented_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_id uuid REFERENCES public.artifacts(id) ON DELETE CASCADE,
  reference text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  justification text NOT NULL CHECK (length(btrim(justification)) BETWEEN 1 AND 5000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, reference)
);

CREATE TABLE public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.workflow_stages(id) ON DELETE CASCADE,
  status public.review_request_status NOT NULL DEFAULT 'open',
  note text CHECK (note IS NULL OR length(note) <= 2000),
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE UNIQUE INDEX review_requests_one_open ON public.review_requests(artifact_version_id) WHERE status = 'open';

CREATE TABLE public.review_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  review_request_id uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_request_id, assignee_id)
);

CREATE TABLE public.review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  review_request_id uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.workflow_stages(id) ON DELETE CASCADE,
  decision public.review_decision_kind NOT NULL,
  comment text CHECK (comment IS NULL OR length(comment) <= 5000),
  exception_id uuid REFERENCES public.documented_exceptions(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  actor_role public.project_role NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decision_comment_required CHECK (decision = 'approve' OR length(btrim(coalesce(comment,''))) > 0),
  CONSTRAINT decision_exception_required CHECK (decision <> 'approve_exception' OR exception_id IS NOT NULL)
);

CREATE TABLE public.review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.review_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.review_comment_mentions (
  comment_id uuid NOT NULL REFERENCES public.review_comments(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

-- Read-only Data API access; every write goes through audited RPCs.
GRANT SELECT ON public.workflow_stages, public.artifacts, public.artifact_versions, public.documented_exceptions,
  public.review_requests, public.review_assignments, public.review_decisions, public.review_comments,
  public.review_comment_mentions TO authenticated;
GRANT ALL ON public.workflow_stages, public.artifacts, public.artifact_versions, public.documented_exceptions,
  public.review_requests, public.review_assignments, public.review_decisions, public.review_comments,
  public.review_comment_mentions TO service_role;

ALTER TABLE public.workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documented_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comment_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read stages" ON public.workflow_stages FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read artifacts" ON public.artifacts FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read versions" ON public.artifact_versions FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read exceptions" ON public.documented_exceptions FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read review requests" ON public.review_requests FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read assignments" ON public.review_assignments FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read decisions" ON public.review_decisions FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read review comments" ON public.review_comments FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read mentions" ON public.review_comment_mentions FOR SELECT TO authenticated USING (public.is_project_member(project_id));

-- Review lock: content of non-draft versions is frozen; states follow the governed transitions. Applies to every role.
CREATE OR REPLACE FUNCTION public.guard_artifact_version_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.change_summary IS DISTINCT FROM OLD.change_summary
     OR NEW.artifact_id <> OLD.artifact_id OR NEW.project_id <> OLD.project_id
     OR NEW.version_number <> OLD.version_number OR NEW.parent_version_id IS DISTINCT FROM OLD.parent_version_id
     OR NEW.created_by <> OLD.created_by THEN
    IF OLD.state <> 'draft' THEN
      RAISE EXCEPTION 'Version is locked (%); propose a child version instead', OLD.state USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.state <> OLD.state AND NOT (
       (OLD.state = 'draft' AND NEW.state IN ('in_review','archived'))
    OR (OLD.state = 'in_review' AND NEW.state IN ('approved','changes_requested'))
    OR (OLD.state = 'changes_requested' AND NEW.state IN ('superseded','archived'))
    OR (OLD.state = 'approved' AND NEW.state IN ('superseded','archived'))
    OR (OLD.state = 'superseded' AND NEW.state = 'archived')) THEN
    RAISE EXCEPTION 'Invalid state transition % -> %', OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER guard_artifact_version_update BEFORE UPDATE ON public.artifact_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_artifact_version_update();

-- Internal helpers (not callable through the API)
CREATE OR REPLACE FUNCTION public.member_role(_project_id uuid)
RETURNS public.project_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.project_members WHERE project_id = _project_id AND user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.require_contributor(_project_id uuid)
RETURNS public.project_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.project_role := public.member_role(_project_id);
BEGIN
  IF auth.uid() IS NULL OR r IS NULL THEN RAISE EXCEPTION 'Not a project member' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF r = 'observer' THEN RAISE EXCEPTION 'Observers cannot change review content' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.seed_default_workflow(_project_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.workflow_stages (project_id, stage_key, position, name_ar, name_en, approver_roles) VALUES
    (_project_id, 'program_brief_confirmed', 1, 'تأكيد موجز البرنامج', 'Program brief confirmed', ARRAY['program_owner']::public.project_role[]),
    (_project_id, 'program_architecture_review', 2, 'مراجعة هيكل البرنامج', 'Program architecture review', ARRAY['program_owner','subject_matter_expert','instructional_designer']::public.project_role[]),
    (_project_id, 'course_architecture_review', 3, 'مراجعة هيكل المقررات', 'Course architecture review', ARRAY['subject_matter_expert','instructional_designer']::public.project_role[]),
    (_project_id, 'learner_content_review', 4, 'مراجعة محتوى المتعلم', 'Learner content review', ARRAY['subject_matter_expert','instructional_designer']::public.project_role[]),
    (_project_id, 'compliance_review', 5, 'مراجعة الامتثال', 'Compliance review', ARRAY['compliance_reviewer']::public.project_role[]),
    (_project_id, 'export_frozen', 6, 'التجميد للتصدير', 'Export frozen', ARRAY['program_owner']::public.project_role[])
  ON CONFLICT (project_id, stage_key) DO NOTHING
$$;

REVOKE ALL ON FUNCTION public.member_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_contributor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_default_workflow(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_artifact_version_update() FROM PUBLIC, anon, authenticated;

-- Backfill the default flow for existing projects
SELECT public.seed_default_workflow(id) FROM public.projects;

CREATE OR REPLACE FUNCTION public.create_project(_title text, _description text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;
  INSERT INTO public.projects (title, description, created_by)
    VALUES (btrim(_title), nullif(btrim(coalesce(_description, '')), ''), uid) RETURNING id INTO pid;
  INSERT INTO public.project_members (project_id, user_id, role, added_by) VALUES (pid, uid, 'program_owner', uid);
  INSERT INTO public.project_settings (project_id) VALUES (pid);
  PERFORM public.seed_default_workflow(pid);
  INSERT INTO public.audit_events (project_id, actor_id, action) VALUES (pid, uid, 'project.created');
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.list_project_members(_project_id uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, role public.project_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, p.email, p.display_name, m.role
  FROM public.project_members m JOIN public.profiles p ON p.id = m.user_id
  WHERE m.project_id = _project_id AND public.is_project_member(_project_id)
  ORDER BY p.email
$$;

CREATE OR REPLACE FUNCTION public.first_stage(_project_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.workflow_stages WHERE project_id = _project_id AND is_active ORDER BY position LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.first_stage(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_artifact(_project_id uuid, _kind text, _title text, _content text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid; vid uuid;
BEGIN
  PERFORM public.require_contributor(_project_id);
  INSERT INTO public.artifacts (project_id, kind, title, current_stage_id, created_by)
    VALUES (_project_id, _kind, btrim(_title), public.first_stage(_project_id), auth.uid()) RETURNING id INTO aid;
  INSERT INTO public.artifact_versions (artifact_id, project_id, version_number, content, created_by)
    VALUES (aid, _project_id, 1, coalesce(_content, ''), auth.uid()) RETURNING id INTO vid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'artifact.created', jsonb_build_object('artifact_id', aid, 'version_id', vid));
  RETURN aid;
END $$;

-- Draft: edited in place. in_review / approved / changes_requested: a proposed child draft is created; the original is never mutated.
CREATE OR REPLACE FUNCTION public.edit_artifact(_version_id uuid, _content text, _change_summary text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.artifact_versions%ROWTYPE; nid uuid;
BEGIN
  SELECT * INTO v FROM public.artifact_versions WHERE id = _version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(v.project_id);
  IF v.state = 'draft' THEN
    UPDATE public.artifact_versions SET content = coalesce(_content, ''), change_summary = nullif(btrim(coalesce(_change_summary,'')), '') WHERE id = v.id;
    INSERT INTO public.audit_events (project_id, actor_id, action, details)
      VALUES (v.project_id, auth.uid(), 'artifact_version.edited', jsonb_build_object('version_id', v.id));
    RETURN v.id;
  ELSIF v.state IN ('in_review','approved','changes_requested') THEN
    IF EXISTS (SELECT 1 FROM public.artifact_versions WHERE artifact_id = v.artifact_id AND state = 'draft') THEN
      RAISE EXCEPTION 'A draft version already exists for this artifact' USING ERRCODE = 'unique_violation';
    END IF;
    INSERT INTO public.artifact_versions (artifact_id, project_id, version_number, parent_version_id, content, change_summary, created_by)
      VALUES (v.artifact_id, v.project_id,
              (SELECT max(version_number) + 1 FROM public.artifact_versions WHERE artifact_id = v.artifact_id),
              v.id, coalesce(_content, ''), nullif(btrim(coalesce(_change_summary,'')), ''), auth.uid())
      RETURNING id INTO nid;
    INSERT INTO public.audit_events (project_id, actor_id, action, details)
      VALUES (v.project_id, auth.uid(), 'artifact_version.proposed', jsonb_build_object('version_id', nid, 'parent_version_id', v.id, 'parent_state', v.state));
    RETURN nid;
  ELSE
    RAISE EXCEPTION 'Version is % and cannot be edited', v.state USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- A corrected child of a returned version resumes at the stage that returned it; any other version starts at the first stage.
CREATE OR REPLACE FUNCTION public.request_review(_version_id uuid, _note text DEFAULT NULL, _assignees uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.artifact_versions%ROWTYPE; a public.artifacts%ROWTYPE; parent_state public.artifact_state;
        sid uuid; rid uuid; u uuid;
BEGIN
  SELECT * INTO v FROM public.artifact_versions WHERE id = _version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(v.project_id);
  IF v.state <> 'draft' THEN RAISE EXCEPTION 'Only draft versions can be submitted for review' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.artifact_versions WHERE artifact_id = v.artifact_id AND state = 'in_review') THEN
    RAISE EXCEPTION 'Another version of this artifact is already in review' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO a FROM public.artifacts WHERE id = v.artifact_id FOR UPDATE;
  SELECT state INTO parent_state FROM public.artifact_versions WHERE id = v.parent_version_id;
  IF parent_state = 'changes_requested' AND a.current_stage_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.workflow_stages WHERE id = a.current_stage_id AND is_active) THEN
    sid := a.current_stage_id;
  ELSE
    sid := public.first_stage(v.project_id);
  END IF;
  IF sid IS NULL THEN RAISE EXCEPTION 'Project has no workflow stages' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.artifacts SET current_stage_id = sid, updated_at = now() WHERE id = a.id;
  UPDATE public.artifact_versions SET state = 'in_review' WHERE id = v.id;
  INSERT INTO public.review_requests (project_id, artifact_version_id, stage_id, note, requested_by)
    VALUES (v.project_id, v.id, sid, nullif(btrim(coalesce(_note,'')), ''), auth.uid()) RETURNING id INTO rid;
  FOREACH u IN ARRAY coalesce(_assignees, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = v.project_id AND user_id = u) THEN
      RAISE EXCEPTION 'Assignee is not a project member' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.review_assignments (project_id, review_request_id, assignee_id, assigned_by)
      VALUES (v.project_id, rid, u, auth.uid()) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (v.project_id, auth.uid(), 'review.requested', jsonb_build_object('request_id', rid, 'version_id', v.id, 'stage_id', sid, 'assignees', to_jsonb(coalesce(_assignees, '{}'))));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.assign_reviewer(_request_id uuid, _assignee uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.review_requests%ROWTYPE; aid uuid;
BEGIN
  SELECT * INTO r FROM public.review_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review request not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(r.project_id);
  IF r.status <> 'open' THEN RAISE EXCEPTION 'Review request is closed' USING ERRCODE = 'check_violation'; END IF;
  IF r.requested_by <> auth.uid() AND NOT public.has_project_role(r.project_id, ARRAY['program_owner']::public.project_role[]) THEN
    RAISE EXCEPTION 'Only the requester or program owner can assign reviewers' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = r.project_id AND user_id = _assignee) THEN
    RAISE EXCEPTION 'Assignee is not a project member' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.review_assignments (project_id, review_request_id, assignee_id, assigned_by)
    VALUES (r.project_id, r.id, _assignee, auth.uid())
    ON CONFLICT (review_request_id, assignee_id) DO UPDATE SET assigned_by = EXCLUDED.assigned_by RETURNING id INTO aid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (r.project_id, auth.uid(), 'review.assigned', jsonb_build_object('request_id', r.id, 'assignee', _assignee));
  RETURN aid;
END $$;

-- Approval at a stage opens the next active stage on the same version; approval at the last stage freezes the version as approved.
CREATE OR REPLACE FUNCTION public.decide_review(_request_id uuid, _decision public.review_decision_kind, _comment text DEFAULT NULL, _exception_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.review_requests%ROWTYPE; st public.workflow_stages%ROWTYPE; v public.artifact_versions%ROWTYPE;
        role public.project_role; did uuid; next_id uuid; c text := nullif(btrim(coalesce(_comment,'')), '');
BEGIN
  SELECT * INTO r FROM public.review_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review request not found' USING ERRCODE = 'no_data_found'; END IF;
  role := public.member_role(r.project_id);
  IF auth.uid() IS NULL OR role IS NULL THEN RAISE EXCEPTION 'Not a project member' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'Review request is closed' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO st FROM public.workflow_stages WHERE id = r.stage_id;
  IF NOT (role = ANY(st.approver_roles)) THEN
    RAISE EXCEPTION 'Your project role cannot decide at this stage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _decision IN ('request_changes','approve_exception') AND c IS NULL THEN
    RAISE EXCEPTION 'A comment is required for this decision' USING ERRCODE = 'check_violation';
  END IF;
  IF _decision = 'approve_exception' THEN
    IF _exception_id IS NULL THEN RAISE EXCEPTION 'An exception reference is required' USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO v FROM public.artifact_versions WHERE id = r.artifact_version_id;
    IF NOT EXISTS (SELECT 1 FROM public.documented_exceptions e WHERE e.id = _exception_id AND e.project_id = r.project_id
                   AND (e.artifact_id IS NULL OR e.artifact_id = v.artifact_id)) THEN
      RAISE EXCEPTION 'Exception does not belong to this artifact' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _exception_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.documented_exceptions e WHERE e.id = _exception_id AND e.project_id = r.project_id) THEN
      RAISE EXCEPTION 'Exception does not belong to this project' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.review_decisions (project_id, review_request_id, artifact_version_id, stage_id, decision, comment, exception_id, actor_id, actor_role)
    VALUES (r.project_id, r.id, r.artifact_version_id, r.stage_id, _decision, c, _exception_id, auth.uid(), role) RETURNING id INTO did;
  SELECT * INTO v FROM public.artifact_versions WHERE id = r.artifact_version_id FOR UPDATE;

  IF _decision = 'request_changes' THEN
    UPDATE public.review_requests SET status = 'changes_requested', closed_at = now() WHERE id = r.id;
    UPDATE public.artifact_versions SET state = 'changes_requested' WHERE id = v.id;
    INSERT INTO public.audit_events (project_id, actor_id, action, details)
      VALUES (r.project_id, auth.uid(), 'review.changes_requested', jsonb_build_object('decision_id', did, 'request_id', r.id, 'version_id', v.id, 'stage_id', r.stage_id, 'role', role));
    RETURN did;
  END IF;

  UPDATE public.review_requests SET status = 'approved', closed_at = now() WHERE id = r.id;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (r.project_id, auth.uid(), 'review.approved', jsonb_build_object('decision_id', did, 'request_id', r.id, 'version_id', v.id, 'stage_id', r.stage_id, 'role', role, 'decision', _decision, 'exception_id', _exception_id));
  SELECT id INTO next_id FROM public.workflow_stages
    WHERE project_id = r.project_id AND is_active AND position > st.position ORDER BY position LIMIT 1;
  IF next_id IS NOT NULL THEN
    UPDATE public.artifacts SET current_stage_id = next_id, updated_at = now() WHERE id = v.artifact_id;
    INSERT INTO public.review_requests (project_id, artifact_version_id, stage_id, requested_by, note)
      VALUES (r.project_id, v.id, next_id, r.requested_by, r.note);
  ELSE
    UPDATE public.artifact_versions SET state = 'superseded'
      WHERE artifact_id = v.artifact_id AND id <> v.id AND state IN ('approved','changes_requested');
    UPDATE public.artifact_versions SET state = 'approved' WHERE id = v.id;
    UPDATE public.artifacts SET updated_at = now() WHERE id = v.artifact_id;
    INSERT INTO public.audit_events (project_id, actor_id, action, details)
      VALUES (r.project_id, auth.uid(), 'artifact_version.approved', jsonb_build_object('version_id', v.id, 'decision_id', did));
  END IF;
  RETURN did;
END $$;

CREATE OR REPLACE FUNCTION public.add_review_comment(_version_id uuid, _body text, _parent_id uuid DEFAULT NULL, _mentions uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; u uuid;
BEGIN
  SELECT project_id INTO pid FROM public.artifact_versions WHERE id = _version_id;
  IF pid IS NULL THEN RAISE EXCEPTION 'Version not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(pid);
  IF _parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.review_comments WHERE id = _parent_id AND artifact_version_id = _version_id) THEN
    RAISE EXCEPTION 'Reply must belong to the same version thread' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.review_comments (project_id, artifact_version_id, parent_id, body, author_id)
    VALUES (pid, _version_id, _parent_id, btrim(_body), auth.uid()) RETURNING id INTO cid;
  FOREACH u IN ARRAY coalesce(_mentions, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = pid AND user_id = u) THEN
      RAISE EXCEPTION 'Only project members can be mentioned' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.review_comment_mentions (comment_id, project_id, user_id) VALUES (cid, pid, u) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (pid, auth.uid(), 'review.comment_added', jsonb_build_object('comment_id', cid, 'version_id', _version_id, 'mentions', to_jsonb(coalesce(_mentions, '{}'))));
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.create_exception(_project_id uuid, _artifact_id uuid, _title text, _justification text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eid uuid; ref text;
BEGIN
  PERFORM public.require_contributor(_project_id);
  IF _artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.artifacts WHERE id = _artifact_id AND project_id = _project_id) THEN
    RAISE EXCEPTION 'Artifact does not belong to this project' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('exc:' || _project_id::text));
  ref := 'EXC-' || lpad(((SELECT count(*) FROM public.documented_exceptions WHERE project_id = _project_id) + 1)::text, 3, '0');
  INSERT INTO public.documented_exceptions (project_id, artifact_id, reference, title, justification, created_by)
    VALUES (_project_id, _artifact_id, ref, btrim(_title), btrim(_justification), auth.uid()) RETURNING id INTO eid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'exception.created', jsonb_build_object('exception_id', eid, 'reference', ref, 'artifact_id', _artifact_id));
  RETURN eid;
END $$;

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
  FOR s IN SELECT * FROM jsonb_array_elements(_stages) LOOP
    i := i + 1;
    keys := keys || (s->>'key');
    INSERT INTO public.workflow_stages (project_id, stage_key, position, name_ar, name_en, approver_roles, is_active)
      VALUES (_project_id, s->>'key', i, btrim(s->>'name_ar'), btrim(s->>'name_en'),
              ARRAY(SELECT jsonb_array_elements_text(s->'approver_roles'))::public.project_role[], true)
      ON CONFLICT (project_id, stage_key) DO UPDATE SET position = EXCLUDED.position, name_ar = EXCLUDED.name_ar,
        name_en = EXCLUDED.name_en, approver_roles = EXCLUDED.approver_roles, is_active = true;
  END LOOP;
  IF 'system_administrator' = ANY(ARRAY(SELECT unnest(approver_roles)::text FROM public.workflow_stages WHERE project_id = _project_id AND stage_key = ANY(keys))) THEN
    NULL;
  END IF;
  UPDATE public.workflow_stages SET is_active = false, position = 1000 + position WHERE project_id = _project_id AND NOT (stage_key = ANY(keys)) AND is_active;
  UPDATE public.artifacts SET current_stage_id = public.first_stage(_project_id)
    WHERE project_id = _project_id AND (current_stage_id IS NULL OR current_stage_id IN (SELECT id FROM public.workflow_stages WHERE project_id = _project_id AND NOT is_active));
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'workflow.configured', jsonb_build_object('stages', to_jsonb(keys)));
END $$;

CREATE OR REPLACE FUNCTION public.archive_artifact(_artifact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  SELECT project_id INTO pid FROM public.artifacts WHERE id = _artifact_id;
  IF pid IS NULL OR NOT public.has_project_role(pid, ARRAY['program_owner']::public.project_role[]) THEN
    RAISE EXCEPTION 'Only the program owner can archive' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.artifact_versions WHERE artifact_id = _artifact_id AND state = 'in_review') THEN
    RAISE EXCEPTION 'Close the open review before archiving' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.artifact_versions SET state = 'archived' WHERE artifact_id = _artifact_id AND state <> 'archived';
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (pid, auth.uid(), 'artifact.archived', jsonb_build_object('artifact_id', _artifact_id));
END $$;

REVOKE ALL ON FUNCTION public.list_project_members(uuid), public.create_artifact(uuid, text, text, text),
  public.edit_artifact(uuid, text, text), public.request_review(uuid, text, uuid[]), public.assign_reviewer(uuid, uuid),
  public.decide_review(uuid, public.review_decision_kind, text, uuid), public.add_review_comment(uuid, text, uuid, uuid[]),
  public.create_exception(uuid, uuid, text, text), public.save_workflow_stages(uuid, jsonb), public.archive_artifact(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_project_members(uuid), public.create_artifact(uuid, text, text, text),
  public.edit_artifact(uuid, text, text), public.request_review(uuid, text, uuid[]), public.assign_reviewer(uuid, uuid),
  public.decide_review(uuid, public.review_decision_kind, text, uuid), public.add_review_comment(uuid, text, uuid, uuid[]),
  public.create_exception(uuid, uuid, text, text), public.save_workflow_stages(uuid, jsonb), public.archive_artifact(uuid)
  TO authenticated;