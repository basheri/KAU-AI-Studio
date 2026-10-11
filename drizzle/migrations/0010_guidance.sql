-- Guidance for people: what is waiting for me, where each project stands, and what a review request still needs.
-- All three functions are read-only. They run as definer but filter explicitly to the caller's memberships
-- (auth.uid()), so they never reveal data from projects the caller cannot already read.

-- ===== What is waiting for me (across my projects) =====
CREATE OR REPLACE FUNCTION public.my_work()
RETURNS TABLE(kind text, project_id uuid, project_title text, ref_id uuid, artifact_id uuid, title text, detail text,
  due_on date, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT m.project_id, m.role FROM public.project_members m WHERE m.user_id = auth.uid())
  -- Reviews at a stage my role decides, that I neither requested nor wrote (export freeze exempt)
  SELECT 'decide_review', p.id, p.title, r.id, a.id, a.title, s.name_en || ' | ' || s.name_ar, NULL::date, r.created_at
  FROM public.review_requests r
  JOIN me ON me.project_id = r.project_id
  JOIN public.projects p ON p.id = r.project_id
  JOIN public.workflow_stages s ON s.id = r.stage_id
  JOIN public.artifact_versions v ON v.id = r.artifact_version_id
  JOIN public.artifacts a ON a.id = v.artifact_id
  WHERE r.status = 'open' AND me.role = ANY(s.approver_roles)
    AND (s.stage_key = 'export_frozen' OR (r.requested_by <> auth.uid() AND v.created_by <> auth.uid()))
  UNION ALL
  -- Findings assigned to me that are still open
  SELECT 'finding', p.id, p.title, f.id, f.target_artifact_id, f.rule_code, f.severity::text || ' | ' || f.status::text, f.due_on, f.created_at
  FROM public.compliance_findings f
  JOIN me ON me.project_id = f.project_id
  JOIN public.projects p ON p.id = f.project_id
  WHERE f.assignee_id = auth.uid() AND f.status IN ('open','acknowledged','remediation_in_progress')
  UNION ALL
  -- Exceptions waiting for my approval (compliance reviewers / system administrators, not the creator)
  SELECT 'approve_exception', p.id, p.title, e.id, e.artifact_id, e.reference || ' — ' || e.title, NULL, NULL::date, e.created_at
  FROM public.documented_exceptions e
  JOIN me ON me.project_id = e.project_id
  JOIN public.projects p ON p.id = e.project_id
  WHERE e.status = 'pending' AND e.created_by <> auth.uid() AND me.role IN ('compliance_reviewer','system_administrator')
  UNION ALL
  -- Sources waiting for a compliance decision
  SELECT 'approve_source', p.id, p.title, s.id, NULL::uuid, coalesce(nullif(s.title_en,''), s.title_ar), s.official_identifier, NULL::date, s.updated_at
  FROM public.compliance_sources s
  JOIN me ON me.project_id = s.project_id
  JOIN public.projects p ON p.id = s.project_id
  WHERE s.status = 'under_review' AND me.role IN ('compliance_reviewer','system_administrator')
  UNION ALL
  -- Draft rules waiting for activation
  SELECT 'activate_rule', p.id, p.title, ru.id, NULL::uuid, ru.rule_code, coalesce(nullif(ru.statement_en,''), ru.statement_ar), NULL::date, ru.updated_at
  FROM public.compliance_rules ru
  JOIN me ON me.project_id = ru.project_id
  JOIN public.projects p ON p.id = ru.project_id
  WHERE ru.status = 'draft' AND me.role IN ('compliance_reviewer','system_administrator')
  UNION ALL
  -- Draft briefs with AI text nobody has accepted yet (any contributor can accept)
  SELECT 'accept_ai', p.id, p.title, b.artifact_version_id, b.artifact_id, a.title,
    array_to_string(public.brief_ai_pending(b.fields), ', '), NULL::date, b.updated_at
  FROM public.program_briefs b
  JOIN me ON me.project_id = b.project_id
  JOIN public.projects p ON p.id = b.project_id
  JOIN public.artifacts a ON a.id = b.artifact_id
  JOIN public.artifact_versions v ON v.id = b.artifact_version_id
  WHERE v.state = 'draft' AND me.role <> 'observer' AND cardinality(public.brief_ai_pending(b.fields)) > 0
  UNION ALL
  -- Versions returned to their authors with changes requested and no corrected draft yet
  SELECT 'changes_requested', p.id, p.title, v.id, a.id, a.title, 'v' || v.version_number, NULL::date, v.updated_at
  FROM public.artifact_versions v
  JOIN me ON me.project_id = v.project_id
  JOIN public.projects p ON p.id = v.project_id
  JOIN public.artifacts a ON a.id = v.artifact_id
  WHERE v.state = 'changes_requested' AND v.created_by = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.artifact_versions c WHERE c.parent_version_id = v.id)
  ORDER BY 8 NULLS LAST, 9 DESC
$$;

-- ===== Where a project stands =====
CREATE OR REPLACE FUNCTION public.project_journey(_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE brief jsonb; arch jsonb; courses jsonb; comp jsonb; reviews jsonb;
  bv uuid; av uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(_project_id) THEN
    RAISE EXCEPTION 'Not a project member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Latest brief and its newest version
  SELECT v.id INTO bv FROM public.artifacts a JOIN public.artifact_versions v ON v.artifact_id = a.id
    WHERE a.project_id = _project_id AND a.kind = 'program_brief' AND a.structured AND v.state <> 'archived'
    ORDER BY a.created_at DESC, v.version_number DESC LIMIT 1;
  IF bv IS NOT NULL THEN
    SELECT jsonb_build_object('artifact_id', b.artifact_id, 'version_id', v.id, 'version', v.version_number, 'state', v.state,
      'assumptions_confirmed', b.assumptions_confirmed_at IS NOT NULL,
      'ai_pending', cardinality(public.brief_ai_pending(b.fields)))
      INTO brief FROM public.program_briefs b JOIN public.artifact_versions v ON v.id = b.artifact_version_id
      WHERE b.artifact_version_id = bv;
  END IF;
  -- Latest architecture and its newest version
  SELECT v.id INTO av FROM public.artifacts a JOIN public.artifact_versions v ON v.artifact_id = a.id
    WHERE a.project_id = _project_id AND a.kind = 'program_architecture' AND v.state <> 'archived'
    ORDER BY a.created_at DESC, v.version_number DESC LIMIT 1;
  IF av IS NOT NULL THEN
    SELECT jsonb_build_object('artifact_id', v.artifact_id, 'version_id', v.id, 'version', v.version_number, 'state', v.state,
      'elements', (SELECT count(*) FROM public.arch_elements e WHERE e.artifact_version_id = av),
      'defects', (SELECT count(*) FROM public.alignment_defects(av)),
      'unverified_references', (SELECT count(*) FROM public.arch_elements e, jsonb_array_elements(coalesce(e.details->'spec'->'references','[]')) r
                                 WHERE e.artifact_version_id = av AND e.element_type = 'course' AND (r->>'verified')::boolean IS NOT TRUE),
      'courses', (SELECT count(*) FROM public.arch_elements e WHERE e.artifact_version_id = av AND e.element_type = 'course'),
      'courses_specified', (SELECT count(*) FROM public.arch_elements e WHERE e.artifact_version_id = av AND e.element_type = 'course'
                             AND coalesce(e.details->'spec'->>'description_ar', e.details->'spec'->>'description_en', '') <> ''
                             AND EXISTS (SELECT 1 FROM public.arch_elements o WHERE o.parent_id = e.id AND o.element_type = 'course_outcome')))
      INTO arch FROM public.artifact_versions v WHERE v.id = av;
  END IF;
  -- Course content: newest version of each course content artifact
  SELECT jsonb_build_object('with_content', count(*),
      'critical_defects', coalesce(sum((SELECT count(*) FROM public.course_content_defects(x.vid) d WHERE d.severity = 'critical')), 0),
      'in_review_or_approved', count(*) FILTER (WHERE x.state IN ('in_review','approved')))
    INTO courses
    FROM (SELECT DISTINCT ON (a.id) v.id AS vid, v.state FROM public.artifacts a JOIN public.artifact_versions v ON v.artifact_id = a.id
          WHERE a.project_id = _project_id AND a.kind = 'course_content' AND v.state <> 'archived'
          ORDER BY a.id, v.version_number DESC) x;
  SELECT jsonb_build_object(
      'active_rules', (SELECT count(*) FROM public.compliance_rules r WHERE r.project_id = _project_id AND r.status = 'active'),
      'runs', (SELECT count(*) FROM public.compliance_runs r WHERE r.project_id = _project_id),
      'open_blockers', (SELECT count(*) FROM public.compliance_findings f WHERE f.project_id = _project_id AND f.severity = 'blocker'
                         AND f.status IN ('open','acknowledged','remediation_in_progress')),
      'open_findings', (SELECT count(*) FROM public.compliance_findings f WHERE f.project_id = _project_id
                         AND f.status IN ('open','acknowledged','remediation_in_progress')))
    INTO comp;
  SELECT jsonb_build_object(
      'in_review', count(*) FILTER (WHERE v.state = 'in_review'),
      'changes_requested', count(*) FILTER (WHERE v.state = 'changes_requested'),
      'approved', count(*) FILTER (WHERE v.state = 'approved'))
    INTO reviews FROM public.artifact_versions v WHERE v.project_id = _project_id;
  RETURN jsonb_build_object('brief', brief, 'architecture', arch, 'courses', courses, 'compliance', comp, 'reviews', reviews);
END $$;

-- ===== What a review request still needs (read-only preview of every review gate) =====
-- Keep in step with the gates: gate_structured_review, review_requests_compliance_gate, review_requests_ai_gate,
-- request_review's own checks, and segregation of duties (someone else must be able to decide the first stage).
CREATE OR REPLACE FUNCTION public.review_readiness(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.artifact_versions%ROWTYPE; a public.artifacts%ROWTYPE; b public.program_briefs%ROWTYPE;
  ar public.program_architectures%ROWTYPE; checks jsonb := '[]'; parent_state public.artifact_state; sid uuid;
  n bigint; st public.workflow_stages%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.artifact_versions WHERE id = _version_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN
    RAISE EXCEPTION 'Version not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO a FROM public.artifacts WHERE id = v.artifact_id;
  checks := checks || jsonb_build_object('check', 'is_draft', 'ok', v.state = 'draft');
  checks := checks || jsonb_build_object('check', 'no_other_review', 'ok',
    NOT EXISTS (SELECT 1 FROM public.artifact_versions x WHERE x.artifact_id = v.artifact_id AND x.state = 'in_review'));

  SELECT * INTO b FROM public.program_briefs WHERE artifact_version_id = _version_id;
  IF FOUND THEN
    checks := checks || jsonb_build_object('check', 'assumptions_confirmed', 'ok', b.assumptions_confirmed_at IS NOT NULL);
    n := cardinality(public.brief_ai_pending(b.fields));
    checks := checks || jsonb_build_object('check', 'ai_accepted', 'ok', n = 0, 'count', n);
  END IF;
  SELECT * INTO ar FROM public.program_architectures WHERE artifact_version_id = _version_id;
  IF FOUND THEN
    checks := checks || jsonb_build_object('check', 'brief_confirmed', 'ok',
      EXISTS (SELECT 1 FROM public.program_briefs x WHERE x.artifact_version_id = ar.brief_version_id AND x.assumptions_confirmed_at IS NOT NULL));
    checks := checks || jsonb_build_object('check', 'has_elements', 'ok',
      EXISTS (SELECT 1 FROM public.arch_elements e WHERE e.artifact_version_id = _version_id));
    SELECT count(*) INTO n FROM public.alignment_defects(_version_id);
    checks := checks || jsonb_build_object('check', 'aligned', 'ok', n = 0, 'count', n);
    SELECT count(*) INTO n FROM public.arch_elements e, jsonb_array_elements(coalesce(e.details->'spec'->'references','[]')) r
      WHERE e.artifact_version_id = _version_id AND e.element_type = 'course' AND (r->>'verified')::boolean IS NOT TRUE;
    checks := checks || jsonb_build_object('check', 'references_verified', 'ok', n = 0, 'count', n);
  END IF;
  IF EXISTS (SELECT 1 FROM public.course_contents WHERE artifact_version_id = _version_id) THEN
    SELECT count(*) INTO n FROM public.course_content_defects(_version_id) d WHERE d.severity = 'critical';
    checks := checks || jsonb_build_object('check', 'no_critical_defects', 'ok', n = 0, 'count', n);
  END IF;
  n := public.open_compliance_blockers(_version_id);
  checks := checks || jsonb_build_object('check', 'no_compliance_blockers', 'ok', n = 0, 'count', n);

  -- The stage the request would open (same rule as request_review), and whether someone other than
  -- the caller and the version's author holds a role that can decide it.
  SELECT state INTO parent_state FROM public.artifact_versions WHERE id = v.parent_version_id;
  IF parent_state = 'changes_requested' AND a.current_stage_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.workflow_stages WHERE id = a.current_stage_id AND is_active) THEN
    sid := a.current_stage_id;
  ELSE
    sid := public.first_stage(v.project_id);
  END IF;
  SELECT * INTO st FROM public.workflow_stages WHERE id = sid;
  checks := checks || jsonb_build_object('check', 'independent_approver', 'ok',
    st.stage_key = 'export_frozen' OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = v.project_id
      AND m.role = ANY(st.approver_roles) AND m.user_id <> auth.uid() AND m.user_id <> v.created_by),
    'stage_en', st.name_en, 'stage_ar', st.name_ar);
  RETURN jsonb_build_object('version_id', _version_id, 'kind', a.kind, 'checks', checks,
    'ready', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(checks) c WHERE (c->>'ok')::boolean IS NOT TRUE));
END $$;

REVOKE ALL ON FUNCTION public.my_work(), public.project_journey(uuid), public.review_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_work(), public.project_journey(uuid), public.review_readiness(uuid) TO authenticated, service_role;
