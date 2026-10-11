CREATE TYPE public.compliance_source_status AS ENUM ('draft','under_review','active','superseded','expired','rejected');
CREATE TYPE public.compliance_rule_status AS ENUM ('draft','active','superseded','retired');
CREATE TYPE public.rule_severity AS ENUM ('info','warning','blocker');
CREATE TYPE public.rule_check_type AS ENUM ('automated','manual','hybrid');
CREATE TYPE public.finding_status AS ENUM ('open','acknowledged','remediation_in_progress','resolved','accepted_exception','false_positive');

CREATE TABLE public.compliance_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lineage_id uuid NOT NULL,
  version_number int NOT NULL DEFAULT 1,
  parent_id uuid REFERENCES public.compliance_sources(id) ON DELETE CASCADE,
  title_ar text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '',
  issuing_authority text NOT NULL, document_type text NOT NULL, scope text NOT NULL DEFAULT '',
  source_url text, source_file_id uuid REFERENCES public.source_files(id) ON DELETE CASCADE,
  official_identifier text NOT NULL, official_version text NOT NULL DEFAULT '',
  published_on date, effective_on date, expires_on date,
  owner_name text NOT NULL DEFAULT '',
  status public.compliance_source_status NOT NULL DEFAULT 'draft',
  checksum text CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
  checksum_verified boolean, checksum_verified_at timestamptz,
  evidence_notes text NOT NULL DEFAULT '',
  decision_comment text, decided_by uuid, decided_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lineage_id, version_number),
  CHECK (expires_on IS NULL OR effective_on IS NULL OR expires_on >= effective_on)
);
CREATE INDEX compliance_sources_project ON public.compliance_sources(project_id);

CREATE TABLE public.compliance_rulesets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  title_ar text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '',
  revision int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE TABLE public.compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ruleset_id uuid NOT NULL REFERENCES public.compliance_rulesets(id) ON DELETE CASCADE,
  rule_code text NOT NULL CHECK (rule_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  version_number int NOT NULL DEFAULT 1,
  parent_id uuid REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
  statement_ar text NOT NULL DEFAULT '', statement_en text NOT NULL DEFAULT '',
  guidance_ar text NOT NULL DEFAULT '', guidance_en text NOT NULL DEFAULT '',
  remediation_ar text NOT NULL DEFAULT '', remediation_en text NOT NULL DEFAULT '',
  severity public.rule_severity NOT NULL,
  check_type public.rule_check_type NOT NULL,
  check_spec jsonb,
  applicability jsonb NOT NULL DEFAULT '{}',
  owner_name text NOT NULL DEFAULT '',
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  status public.compliance_rule_status NOT NULL DEFAULT 'draft',
  activated_by uuid, activated_at timestamptz, status_comment text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, rule_code, version_number),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX compliance_rules_one_active ON public.compliance_rules(project_id, rule_code) WHERE status = 'active';
CREATE UNIQUE INDEX compliance_rules_one_draft ON public.compliance_rules(project_id, rule_code) WHERE status = 'draft';

CREATE TABLE public.compliance_rule_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.compliance_sources(id) ON DELETE CASCADE,
  locator text NOT NULL DEFAULT '', page text NOT NULL DEFAULT '', section text NOT NULL DEFAULT '',
  UNIQUE (rule_id, source_id, locator)
);

CREATE TABLE public.compliance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ruleset_id uuid NOT NULL REFERENCES public.compliance_rulesets(id) ON DELETE CASCADE,
  ruleset_revision int NOT NULL,
  target_artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  target_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  target_kind text NOT NULL,
  as_of date NOT NULL,
  context jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  summary jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX compliance_runs_target ON public.compliance_runs(target_version_id);

CREATE TABLE public.compliance_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.compliance_runs(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
  rule_code text NOT NULL, rule_version int NOT NULL,
  target_artifact_id uuid NOT NULL, target_version_id uuid NOT NULL,
  target_path text NOT NULL,
  severity public.rule_severity NOT NULL,
  check_type public.rule_check_type NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('fail','manual','confirm')),
  rationale text NOT NULL, observed text, expected text,
  evidence jsonb NOT NULL, rule_snapshot jsonb NOT NULL,
  status public.finding_status NOT NULL DEFAULT 'open',
  assignee_id uuid, due_on date,
  exception_id uuid REFERENCES public.documented_exceptions(id) ON DELETE CASCADE,
  verified_run_id uuid REFERENCES public.compliance_runs(id) ON DELETE CASCADE,
  resolution_note text, closed_by uuid, closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_findings_version ON public.compliance_findings(target_version_id);
CREATE INDEX compliance_findings_run ON public.compliance_findings(run_id);

CREATE TABLE public.compliance_finding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES public.compliance_findings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('status','assign','comment')),
  from_status public.finding_status, to_status public.finding_status,
  comment text, details jsonb NOT NULL DEFAULT '{}',
  actor_id uuid NOT NULL, actor_role public.project_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

GRANT SELECT ON public.compliance_sources, public.compliance_rulesets, public.compliance_rules,
  public.compliance_rule_evidence, public.compliance_runs, public.compliance_findings,
  public.compliance_finding_events TO authenticated;
GRANT ALL ON public.compliance_sources, public.compliance_rulesets, public.compliance_rules,
  public.compliance_rule_evidence, public.compliance_runs, public.compliance_findings,
  public.compliance_finding_events TO service_role;

ALTER TABLE public.compliance_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rule_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_finding_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read compliance sources" ON public.compliance_sources FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read rulesets" ON public.compliance_rulesets FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read rules" ON public.compliance_rules FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read rule evidence" ON public.compliance_rule_evidence FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read runs" ON public.compliance_runs FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read findings" ON public.compliance_findings FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read finding events" ON public.compliance_finding_events FOR SELECT TO authenticated USING (public.is_project_member(project_id));

CREATE OR REPLACE FUNCTION public.source_status_on(_status public.compliance_source_status, _effective date, _expires date, _on date)
RETURNS public.compliance_source_status LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN _status = 'active' AND _expires IS NOT NULL AND _on > _expires
    THEN 'expired'::public.compliance_source_status ELSE _status END
$$;
CREATE OR REPLACE FUNCTION public.source_authorizes(_status public.compliance_source_status, _effective date, _expires date, _on date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT public.source_status_on(_status, _effective, _expires, _on) = 'active' AND (_effective IS NULL OR _effective <= _on)
$$;
CREATE OR REPLACE FUNCTION public.rule_applies(_app jsonb, _from date, _to date, _ctx jsonb, _on date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (_from IS NULL OR _from <= _on) AND (_to IS NULL OR _on <= _to)
    AND coalesce((SELECT bool_and(
          jsonb_array_length(coalesce(_app -> d.dim, '[]'::jsonb)) = 0
          OR coalesce((_app -> d.dim) ? nullif(_ctx ->> d.key, ''), false))
        FROM (VALUES ('categories','category'),('delivery_modes','delivery_mode'),('credit_types','credit_type'),
                     ('languages','language'),('artifact_kinds','artifact_kind')) AS d(dim, key)), false)
$$;

CREATE VIEW public.compliance_sources_current WITH (security_invoker = true) AS
  SELECT s.*,
    public.source_status_on(s.status, s.effective_on, s.expires_on, current_date) AS effective_status,
    public.source_authorizes(s.status, s.effective_on, s.expires_on, current_date) AS authorizes_rules
  FROM public.compliance_sources s;
GRANT SELECT ON public.compliance_sources_current TO authenticated;
GRANT ALL ON public.compliance_sources_current TO service_role;

CREATE OR REPLACE FUNCTION public.compliance_validate_applicability(_a jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE k text; v jsonb; out jsonb := '{}'::jsonb;
  allowed jsonb := jsonb_build_object(
    'categories', '["micro_credential","academic_program","professional_program"]'::jsonb,
    'delivery_modes', '["in_person","online","blended"]'::jsonb,
    'credit_types', '["credit_bearing","non_credit"]'::jsonb,
    'languages', '["ar","en","bilingual"]'::jsonb,
    'artifact_kinds', '["program_brief","program_architecture","course_content"]'::jsonb);
BEGIN
  IF _a IS NULL OR _a = 'null'::jsonb THEN RETURN out; END IF;
  IF jsonb_typeof(_a) <> 'object' THEN RAISE EXCEPTION 'Applicability must be an object' USING ERRCODE = 'check_violation'; END IF;
  FOR k IN SELECT jsonb_object_keys(_a) LOOP
    IF NOT allowed ? k THEN RAISE EXCEPTION 'Unknown applicability dimension %', k USING ERRCODE = 'check_violation'; END IF;
    IF jsonb_typeof(_a -> k) <> 'array' THEN RAISE EXCEPTION 'Invalid % value', k USING ERRCODE = 'check_violation'; END IF;
    FOR v IN SELECT jsonb_array_elements(_a -> k) LOOP
      IF jsonb_typeof(v) <> 'string' OR NOT ((allowed -> k) @> jsonb_build_array(v)) THEN
        RAISE EXCEPTION 'Invalid % value %', k, v USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    IF jsonb_array_length(_a -> k) > 0 THEN
      out := out || jsonb_build_object(k, (SELECT jsonb_agg(DISTINCT e) FROM jsonb_array_elements(_a -> k) e));
    END IF;
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.compliance_check_target(_spec jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _spec ->> 'type'
    WHEN 'brief_field_present' THEN 'program_brief' WHEN 'brief_field_bilingual' THEN 'program_brief'
    WHEN 'architecture_min_elements' THEN 'program_architecture' WHEN 'architecture_aligned' THEN 'program_architecture'
    WHEN 'course_block_present' THEN 'course_content' WHEN 'course_no_critical_defects' THEN 'course_content' END
$$;

CREATE OR REPLACE FUNCTION public.compliance_validate_check(_type public.rule_check_type, _spec jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE t text; n numeric;
BEGIN
  IF _type = 'manual' THEN
    IF _spec IS NOT NULL AND _spec <> 'null'::jsonb THEN RAISE EXCEPTION 'Manual rules cannot have an automated check' USING ERRCODE = 'check_violation'; END IF;
    RETURN NULL;
  END IF;
  IF _spec IS NULL OR jsonb_typeof(_spec) <> 'object' THEN
    RAISE EXCEPTION 'Automated and hybrid rules need a check definition' USING ERRCODE = 'check_violation';
  END IF;
  t := _spec ->> 'type';
  IF t IN ('brief_field_present','brief_field_bilingual') THEN
    IF NOT coalesce((_spec ->> 'field') = ANY(public.brief_field_keys()), false) THEN
      RAISE EXCEPTION 'Unknown brief field for check' USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('type', t, 'field', _spec ->> 'field');
  ELSIF t = 'architecture_min_elements' THEN
    IF NOT coalesce((_spec ->> 'element_type') = ANY(enum_range(NULL::public.arch_element_type)::text[]), false) THEN
      RAISE EXCEPTION 'Unknown architecture element type for check' USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(_spec -> 'min') <> 'number' THEN RAISE EXCEPTION 'Minimum must be a whole number from 1 to 1000' USING ERRCODE = 'check_violation'; END IF;
    n := (_spec ->> 'min')::numeric;
    IF n < 1 OR n > 1000 OR n <> floor(n) THEN RAISE EXCEPTION 'Minimum must be a whole number from 1 to 1000' USING ERRCODE = 'check_violation'; END IF;
    RETURN jsonb_build_object('type', t, 'element_type', _spec ->> 'element_type', 'min', n::int);
  ELSIF t = 'course_block_present' THEN
    IF NOT coalesce((_spec ->> 'block_type') = ANY(enum_range(NULL::public.course_block_type)::text[]), false) THEN
      RAISE EXCEPTION 'Unknown block type for check' USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('type', t, 'block_type', _spec ->> 'block_type');
  ELSIF t IN ('architecture_aligned','course_no_critical_defects') THEN
    RETURN jsonb_build_object('type', t);
  END IF;
  RAISE EXCEPTION 'Unknown check type %', t USING ERRCODE = 'check_violation';
END $$;

CREATE OR REPLACE FUNCTION public.compliance_evaluate_check(_spec jsonb, _version_id uuid,
  OUT passed boolean, OUT observed text, OUT expected text, OUT path text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE t text := _spec ->> 'type'; f jsonb; n bigint; has_ar boolean; has_en boolean;
BEGIN
  IF t IN ('brief_field_present','brief_field_bilingual') THEN
    SELECT b.fields -> (_spec ->> 'field') INTO f FROM public.program_briefs b WHERE b.artifact_version_id = _version_id;
    has_ar := coalesce(btrim(f ->> 'ar'), '') <> ''; has_en := coalesce(btrim(f ->> 'en'), '') <> '';
    path := 'brief.fields.' || (_spec ->> 'field');
    IF t = 'brief_field_present' THEN
      passed := has_ar OR has_en; observed := CASE WHEN passed THEN 'present' ELSE 'empty' END; expected := 'present';
    ELSE
      passed := has_ar AND has_en;
      observed := coalesce(nullif(concat_ws('+', CASE WHEN has_ar THEN 'ar' END, CASE WHEN has_en THEN 'en' END), ''), 'none');
      expected := 'ar+en';
    END IF;
  ELSIF t = 'architecture_min_elements' THEN
    SELECT count(*) INTO n FROM public.arch_elements e WHERE e.artifact_version_id = _version_id AND e.element_type::text = _spec ->> 'element_type';
    passed := n >= (_spec ->> 'min')::int; observed := n::text; expected := '>= ' || (_spec ->> 'min');
    path := 'architecture.' || (_spec ->> 'element_type');
  ELSIF t = 'architecture_aligned' THEN
    SELECT count(*) INTO n FROM public.alignment_defects(_version_id);
    passed := n = 0; observed := n::text || ' defects'; expected := '0 defects'; path := 'architecture.alignment';
  ELSIF t = 'course_block_present' THEN
    SELECT count(*) INTO n FROM public.content_blocks b WHERE b.artifact_version_id = _version_id AND b.block_type::text = _spec ->> 'block_type';
    passed := n >= 1; observed := n::text; expected := '>= 1'; path := 'course.blocks.' || (_spec ->> 'block_type');
  ELSIF t = 'course_no_critical_defects' THEN
    SELECT count(*) INTO n FROM public.course_content_defects(_version_id) d WHERE d.severity = 'critical';
    passed := n = 0; observed := n::text || ' critical defects'; expected := '0 critical defects'; path := 'course.validation';
  ELSE
    RAISE EXCEPTION 'Unknown check type %', t USING ERRCODE = 'check_violation';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.require_compliance_role(_project_id uuid, _roles public.project_role[])
RETURNS public.project_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.project_role := public.member_role(_project_id);
BEGIN
  IF auth.uid() IS NULL OR r IS NULL THEN RAISE EXCEPTION 'Not a project member' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NOT (r = ANY(_roles)) THEN RAISE EXCEPTION 'Your project role cannot perform this compliance action' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.guard_compliance_source() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE mutable text[] := ARRAY['status','decision_comment','decided_by','decided_at','checksum_verified','checksum_verified_at','updated_at'];
BEGIN
  IF OLD.status <> 'draft' AND (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'Sources are frozen once submitted; revise to create a new version' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status = 'under_review')
    OR (OLD.status = 'under_review' AND NEW.status IN ('draft','active','rejected'))
    OR (OLD.status = 'active' AND NEW.status IN ('superseded','expired'))) THEN
    RAISE EXCEPTION 'Invalid source status change from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compliance_sources_guard BEFORE UPDATE ON public.compliance_sources FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_source();

CREATE OR REPLACE FUNCTION public.guard_compliance_rule() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE mutable text[] := ARRAY['status','activated_by','activated_at','status_comment','updated_at'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'draft' AND (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
      RAISE EXCEPTION 'Active and past rule versions are frozen; revise to create a new version' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'draft' AND NEW.status = 'active')
      OR (OLD.status = 'active' AND NEW.status IN ('superseded','retired'))) THEN
      RAISE EXCEPTION 'Invalid rule status change from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') AND NOT EXISTS (
       SELECT 1 FROM public.compliance_rule_evidence e JOIN public.compliance_sources s ON s.id = e.source_id
       WHERE e.rule_id = NEW.id AND s.project_id = NEW.project_id
         AND public.source_authorizes(s.status, s.effective_on, s.expires_on, current_date)) THEN
    RAISE EXCEPTION 'An enforceable rule needs at least one active, effective source as evidence' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compliance_rules_guard BEFORE INSERT OR UPDATE ON public.compliance_rules FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_rule();

CREATE OR REPLACE FUNCTION public.guard_compliance_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.compliance_rules r WHERE r.id = OLD.rule_id AND r.status <> 'draft') THEN
      RAISE EXCEPTION 'Evidence of a non-draft rule is frozen' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM public.compliance_rules r WHERE r.id = NEW.rule_id AND r.status <> 'draft') THEN
    RAISE EXCEPTION 'Evidence of a non-draft rule is frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compliance_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.compliance_rule_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_evidence();

CREATE OR REPLACE FUNCTION public.guard_compliance_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Compliance run evidence is immutable' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER compliance_runs_immutable BEFORE UPDATE ON public.compliance_runs FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_immutable();
CREATE TRIGGER compliance_finding_events_immutable BEFORE UPDATE ON public.compliance_finding_events FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_immutable();

CREATE OR REPLACE FUNCTION public.guard_compliance_finding() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE mutable text[] := ARRAY['status','assignee_id','due_on','exception_id','verified_run_id','resolution_note','closed_by','closed_at','updated_at'];
BEGIN
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'Frozen finding evidence cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('resolved','accepted_exception','false_positive') THEN
    RAISE EXCEPTION 'This finding is closed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'open' AND OLD.status <> 'open' THEN
    RAISE EXCEPTION 'Findings cannot return to open' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.severity = 'blocker' AND NEW.status = 'false_positive' THEN
    RAISE EXCEPTION 'Blocker findings cannot be closed as false positive' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'accepted_exception' AND (NEW.exception_id IS NULL OR NEW.resolution_note IS NULL) THEN
    RAISE EXCEPTION 'An approved exception and a comment are required' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'resolved' AND NEW.severity = 'blocker'
     AND (NEW.resolution_note IS NULL OR (NEW.outcome = 'fail' AND NEW.verified_run_id IS NULL)) THEN
    RAISE EXCEPTION 'Blocker resolution needs verification and a comment' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compliance_findings_guard BEFORE UPDATE ON public.compliance_findings FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_finding();

CREATE OR REPLACE FUNCTION public.open_compliance_blockers(_version_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) FROM public.compliance_findings f
  WHERE f.target_version_id = _version_id AND f.severity = 'blocker' AND f.status IN ('open','acknowledged','remediation_in_progress')
$$;
CREATE OR REPLACE FUNCTION public.gate_compliance_review_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.open_compliance_blockers(NEW.artifact_version_id) > 0 THEN
    RAISE EXCEPTION 'Resolve open compliance blocker findings before review' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_requests_compliance_gate BEFORE INSERT ON public.review_requests FOR EACH ROW EXECUTE FUNCTION public.gate_compliance_review_request();
CREATE OR REPLACE FUNCTION public.gate_compliance_review_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.decision IN ('approve','approve_exception') AND public.open_compliance_blockers(NEW.artifact_version_id) > 0 THEN
    RAISE EXCEPTION 'Resolve open compliance blocker findings before approval' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_decisions_compliance_gate BEFORE INSERT ON public.review_decisions FOR EACH ROW EXECUTE FUNCTION public.gate_compliance_review_decision();

CREATE OR REPLACE FUNCTION public.compliance_readiness(_version_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'runs', (SELECT count(*) FROM public.compliance_runs r WHERE r.target_version_id = _version_id),
    'last_run_at', (SELECT max(r.created_at) FROM public.compliance_runs r WHERE r.target_version_id = _version_id),
    'open_blockers', (SELECT count(*) FROM public.compliance_findings f WHERE f.target_version_id = _version_id
       AND f.severity = 'blocker' AND f.status IN ('open','acknowledged','remediation_in_progress')),
    'open_findings', (SELECT count(*) FROM public.compliance_findings f WHERE f.target_version_id = _version_id
       AND f.status IN ('open','acknowledged','remediation_in_progress')))
$$;

CREATE OR REPLACE FUNCTION public.compliance_source_input(_project_id uuid, f jsonb)
RETURNS public.compliance_sources LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.compliance_sources;
BEGIN
  s.project_id := _project_id;
  s.title_ar := btrim(coalesce(f ->> 'title_ar', '')); s.title_en := btrim(coalesce(f ->> 'title_en', ''));
  s.description_ar := btrim(coalesce(f ->> 'description_ar', '')); s.description_en := btrim(coalesce(f ->> 'description_en', ''));
  s.issuing_authority := btrim(coalesce(f ->> 'issuing_authority', ''));
  s.document_type := btrim(coalesce(f ->> 'document_type', ''));
  s.scope := btrim(coalesce(f ->> 'scope', ''));
  s.source_url := nullif(btrim(coalesce(f ->> 'source_url', '')), '');
  s.source_file_id := nullif(f ->> 'source_file_id', '')::uuid;
  s.official_identifier := btrim(coalesce(f ->> 'official_identifier', ''));
  s.official_version := btrim(coalesce(f ->> 'official_version', ''));
  s.published_on := nullif(f ->> 'published_on', '')::date;
  s.effective_on := nullif(f ->> 'effective_on', '')::date;
  s.expires_on := nullif(f ->> 'expires_on', '')::date;
  s.owner_name := btrim(coalesce(f ->> 'owner_name', ''));
  s.checksum := nullif(lower(btrim(coalesce(f ->> 'checksum', ''))), '');
  s.evidence_notes := btrim(coalesce(f ->> 'evidence_notes', ''));
  IF s.title_ar = '' AND s.title_en = '' THEN RAISE EXCEPTION 'A source title is required' USING ERRCODE = 'check_violation'; END IF;
  IF s.issuing_authority = '' THEN RAISE EXCEPTION 'Issuing authority is required' USING ERRCODE = 'check_violation'; END IF;
  IF s.document_type = '' THEN RAISE EXCEPTION 'Document type is required' USING ERRCODE = 'check_violation'; END IF;
  IF s.official_identifier = '' THEN RAISE EXCEPTION 'Official identifier is required' USING ERRCODE = 'check_violation'; END IF;
  IF greatest(length(s.title_ar), length(s.title_en), length(s.issuing_authority), length(s.official_identifier)) > 300
     OR greatest(length(s.description_ar), length(s.description_en), length(s.evidence_notes)) > 5000 THEN
    RAISE EXCEPTION 'Source text is too long' USING ERRCODE = 'check_violation';
  END IF;
  IF s.source_url IS NULL AND s.source_file_id IS NULL THEN
    RAISE EXCEPTION 'Provide a source address or a project file' USING ERRCODE = 'check_violation';
  END IF;
  IF s.source_url IS NOT NULL AND NOT (s.source_url ~ '^https://' AND public.is_http_url(s.source_url)) THEN
    RAISE EXCEPTION 'Source address must be a valid https address' USING ERRCODE = 'check_violation';
  END IF;
  IF s.source_file_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.source_files sf WHERE sf.id = s.source_file_id AND sf.project_id = _project_id) THEN
    RAISE EXCEPTION 'Source file does not belong to this project' USING ERRCODE = 'check_violation';
  END IF;
  IF s.checksum IS NOT NULL AND s.checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Checksum must be a SHA-256 hex value' USING ERRCODE = 'check_violation';
  END IF;
  IF s.expires_on IS NOT NULL AND s.effective_on IS NOT NULL AND s.expires_on < s.effective_on THEN
    RAISE EXCEPTION 'Expiry date must be on or after the effective date' USING ERRCODE = 'check_violation';
  END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.save_compliance_source(_project_id uuid, _source_id uuid, _fields jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.compliance_sources; cur public.compliance_sources; sid uuid;
BEGIN
  PERFORM public.require_compliance_role(_project_id, ARRAY['program_owner','compliance_reviewer','system_administrator']::public.project_role[]);
  s := public.compliance_source_input(_project_id, coalesce(_fields, '{}'::jsonb));
  IF _source_id IS NULL THEN
    INSERT INTO public.compliance_sources (project_id, lineage_id, title_ar, title_en, description_ar, description_en, issuing_authority,
      document_type, scope, source_url, source_file_id, official_identifier, official_version, published_on, effective_on, expires_on,
      owner_name, checksum, evidence_notes, created_by)
    VALUES (_project_id, gen_random_uuid(), s.title_ar, s.title_en, s.description_ar, s.description_en, s.issuing_authority,
      s.document_type, s.scope, s.source_url, s.source_file_id, s.official_identifier, s.official_version, s.published_on, s.effective_on,
      s.expires_on, s.owner_name, s.checksum, s.evidence_notes, auth.uid()) RETURNING id INTO sid;
  ELSE
    SELECT * INTO cur FROM public.compliance_sources WHERE id = _source_id AND project_id = _project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source not found' USING ERRCODE = 'no_data_found'; END IF;
    IF cur.status <> 'draft' THEN RAISE EXCEPTION 'Only draft sources can be edited; revise instead' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.compliance_sources SET title_ar = s.title_ar, title_en = s.title_en, description_ar = s.description_ar,
      description_en = s.description_en, issuing_authority = s.issuing_authority, document_type = s.document_type, scope = s.scope,
      source_url = s.source_url, source_file_id = s.source_file_id, official_identifier = s.official_identifier,
      official_version = s.official_version, published_on = s.published_on, effective_on = s.effective_on, expires_on = s.expires_on,
      owner_name = s.owner_name, checksum = s.checksum, evidence_notes = s.evidence_notes, updated_at = now(),
      checksum_verified = CASE WHEN s.checksum IS NOT DISTINCT FROM cur.checksum AND s.source_file_id IS NOT DISTINCT FROM cur.source_file_id
                               THEN cur.checksum_verified END,
      checksum_verified_at = CASE WHEN s.checksum IS NOT DISTINCT FROM cur.checksum AND s.source_file_id IS NOT DISTINCT FROM cur.source_file_id
                               THEN cur.checksum_verified_at END
    WHERE id = _source_id;
    sid := _source_id;
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'compliance.source.saved', jsonb_build_object('source_id', sid));
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.revise_compliance_source(_source_id uuid, _fields jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old public.compliance_sources; s public.compliance_sources; sid uuid;
BEGIN
  SELECT * INTO old FROM public.compliance_sources WHERE id = _source_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_compliance_role(old.project_id, ARRAY['program_owner','compliance_reviewer','system_administrator']::public.project_role[]);
  IF old.status = 'draft' THEN RAISE EXCEPTION 'Edit the draft instead of revising it' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.compliance_sources x WHERE x.lineage_id = old.lineage_id AND x.status IN ('draft','under_review')) THEN
    RAISE EXCEPTION 'This source already has a revision in progress' USING ERRCODE = 'check_violation';
  END IF;
  s := public.compliance_source_input(old.project_id, to_jsonb(old) || coalesce(_fields, '{}'::jsonb));
  INSERT INTO public.compliance_sources (project_id, lineage_id, version_number, parent_id, title_ar, title_en, description_ar, description_en,
    issuing_authority, document_type, scope, source_url, source_file_id, official_identifier, official_version, published_on, effective_on,
    expires_on, owner_name, checksum, evidence_notes, created_by)
  VALUES (old.project_id, old.lineage_id,
    (SELECT max(x.version_number) + 1 FROM public.compliance_sources x WHERE x.lineage_id = old.lineage_id), old.id,
    s.title_ar, s.title_en, s.description_ar, s.description_en, s.issuing_authority, s.document_type, s.scope, s.source_url, s.source_file_id,
    s.official_identifier, s.official_version, s.published_on, s.effective_on, s.expires_on, s.owner_name, s.checksum, s.evidence_notes, auth.uid())
  RETURNING id INTO sid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (old.project_id, auth.uid(), 'compliance.source.revised', jsonb_build_object('source_id', sid, 'parent_id', old.id));
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.transition_compliance_source(_source_id uuid, _to public.compliance_source_status,
  _comment text DEFAULT NULL, _supersede_previous boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.compliance_sources; c text := nullif(btrim(coalesce(_comment, '')), '');
  approvers public.project_role[] := ARRAY['compliance_reviewer','system_administrator']::public.project_role[];
  editors public.project_role[] := ARRAY['program_owner','compliance_reviewer','system_administrator']::public.project_role[];
BEGIN
  SELECT * INTO s FROM public.compliance_sources WHERE id = _source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source not found' USING ERRCODE = 'no_data_found'; END IF;
  IF _to = 'under_review' THEN
    PERFORM public.require_compliance_role(s.project_id, editors);
    IF s.status <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be submitted' USING ERRCODE = 'check_violation'; END IF;
  ELSIF _to = 'draft' THEN
    PERFORM public.require_compliance_role(s.project_id, editors);
    IF s.status <> 'under_review' THEN RAISE EXCEPTION 'Only sources under review can be returned to draft' USING ERRCODE = 'check_violation'; END IF;
  ELSIF _to = 'active' THEN
    PERFORM public.require_compliance_role(s.project_id, approvers);
    IF s.status <> 'under_review' THEN RAISE EXCEPTION 'Only sources under review can be approved' USING ERRCODE = 'check_violation'; END IF;
    IF s.expires_on IS NOT NULL AND s.expires_on < current_date THEN
      RAISE EXCEPTION 'An expired source cannot be activated' USING ERRCODE = 'check_violation';
    END IF;
    IF s.source_file_id IS NOT NULL AND s.checksum_verified IS NOT TRUE THEN
      RAISE EXCEPTION 'Verify the file checksum before activation' USING ERRCODE = 'check_violation';
    END IF;
    IF _supersede_previous THEN
      UPDATE public.compliance_sources SET status = 'superseded', updated_at = now()
        WHERE lineage_id = s.lineage_id AND id <> s.id AND status = 'active';
    END IF;
  ELSIF _to = 'rejected' THEN
    PERFORM public.require_compliance_role(s.project_id, approvers);
    IF s.status <> 'under_review' THEN RAISE EXCEPTION 'Only sources under review can be rejected' USING ERRCODE = 'check_violation'; END IF;
    IF c IS NULL THEN RAISE EXCEPTION 'A comment is required to reject a source' USING ERRCODE = 'check_violation'; END IF;
  ELSIF _to = 'superseded' THEN
    PERFORM public.require_compliance_role(s.project_id, approvers);
    IF s.status <> 'active' THEN RAISE EXCEPTION 'Only active sources can be withdrawn' USING ERRCODE = 'check_violation'; END IF;
    IF c IS NULL THEN RAISE EXCEPTION 'A comment is required to withdraw a source' USING ERRCODE = 'check_violation'; END IF;
  ELSE
    RAISE EXCEPTION 'Expiry is computed from the expiry date and cannot be set manually' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.compliance_sources SET status = _to, decision_comment = c, decided_by = auth.uid(), decided_at = now(), updated_at = now()
    WHERE id = s.id;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (s.project_id, auth.uid(), 'compliance.source.status',
      jsonb_build_object('source_id', s.id, 'from', s.status, 'to', _to, 'comment', c));
END $$;

CREATE OR REPLACE FUNCTION public.record_source_checksum(_source_id uuid, _computed text, _actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.compliance_sources; okv boolean;
BEGIN
  SELECT * INTO s FROM public.compliance_sources WHERE id = _source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source not found' USING ERRCODE = 'no_data_found'; END IF;
  IF s.source_file_id IS NULL THEN RAISE EXCEPTION 'Only file sources can be verified' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(_computed, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid checksum' USING ERRCODE = 'check_violation'; END IF;
  IF s.checksum IS NULL AND s.status = 'draft' THEN
    UPDATE public.compliance_sources SET checksum = _computed, checksum_verified = true, checksum_verified_at = now() WHERE id = s.id;
    okv := true;
  ELSE
    okv := s.checksum = _computed;
    UPDATE public.compliance_sources SET checksum_verified = okv, checksum_verified_at = now() WHERE id = s.id;
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (s.project_id, _actor, 'compliance.source.checksum', jsonb_build_object('source_id', s.id, 'verified', okv));
  RETURN okv;
END $$;

CREATE OR REPLACE FUNCTION public.save_compliance_ruleset(_project_id uuid, _ruleset_id uuid, _code text, _title_ar text, _title_en text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid; ta text := btrim(coalesce(_title_ar, '')); te text := btrim(coalesce(_title_en, ''));
BEGIN
  PERFORM public.require_compliance_role(_project_id, ARRAY['program_owner','compliance_reviewer','system_administrator']::public.project_role[]);
  IF ta = '' AND te = '' THEN RAISE EXCEPTION 'A ruleset title is required' USING ERRCODE = 'check_violation'; END IF;
  IF _ruleset_id IS NULL THEN
    IF coalesce(_code, '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$' THEN
      RAISE EXCEPTION 'Ruleset code must be 1-40 letters, digits, dot, dash or underscore' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.compliance_rulesets x WHERE x.project_id = _project_id AND x.code = _code) THEN
      RAISE EXCEPTION 'A ruleset with this code already exists' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.compliance_rulesets (project_id, code, title_ar, title_en, created_by)
      VALUES (_project_id, _code, ta, te, auth.uid()) RETURNING id INTO rid;
  ELSE
    UPDATE public.compliance_rulesets SET title_ar = ta, title_en = te, updated_at = now()
      WHERE id = _ruleset_id AND project_id = _project_id RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'Ruleset not found' USING ERRCODE = 'no_data_found'; END IF;
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'compliance.ruleset.saved', jsonb_build_object('ruleset_id', rid));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.save_compliance_rule(_ruleset_id uuid, _rule_id uuid, _fields jsonb, _evidence jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rs public.compliance_rulesets; cur public.compliance_rules; f jsonb; rid uuid; e jsonb;
  code text; sev public.rule_severity; ct public.rule_check_type; spec jsonb; app jsonb; efrom date; eto date;
  st_ar text; st_en text;
BEGIN
  SELECT * INTO rs FROM public.compliance_rulesets WHERE id = _ruleset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ruleset not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_compliance_role(rs.project_id, ARRAY['program_owner','compliance_reviewer','system_administrator']::public.project_role[]);
  IF _rule_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.compliance_rules WHERE id = _rule_id AND ruleset_id = rs.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found' USING ERRCODE = 'no_data_found'; END IF;
    IF cur.status <> 'draft' THEN RAISE EXCEPTION 'Only draft rules can be edited; revise instead' USING ERRCODE = 'check_violation'; END IF;
    f := to_jsonb(cur) || coalesce(_fields, '{}'::jsonb);
    code := cur.rule_code;
  ELSE
    f := coalesce(_fields, '{}'::jsonb);
    code := btrim(coalesce(f ->> 'rule_code', ''));
    IF code !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$' THEN
      RAISE EXCEPTION 'Rule ID must be 1-40 letters, digits, dot, dash or underscore' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.compliance_rules x WHERE x.project_id = rs.project_id AND x.rule_code = code) THEN
      RAISE EXCEPTION 'Rule ID already exists; revise the existing rule instead' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  st_ar := btrim(coalesce(f ->> 'statement_ar', '')); st_en := btrim(coalesce(f ->> 'statement_en', ''));
  IF st_ar = '' AND st_en = '' THEN RAISE EXCEPTION 'A rule statement is required' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(f ->> 'severity', '') NOT IN ('info','warning','blocker') THEN RAISE EXCEPTION 'Choose a severity' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(f ->> 'check_type', '') NOT IN ('automated','manual','hybrid') THEN RAISE EXCEPTION 'Choose a check type' USING ERRCODE = 'check_violation'; END IF;
  sev := (f ->> 'severity')::public.rule_severity; ct := (f ->> 'check_type')::public.rule_check_type;
  spec := public.compliance_validate_check(ct, f -> 'check_spec');
  app := public.compliance_validate_applicability(f -> 'applicability');
  efrom := coalesce(nullif(f ->> 'effective_from', '')::date, current_date);
  eto := nullif(f ->> 'effective_to', '')::date;
  IF eto IS NOT NULL AND eto < efrom THEN RAISE EXCEPTION 'Rule end date must be on or after its start date' USING ERRCODE = 'check_violation'; END IF;
  IF sev = 'blocker' AND btrim(coalesce(f ->> 'remediation_ar', '')) = '' AND btrim(coalesce(f ->> 'remediation_en', '')) = '' THEN
    RAISE EXCEPTION 'Blocker rules need remediation guidance' USING ERRCODE = 'check_violation';
  END IF;
  IF _evidence IS NOT NULL AND jsonb_typeof(_evidence) <> 'array' THEN RAISE EXCEPTION 'Evidence must be a list' USING ERRCODE = 'check_violation'; END IF;
  IF _rule_id IS NULL THEN
    INSERT INTO public.compliance_rules (project_id, ruleset_id, rule_code, statement_ar, statement_en, guidance_ar, guidance_en,
      remediation_ar, remediation_en, severity, check_type, check_spec, applicability, owner_name, effective_from, effective_to, created_by)
    VALUES (rs.project_id, rs.id, code, st_ar, st_en, btrim(coalesce(f ->> 'guidance_ar', '')), btrim(coalesce(f ->> 'guidance_en', '')),
      btrim(coalesce(f ->> 'remediation_ar', '')), btrim(coalesce(f ->> 'remediation_en', '')), sev, ct, spec, app,
      btrim(coalesce(f ->> 'owner_name', '')), efrom, eto, auth.uid()) RETURNING id INTO rid;
  ELSE
    UPDATE public.compliance_rules SET statement_ar = st_ar, statement_en = st_en,
      guidance_ar = btrim(coalesce(f ->> 'guidance_ar', '')), guidance_en = btrim(coalesce(f ->> 'guidance_en', '')),
      remediation_ar = btrim(coalesce(f ->> 'remediation_ar', '')), remediation_en = btrim(coalesce(f ->> 'remediation_en', '')),
      severity = sev, check_type = ct, check_spec = spec, applicability = app, owner_name = btrim(coalesce(f ->> 'owner_name', '')),
      effective_from = efrom, effective_to = eto, updated_at = now()
    WHERE id = _rule_id;
    rid := _rule_id;
  END IF;
  IF _evidence IS NOT NULL THEN
    DELETE FROM public.compliance_rule_evidence WHERE rule_id = rid;
    FOR e IN SELECT jsonb_array_elements(_evidence) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.compliance_sources s WHERE s.id = nullif(e ->> 'source_id', '')::uuid AND s.project_id = rs.project_id) THEN
        RAISE EXCEPTION 'Evidence source does not belong to this project' USING ERRCODE = 'check_violation';
      END IF;
      INSERT INTO public.compliance_rule_evidence (project_id, rule_id, source_id, locator, page, section)
        VALUES (rs.project_id, rid, (e ->> 'source_id')::uuid, left(btrim(coalesce(e ->> 'locator', '')), 300),
          left(btrim(coalesce(e ->> 'page', '')), 50), left(btrim(coalesce(e ->> 'section', '')), 200))
        ON CONFLICT (rule_id, source_id, locator) DO NOTHING;
    END LOOP;
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (rs.project_id, auth.uid(), 'compliance.rule.saved', jsonb_build_object('rule_id', rid, 'rule_code', code));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.revise_compliance_rule(_rule_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.compliance_rules; nid uuid;
BEGIN
  SELECT * INTO r FROM public.compliance_rules WHERE id = _rule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_compliance_role(r.project_id, ARRAY['program_owner','compliance_reviewer','system_administrator']::public.project_role[]);
  IF r.status = 'draft' THEN RAISE EXCEPTION 'Edit the draft instead of revising it' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.compliance_rules x WHERE x.project_id = r.project_id AND x.rule_code = r.rule_code AND x.status = 'draft') THEN
    RAISE EXCEPTION 'This rule already has a draft revision' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.compliance_rules (project_id, ruleset_id, rule_code, version_number, parent_id, statement_ar, statement_en, guidance_ar,
    guidance_en, remediation_ar, remediation_en, severity, check_type, check_spec, applicability, owner_name, effective_from, effective_to, created_by)
  SELECT r.project_id, r.ruleset_id, r.rule_code,
    (SELECT max(x.version_number) + 1 FROM public.compliance_rules x WHERE x.project_id = r.project_id AND x.rule_code = r.rule_code),
    r.id, r.statement_ar, r.statement_en, r.guidance_ar, r.guidance_en, r.remediation_ar, r.remediation_en, r.severity, r.check_type,
    r.check_spec, r.applicability, r.owner_name, r.effective_from, r.effective_to, auth.uid()
  RETURNING id INTO nid;
  INSERT INTO public.compliance_rule_evidence (project_id, rule_id, source_id, locator, page, section)
    SELECT e.project_id, nid, e.source_id, e.locator, e.page, e.section FROM public.compliance_rule_evidence e WHERE e.rule_id = r.id;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (r.project_id, auth.uid(), 'compliance.rule.revised', jsonb_build_object('rule_id', nid, 'parent_id', r.id, 'rule_code', r.rule_code));
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.set_compliance_rule_status(_rule_id uuid, _to public.compliance_rule_status, _comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.compliance_rules; c text := nullif(btrim(coalesce(_comment, '')), '');
BEGIN
  SELECT * INTO r FROM public.compliance_rules WHERE id = _rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_compliance_role(r.project_id, ARRAY['compliance_reviewer','system_administrator']::public.project_role[]);
  IF _to = 'active' THEN
    IF r.status <> 'draft' THEN RAISE EXCEPTION 'Only draft rules can be activated' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.compliance_rules SET status = 'superseded', updated_at = now()
      WHERE project_id = r.project_id AND rule_code = r.rule_code AND status = 'active';
    UPDATE public.compliance_rules SET status = 'active', activated_by = auth.uid(), activated_at = now(), status_comment = c, updated_at = now()
      WHERE id = r.id;
  ELSIF _to = 'retired' THEN
    IF r.status <> 'active' THEN RAISE EXCEPTION 'Only active rules can be retired' USING ERRCODE = 'check_violation'; END IF;
    IF c IS NULL THEN RAISE EXCEPTION 'A comment is required to retire a rule' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.compliance_rules SET status = 'retired', status_comment = c, updated_at = now() WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Rules can only be activated or retired' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.compliance_rulesets SET revision = revision + 1, updated_at = now() WHERE id = r.ruleset_id;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (r.project_id, auth.uid(), 'compliance.rule.status', jsonb_build_object('rule_id', r.id, 'rule_code', r.rule_code, 'to', _to, 'comment', c));
END $$;

CREATE OR REPLACE FUNCTION public.run_compliance(_version_id uuid, _ruleset_id uuid, _context jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.artifact_versions; a public.artifacts; rs public.compliance_rulesets; r public.compliance_rules;
  brief_v uuid; cat text; ctx jsonb; today date := current_date; ev jsonb; authorized boolean; applies boolean;
  outcome text; p_passed boolean; p_obs text; p_exp text; p_path text; results jsonb := '[]'::jsonb; summary jsonb; rid uuid;
  ctxin jsonb := coalesce(_context, '{}'::jsonb);
BEGIN
  SELECT * INTO v FROM public.artifact_versions WHERE id = _version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(v.project_id);
  SELECT * INTO a FROM public.artifacts WHERE id = v.artifact_id;
  IF a.kind NOT IN ('program_brief','program_architecture','course_content') THEN
    RAISE EXCEPTION 'Compliance runs support program briefs, architectures and course content' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO rs FROM public.compliance_rulesets WHERE id = _ruleset_id AND project_id = v.project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ruleset not found in this project' USING ERRCODE = 'no_data_found'; END IF;
  brief_v := CASE a.kind
    WHEN 'program_brief' THEN v.id
    WHEN 'program_architecture' THEN (SELECT pa.brief_version_id FROM public.program_architectures pa WHERE pa.artifact_version_id = v.id)
    ELSE (SELECT pa.brief_version_id FROM public.course_contents cc JOIN public.program_architectures pa
            ON pa.artifact_version_id = cc.architecture_version_id WHERE cc.artifact_version_id = v.id) END;
  SELECT b.category::text INTO cat FROM public.program_briefs b WHERE b.artifact_version_id = brief_v;
  IF cat IS NULL THEN RAISE EXCEPTION 'The target has no linked program brief' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(ctxin ->> 'delivery_mode', '') NOT IN ('in_person','online','blended') THEN
    RAISE EXCEPTION 'Choose a delivery mode' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(ctxin ->> 'credit_type', '') NOT IN ('credit_bearing','non_credit') THEN
    RAISE EXCEPTION 'Choose a credential or credit type' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(ctxin ->> 'language', '') NOT IN ('ar','en','bilingual') THEN
    RAISE EXCEPTION 'Choose a program language' USING ERRCODE = 'check_violation'; END IF;
  ctx := jsonb_build_object('category', cat, 'delivery_mode', ctxin ->> 'delivery_mode', 'credit_type', ctxin ->> 'credit_type',
    'language', ctxin ->> 'language', 'artifact_kind', a.kind, 'as_of', today, 'brief_version_id', brief_v);

  FOR r IN SELECT * FROM public.compliance_rules x WHERE x.ruleset_id = rs.id AND x.status = 'active' ORDER BY x.rule_code LOOP
    p_passed := NULL; p_obs := NULL; p_exp := NULL; p_path := NULL;
    SELECT coalesce(jsonb_agg(jsonb_build_object('source_id', s.id, 'lineage_id', s.lineage_id, 'version_number', s.version_number,
        'title_ar', s.title_ar, 'title_en', s.title_en, 'issuing_authority', s.issuing_authority, 'document_type', s.document_type,
        'official_identifier', s.official_identifier, 'official_version', s.official_version, 'source_url', s.source_url,
        'source_file_id', s.source_file_id, 'checksum', s.checksum, 'checksum_verified', s.checksum_verified,
        'effective_on', s.effective_on, 'expires_on', s.expires_on,
        'status_on_run', public.source_status_on(s.status, s.effective_on, s.expires_on, today),
        'authorizes', public.source_authorizes(s.status, s.effective_on, s.expires_on, today),
        'locator', e.locator, 'page', e.page, 'section', e.section) ORDER BY s.official_identifier, e.locator), '[]'::jsonb)
      INTO ev FROM public.compliance_rule_evidence e JOIN public.compliance_sources s ON s.id = e.source_id WHERE e.rule_id = r.id;
    authorized := EXISTS (SELECT 1 FROM jsonb_array_elements(ev) x WHERE (x ->> 'authorizes')::boolean);
    applies := public.rule_applies(r.applicability, r.effective_from, r.effective_to, ctx, today)
      AND (r.check_spec IS NULL OR public.compliance_check_target(r.check_spec) = a.kind);
    IF NOT applies THEN outcome := 'not_applicable';
    ELSIF NOT authorized THEN outcome := 'not_authorized';
    ELSIF r.check_type = 'manual' THEN
      outcome := 'manual'; p_path := a.kind; p_exp := coalesce(nullif(r.statement_en, ''), r.statement_ar);
    ELSE
      SELECT c.passed, c.observed, c.expected, c.path INTO p_passed, p_obs, p_exp, p_path
        FROM public.compliance_evaluate_check(r.check_spec, v.id) c;
      outcome := CASE WHEN NOT p_passed THEN 'fail' WHEN r.check_type = 'hybrid' THEN 'confirm' ELSE 'pass' END;
    END IF;
    results := results || jsonb_build_array(jsonb_build_object('rule_id', r.id, 'rule_code', r.rule_code, 'version_number', r.version_number,
      'severity', r.severity, 'check_type', r.check_type, 'outcome', outcome, 'observed', p_obs, 'expected', p_exp, 'path', p_path,
      'rule', to_jsonb(r), 'evidence', ev));
  END LOOP;

  SELECT jsonb_build_object('total', count(*),
      'pass', count(*) FILTER (WHERE x ->> 'outcome' = 'pass'),
      'fail', count(*) FILTER (WHERE x ->> 'outcome' = 'fail'),
      'manual', count(*) FILTER (WHERE x ->> 'outcome' IN ('manual','confirm')),
      'not_applicable', count(*) FILTER (WHERE x ->> 'outcome' = 'not_applicable'),
      'not_authorized', count(*) FILTER (WHERE x ->> 'outcome' = 'not_authorized'),
      'blockers', count(*) FILTER (WHERE x ->> 'outcome' IN ('fail','manual','confirm') AND x ->> 'severity' = 'blocker'))
    INTO summary FROM jsonb_array_elements(results) x;

  INSERT INTO public.compliance_runs (project_id, ruleset_id, ruleset_revision, target_artifact_id, target_version_id, target_kind, as_of,
    context, snapshot, summary, created_by)
  VALUES (v.project_id, rs.id, rs.revision, a.id, v.id, a.kind, today, ctx,
    jsonb_build_object('ruleset', jsonb_build_object('id', rs.id, 'code', rs.code, 'title_ar', rs.title_ar, 'title_en', rs.title_en, 'revision', rs.revision),
      'target', jsonb_build_object('artifact_id', a.id, 'version_id', v.id, 'version_number', v.version_number, 'kind', a.kind,
        'title', a.title, 'state', v.state),
      'context', ctx, 'results', results),
    summary, auth.uid()) RETURNING id INTO rid;

  INSERT INTO public.compliance_findings (project_id, run_id, rule_id, rule_code, rule_version, target_artifact_id, target_version_id, target_path,
    severity, check_type, outcome, rationale, observed, expected, evidence, rule_snapshot)
  SELECT v.project_id, rid, (x ->> 'rule_id')::uuid, x ->> 'rule_code', (x ->> 'version_number')::int, a.id, v.id, coalesce(x ->> 'path', a.kind),
    (x ->> 'severity')::public.rule_severity, (x ->> 'check_type')::public.rule_check_type, x ->> 'outcome',
    CASE x ->> 'outcome' WHEN 'fail' THEN 'automated_check_failed' WHEN 'manual' THEN 'manual_verification_required'
      ELSE 'automated_passed_confirmation_required' END,
    x ->> 'observed', x ->> 'expected', x -> 'evidence', x -> 'rule'
  FROM jsonb_array_elements(results) x WHERE x ->> 'outcome' IN ('fail','manual','confirm');

  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (v.project_id, auth.uid(), 'compliance.run.created', jsonb_build_object('run_id', rid, 'version_id', v.id, 'summary', summary));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.assign_finding(_finding_id uuid, _assignee uuid, _due date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f public.compliance_findings; role public.project_role; ar public.project_role;
BEGIN
  SELECT * INTO f FROM public.compliance_findings WHERE id = _finding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE = 'no_data_found'; END IF;
  role := public.require_compliance_role(f.project_id, ARRAY['program_owner','compliance_reviewer','system_administrator']::public.project_role[]);
  IF _assignee IS NOT NULL THEN
    SELECT m.role INTO ar FROM public.project_members m WHERE m.project_id = f.project_id AND m.user_id = _assignee;
    IF ar IS NULL OR ar = 'observer' THEN RAISE EXCEPTION 'Assignee must be a contributing project member' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  IF _due IS NOT NULL AND _due < current_date THEN RAISE EXCEPTION 'Due date cannot be in the past' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.compliance_findings SET assignee_id = _assignee, due_on = _due, updated_at = now() WHERE id = f.id;
  INSERT INTO public.compliance_finding_events (project_id, finding_id, kind, details, actor_id, actor_role)
    VALUES (f.project_id, f.id, 'assign', jsonb_build_object('assignee_id', _assignee, 'due_on', _due), auth.uid(), role);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (f.project_id, auth.uid(), 'compliance.finding.assigned', jsonb_build_object('finding_id', f.id, 'assignee_id', _assignee, 'due_on', _due));
END $$;

CREATE OR REPLACE FUNCTION public.comment_finding(_finding_id uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f public.compliance_findings; role public.project_role; b text := btrim(coalesce(_body, ''));
BEGIN
  SELECT * INTO f FROM public.compliance_findings WHERE id = _finding_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE = 'no_data_found'; END IF;
  role := public.require_contributor(f.project_id);
  IF length(b) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Comment must be 1-4000 characters' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.compliance_finding_events (project_id, finding_id, kind, comment, actor_id, actor_role)
    VALUES (f.project_id, f.id, 'comment', b, auth.uid(), role);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (f.project_id, auth.uid(), 'compliance.finding.comment', jsonb_build_object('finding_id', f.id));
END $$;

CREATE OR REPLACE FUNCTION public.transition_finding(_finding_id uuid, _to public.finding_status, _comment text DEFAULT NULL,
  _exception_id uuid DEFAULT NULL, _verified_run_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f public.compliance_findings; role public.project_role; c text := nullif(btrim(coalesce(_comment, '')), '');
  vr public.compliance_runs; closing boolean := _to IN ('resolved','accepted_exception','false_positive');
BEGIN
  SELECT * INTO f FROM public.compliance_findings WHERE id = _finding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE = 'no_data_found'; END IF;
  role := public.require_contributor(f.project_id);
  IF f.status IN ('resolved','accepted_exception','false_positive') THEN RAISE EXCEPTION 'This finding is closed' USING ERRCODE = 'check_violation'; END IF;
  IF _to = f.status THEN RAISE EXCEPTION 'The finding already has this status' USING ERRCODE = 'check_violation'; END IF;
  IF _to IN ('acknowledged','remediation_in_progress') THEN
    IF NOT (role IN ('program_owner','compliance_reviewer','system_administrator') OR f.assignee_id = auth.uid()) THEN
      RAISE EXCEPTION 'Only the assignee, owner or compliance reviewer can update this finding' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _to = 'acknowledged' AND f.status <> 'open' THEN RAISE EXCEPTION 'Only open findings can be acknowledged' USING ERRCODE = 'check_violation'; END IF;
  ELSIF closing THEN
    IF role NOT IN ('compliance_reviewer','system_administrator') THEN
      RAISE EXCEPTION 'Only a compliance reviewer can decide findings' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _verified_run_id IS NOT NULL THEN
      SELECT * INTO vr FROM public.compliance_runs WHERE id = _verified_run_id AND project_id = f.project_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Verification run not found in this project' USING ERRCODE = 'check_violation'; END IF;
    END IF;
    IF _to = 'resolved' THEN
      IF f.severity = 'blocker' THEN
        IF c IS NULL THEN RAISE EXCEPTION 'A verification comment is required to resolve a blocker' USING ERRCODE = 'check_violation'; END IF;
        IF f.outcome = 'fail' THEN
          IF _verified_run_id IS NULL THEN
            RAISE EXCEPTION 'Resolving an automated blocker requires a later compliance run that passes this rule' USING ERRCODE = 'check_violation';
          END IF;
          IF NOT (vr.target_artifact_id = f.target_artifact_id AND vr.id <> f.run_id AND vr.created_at > f.created_at
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(vr.snapshot -> 'results') x
                              WHERE x ->> 'rule_code' = f.rule_code AND x ->> 'outcome' IN ('pass','confirm'))) THEN
            RAISE EXCEPTION 'The verification run does not show this rule passing for this artifact' USING ERRCODE = 'check_violation';
          END IF;
        END IF;
      END IF;
    ELSIF _to = 'accepted_exception' THEN
      IF c IS NULL OR _exception_id IS NULL THEN
        RAISE EXCEPTION 'An approved exception and a comment are required' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.documented_exceptions e WHERE e.id = _exception_id AND e.project_id = f.project_id
                     AND (e.artifact_id IS NULL OR e.artifact_id = f.target_artifact_id)) THEN
        RAISE EXCEPTION 'Exception does not belong to this artifact' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF f.severity = 'blocker' THEN RAISE EXCEPTION 'Blocker findings cannot be closed as false positive' USING ERRCODE = 'check_violation'; END IF;
      IF c IS NULL THEN RAISE EXCEPTION 'A comment is required' USING ERRCODE = 'check_violation'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Findings cannot return to open' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.compliance_findings SET status = _to, updated_at = now(),
    exception_id = CASE WHEN _to = 'accepted_exception' THEN _exception_id ELSE exception_id END,
    verified_run_id = CASE WHEN _to = 'resolved' THEN _verified_run_id ELSE verified_run_id END,
    resolution_note = CASE WHEN closing THEN c ELSE resolution_note END,
    closed_by = CASE WHEN closing THEN auth.uid() ELSE closed_by END,
    closed_at = CASE WHEN closing THEN now() ELSE closed_at END
  WHERE id = f.id;
  INSERT INTO public.compliance_finding_events (project_id, finding_id, kind, from_status, to_status, comment, details, actor_id, actor_role)
    VALUES (f.project_id, f.id, 'status', f.status, _to, c,
      jsonb_build_object('exception_id', _exception_id, 'verified_run_id', _verified_run_id), auth.uid(), role);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (f.project_id, auth.uid(), 'compliance.finding.status',
      jsonb_build_object('finding_id', f.id, 'from', f.status, 'to', _to, 'exception_id', _exception_id, 'verified_run_id', _verified_run_id));
END $$;

REVOKE ALL ON FUNCTION public.compliance_validate_applicability(jsonb), public.compliance_check_target(jsonb),
  public.compliance_validate_check(public.rule_check_type, jsonb), public.compliance_evaluate_check(jsonb, uuid),
  public.require_compliance_role(uuid, public.project_role[]), public.guard_compliance_source(), public.guard_compliance_rule(),
  public.guard_compliance_evidence(), public.guard_compliance_immutable(), public.guard_compliance_finding(),
  public.open_compliance_blockers(uuid), public.gate_compliance_review_request(), public.gate_compliance_review_decision(),
  public.compliance_source_input(uuid, jsonb), public.record_source_checksum(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_source_checksum(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.source_status_on(public.compliance_source_status, date, date, date),
  public.source_authorizes(public.compliance_source_status, date, date, date), public.rule_applies(jsonb, date, date, jsonb, date),
  public.compliance_readiness(uuid),
  public.save_compliance_source(uuid, uuid, jsonb), public.revise_compliance_source(uuid, jsonb),
  public.transition_compliance_source(uuid, public.compliance_source_status, text, boolean),
  public.save_compliance_ruleset(uuid, uuid, text, text, text), public.save_compliance_rule(uuid, uuid, jsonb, jsonb),
  public.revise_compliance_rule(uuid), public.set_compliance_rule_status(uuid, public.compliance_rule_status, text),
  public.run_compliance(uuid, uuid, jsonb), public.assign_finding(uuid, uuid, date), public.comment_finding(uuid, text),
  public.transition_finding(uuid, public.finding_status, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.source_status_on(public.compliance_source_status, date, date, date),
  public.source_authorizes(public.compliance_source_status, date, date, date), public.rule_applies(jsonb, date, date, jsonb, date),
  public.compliance_readiness(uuid),
  public.save_compliance_source(uuid, uuid, jsonb), public.revise_compliance_source(uuid, jsonb),
  public.transition_compliance_source(uuid, public.compliance_source_status, text, boolean),
  public.save_compliance_ruleset(uuid, uuid, text, text, text), public.save_compliance_rule(uuid, uuid, jsonb, jsonb),
  public.revise_compliance_rule(uuid), public.set_compliance_rule_status(uuid, public.compliance_rule_status, text),
  public.run_compliance(uuid, uuid, jsonb), public.assign_finding(uuid, uuid, date), public.comment_finding(uuid, text),
  public.transition_finding(uuid, public.finding_status, text, uuid, uuid)
  TO authenticated, service_role;
