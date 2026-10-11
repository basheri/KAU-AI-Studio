-- Exports: every generated file is logged with its SHA-256 so any copy can be verified later.
-- Official exports come only from approved versions (all review stages passed, including the final export freeze).
-- Previews of unapproved versions are allowed for contributors, are watermarked by the generator, and are logged too.
-- Rows are written only by the server (service role) through record_export, which re-checks every rule.

CREATE TYPE public.export_format AS ENUM ('course_spec_docx', 'program_summary_docx', 'scorm12');

CREATE TABLE public.export_records (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  format public.export_format NOT NULL,
  target_key text NOT NULL DEFAULT '' CHECK (length(target_key) <= 200),
  official boolean NOT NULL,
  lang text NOT NULL CHECK (lang IN ('ar', 'en')),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size int NOT NULL CHECK (byte_size > 0),
  version_state public.artifact_state NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX export_records_project ON public.export_records(project_id, created_at DESC);
CREATE INDEX export_records_sha ON public.export_records(sha256);

GRANT SELECT ON public.export_records TO authenticated;
GRANT ALL ON public.export_records TO service_role;
ALTER TABLE public.export_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY export_records_member_read ON public.export_records FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));

CREATE OR REPLACE FUNCTION public.guard_export_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Export records are immutable' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER export_records_immutable BEFORE UPDATE ON public.export_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_export_immutable();

-- Why an export is not allowed (NULL when it is). Internal: called with an explicit user.
CREATE OR REPLACE FUNCTION public.export_problem(_user_id uuid, _version_id uuid, _format public.export_format, _official boolean)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.artifact_versions%ROWTYPE; a public.artifacts%ROWTYPE; role public.project_role;
BEGIN
  SELECT * INTO v FROM public.artifact_versions WHERE id = _version_id;
  IF NOT FOUND THEN RETURN 'Version not found'; END IF;
  SELECT m.role INTO role FROM public.project_members m WHERE m.project_id = v.project_id AND m.user_id = _user_id;
  IF role IS NULL THEN RETURN 'Not a project member'; END IF;
  SELECT * INTO a FROM public.artifacts WHERE id = v.artifact_id;
  IF (_format IN ('course_spec_docx', 'program_summary_docx') AND a.kind::text <> 'program_architecture')
     OR (_format = 'scorm12' AND a.kind::text <> 'course_content') THEN
    RETURN 'This format does not fit this item';
  END IF;
  IF v.state IN ('superseded', 'archived') THEN RETURN 'A newer version replaced this one'; END IF;
  IF _official THEN
    IF v.state <> 'approved' THEN RETURN 'Official exports need an approved version'; END IF;
  ELSIF role = 'observer' THEN
    RETURN 'Observers can export approved versions only';
  END IF;
  RETURN NULL;
END $$;

-- For the screen: what the signed-in person may export from a version.
CREATE OR REPLACE FUNCTION public.export_options(_version_id uuid, _format public.export_format)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'official', public.export_problem(auth.uid(), _version_id, _format, true) IS NULL,
    'preview', public.export_problem(auth.uid(), _version_id, _format, false) IS NULL,
    'official_problem', public.export_problem(auth.uid(), _version_id, _format, true),
    'preview_problem', public.export_problem(auth.uid(), _version_id, _format, false))
$$;

-- Server only: log a generated file after re-checking the rules for that user.
CREATE OR REPLACE FUNCTION public.record_export(_id uuid, _user_id uuid, _version_id uuid, _format public.export_format,
  _target_key text, _official boolean, _lang text, _file_name text, _sha256 text, _byte_size int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE problem text; v public.artifact_versions%ROWTYPE;
BEGIN
  problem := public.export_problem(_user_id, _version_id, _format, _official);
  IF problem IS NOT NULL THEN RAISE EXCEPTION '%', problem USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v FROM public.artifact_versions WHERE id = _version_id;
  INSERT INTO public.export_records (id, project_id, artifact_version_id, format, target_key, official, lang, file_name,
      sha256, byte_size, version_state, created_by)
    VALUES (_id, v.project_id, _version_id, _format, coalesce(_target_key, ''), _official, _lang, _file_name,
      lower(_sha256), _byte_size, v.state, _user_id);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (v.project_id, _user_id, 'export.created', jsonb_build_object('export_id', _id, 'version_id', _version_id,
      'format', _format, 'official', _official, 'lang', _lang, 'sha256', lower(_sha256), 'target', _target_key));
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.guard_export_immutable(), public.export_problem(uuid, uuid, public.export_format, boolean),
  public.record_export(uuid, uuid, uuid, public.export_format, text, boolean, text, text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_export(uuid, uuid, uuid, public.export_format, text, boolean, text, text, text, int),
  public.export_problem(uuid, uuid, public.export_format, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.export_options(uuid, public.export_format) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_options(uuid, public.export_format) TO authenticated, service_role;
