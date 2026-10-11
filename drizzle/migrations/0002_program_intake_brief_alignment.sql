CREATE TYPE public.program_category AS ENUM ('micro_credential','academic_program','professional_program');
CREATE TYPE public.intake_mode AS ENUM ('guided_idea','document_upload','redevelopment');
CREATE TYPE public.arch_element_type AS ENUM ('program_outcome','course','course_outcome','activity','assessment','source_evidence');

ALTER TABLE public.artifacts ADD COLUMN structured boolean NOT NULL DEFAULT false;

CREATE TABLE public.source_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending','succeeded','failed','unsupported')),
  extracted_text text,
  extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  extraction_error text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  extracted_at timestamptz
);

CREATE TABLE public.program_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_label text NOT NULL,
  snapshot jsonb NOT NULL,
  imported_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_briefs (
  artifact_version_id uuid PRIMARY KEY REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  intake_mode public.intake_mode NOT NULL,
  category public.program_category NOT NULL,
  fields jsonb NOT NULL,
  source_file_id uuid REFERENCES public.source_files(id) ON DELETE CASCADE,
  source_snapshot_id uuid REFERENCES public.program_source_snapshots(id) ON DELETE CASCADE,
  assumptions_confirmed_at timestamptz,
  assumptions_confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_architectures (
  artifact_version_id uuid PRIMARY KEY REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  brief_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arch_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  element_type public.arch_element_type NOT NULL,
  parent_id uuid REFERENCES public.arch_elements(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT '' CHECK (length(code) <= 40),
  label_ar text NOT NULL DEFAULT '' CHECK (length(label_ar) <= 2000),
  label_en text NOT NULL DEFAULT '' CHECK (length(label_en) <= 2000),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  position int NOT NULL,
  CHECK (length(btrim(label_ar)) > 0 OR length(btrim(label_en)) > 0)
);
CREATE INDEX arch_elements_version ON public.arch_elements(artifact_version_id);

CREATE TABLE public.arch_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  from_id uuid NOT NULL REFERENCES public.arch_elements(id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES public.arch_elements(id) ON DELETE CASCADE,
  UNIQUE (artifact_version_id, from_id, to_id)
);

GRANT SELECT ON public.source_files, public.program_source_snapshots, public.program_briefs,
  public.program_architectures, public.arch_elements, public.arch_mappings TO authenticated;
GRANT ALL ON public.source_files, public.program_source_snapshots, public.program_briefs,
  public.program_architectures, public.arch_elements, public.arch_mappings TO service_role;

ALTER TABLE public.source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_architectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arch_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arch_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read source files" ON public.source_files FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read snapshots" ON public.program_source_snapshots FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read briefs" ON public.program_briefs FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read architectures" ON public.program_architectures FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read arch elements" ON public.arch_elements FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read arch mappings" ON public.arch_mappings FOR SELECT TO authenticated USING (public.is_project_member(project_id));

-- Immutable imported snapshots (every role)
CREATE OR REPLACE FUNCTION public.guard_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Imported source snapshots are immutable' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER guard_snapshot_immutable BEFORE UPDATE ON public.program_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_snapshot_immutable();

-- Source file: identity immutable; extraction may be recorded exactly once
CREATE OR REPLACE FUNCTION public.guard_source_file_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.project_id <> OLD.project_id OR NEW.storage_path <> OLD.storage_path OR NEW.mime_type <> OLD.mime_type
     OR NEW.size_bytes <> OLD.size_bytes OR NEW.uploaded_by <> OLD.uploaded_by OR NEW.file_name <> OLD.file_name THEN
    RAISE EXCEPTION 'Source file metadata is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.extraction_status <> 'pending' THEN
    RAISE EXCEPTION 'Extraction result already recorded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_source_file_update BEFORE UPDATE ON public.source_files
  FOR EACH ROW EXECUTE FUNCTION public.guard_source_file_update();

-- Structured rows follow the version lock: writable only while the version is a draft
CREATE OR REPLACE FUNCTION public.guard_structured_rows() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE vid uuid; st public.artifact_state;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF; -- cascades from parent deletion
    vid := OLD.artifact_version_id;
  ELSE
    vid := NEW.artifact_version_id;
  END IF;
  SELECT state INTO st FROM public.artifact_versions WHERE id = vid;
  IF st IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Version is locked (%); propose a child version instead', st USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_brief_rows BEFORE INSERT OR UPDATE OR DELETE ON public.program_briefs FOR EACH ROW EXECUTE FUNCTION public.guard_structured_rows();
CREATE TRIGGER guard_architecture_rows BEFORE INSERT OR UPDATE OR DELETE ON public.program_architectures FOR EACH ROW EXECUTE FUNCTION public.guard_structured_rows();
CREATE TRIGGER guard_arch_element_rows BEFORE INSERT OR UPDATE OR DELETE ON public.arch_elements FOR EACH ROW EXECUTE FUNCTION public.guard_structured_rows();
CREATE TRIGGER guard_arch_mapping_rows BEFORE INSERT OR UPDATE OR DELETE ON public.arch_mappings FOR EACH ROW EXECUTE FUNCTION public.guard_structured_rows();

-- Structured artifacts: version text is derived; only structured RPCs may write it
CREATE OR REPLACE FUNCTION public.guard_structured_version_write() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content)
     AND EXISTS (SELECT 1 FROM public.artifacts WHERE id = NEW.artifact_id AND structured)
     AND coalesce(current_setting('app.structured_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Structured artifacts are edited through the Program Studio' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_structured_version_write BEFORE INSERT OR UPDATE ON public.artifact_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_structured_version_write();

-- Child versions inherit structured content (new ids, same shape), preserving the parent
CREATE OR REPLACE FUNCTION public.copy_structured_to_child() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE idmap jsonb;
BEGIN
  IF NEW.parent_version_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.program_briefs (artifact_version_id, project_id, artifact_id, intake_mode, category, fields,
      source_file_id, source_snapshot_id, assumptions_confirmed_at, assumptions_confirmed_by)
    SELECT NEW.id, project_id, artifact_id, intake_mode, category, fields, source_file_id, source_snapshot_id,
           assumptions_confirmed_at, assumptions_confirmed_by
    FROM public.program_briefs WHERE artifact_version_id = NEW.parent_version_id;
  INSERT INTO public.program_architectures (artifact_version_id, project_id, artifact_id, brief_version_id)
    SELECT NEW.id, project_id, artifact_id, brief_version_id FROM public.program_architectures WHERE artifact_version_id = NEW.parent_version_id;
  SELECT coalesce(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb) INTO idmap
    FROM public.arch_elements WHERE artifact_version_id = NEW.parent_version_id;
  INSERT INTO public.arch_elements (id, project_id, artifact_version_id, element_type, parent_id, code, label_ar, label_en, details, position)
    SELECT (idmap->>id::text)::uuid, project_id, NEW.id, element_type, (idmap->>parent_id::text)::uuid, code, label_ar, label_en, details, position
    FROM public.arch_elements WHERE artifact_version_id = NEW.parent_version_id;
  INSERT INTO public.arch_mappings (project_id, artifact_version_id, from_id, to_id)
    SELECT project_id, NEW.id, (idmap->>from_id::text)::uuid, (idmap->>to_id::text)::uuid
    FROM public.arch_mappings WHERE artifact_version_id = NEW.parent_version_id;
  RETURN NEW;
END $$;
CREATE TRIGGER copy_structured_to_child AFTER INSERT ON public.artifact_versions
  FOR EACH ROW EXECUTE FUNCTION public.copy_structured_to_child();

-- Canonical brief helpers
CREATE OR REPLACE FUNCTION public.brief_field_keys() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['title','rationale','target_learners','delivery_mode','duration_credits','intended_outcomes',
               'assumptions','required_sources','stakeholders','risks','category']
$$;

CREATE OR REPLACE FUNCTION public.brief_blank() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_object_agg(k, jsonb_build_object('ar','','en','','provenance',NULL,'source_ref',NULL))
  FROM unnest(public.brief_field_keys()) k
$$;

-- Put a plain string into the ar or en slot with the given provenance
CREATE OR REPLACE FUNCTION public.brief_set_value(_fields jsonb, _key text, _value text, _prov text, _ref text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN coalesce(btrim(_value),'') = '' OR NOT (_key = ANY(public.brief_field_keys())) THEN _fields
    ELSE jsonb_set(_fields, ARRAY[_key], jsonb_build_object(
      'ar', CASE WHEN _value ~ '[\u0600-\u06FF]' THEN btrim(_value) ELSE '' END,
      'en', CASE WHEN _value ~ '[\u0600-\u06FF]' THEN '' ELSE btrim(_value) END,
      'provenance', _prov, 'source_ref', _ref)) END
$$;

-- Overlay client input: any changed field becomes manual; unchanged fields keep provenance
CREATE OR REPLACE FUNCTION public.brief_apply_manual(_current jsonb, _input jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; cur jsonb; inp jsonb; ar text; en text; out jsonb := _current;
BEGIN
  IF _input IS NULL THEN RETURN out; END IF;
  IF jsonb_typeof(_input) <> 'object' THEN RAISE EXCEPTION 'Brief fields must be an object' USING ERRCODE = 'check_violation'; END IF;
  FOR k IN SELECT jsonb_object_keys(_input) LOOP
    IF NOT (k = ANY(public.brief_field_keys())) THEN
      RAISE EXCEPTION 'Unknown brief field %', k USING ERRCODE = 'check_violation';
    END IF;
    cur := out -> k; inp := _input -> k;
    ar := btrim(coalesce(inp->>'ar', cur->>'ar', ''));
    en := btrim(coalesce(inp->>'en', cur->>'en', ''));
    IF length(ar) > 10000 OR length(en) > 10000 THEN RAISE EXCEPTION 'Field % is too long', k USING ERRCODE = 'check_violation'; END IF;
    IF ar IS DISTINCT FROM coalesce(cur->>'ar','') OR en IS DISTINCT FROM coalesce(cur->>'en','') THEN
      out := jsonb_set(out, ARRAY[k], jsonb_build_object('ar', ar, 'en', en,
        'provenance', CASE WHEN ar = '' AND en = '' THEN NULL ELSE 'manual' END, 'source_ref', NULL));
    END IF;
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.render_brief(_fields jsonb, _category public.program_category, _mode public.intake_mode)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 'Category: ' || _category || E'\nIntake: ' || _mode || E'\n' || string_agg(
    k || ' [' || coalesce(_fields->k->>'provenance','-') || ']' || E'\n  AR: ' || coalesce(_fields->k->>'ar','') || E'\n  EN: ' || coalesce(_fields->k->>'en',''),
    E'\n' ORDER BY ord)
  FROM unnest(public.brief_field_keys()) WITH ORDINALITY AS t(k, ord)
$$;

CREATE OR REPLACE FUNCTION public.storage_project_id(_name text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 1)::uuid END
$$;

-- Storage: private project-scoped bucket, members read, contributors upload; no client updates/deletes
CREATE POLICY "Members read project sources" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-sources' AND public.is_project_member(public.storage_project_id(name)));
CREATE POLICY "Contributors upload project sources" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-sources' AND public.is_project_member(public.storage_project_id(name))
    AND NOT public.has_project_role(public.storage_project_id(name), ARRAY['observer']::public.project_role[]));

CREATE OR REPLACE FUNCTION public.register_source_file(_project_id uuid, _storage_path text, _file_name text, _mime_type text, _size_bytes bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fid uuid;
BEGIN
  PERFORM public.require_contributor(_project_id);
  IF _mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown') THEN
    RAISE EXCEPTION 'Unsupported file type %; allowed: PDF, DOCX, TXT, MD', _mime_type USING ERRCODE = 'check_violation';
  END IF;
  IF _size_bytes IS NULL OR _size_bytes <= 0 THEN RAISE EXCEPTION 'File is empty' USING ERRCODE = 'check_violation'; END IF;
  IF _size_bytes > 10485760 THEN RAISE EXCEPTION 'File exceeds the 10 MB limit' USING ERRCODE = 'check_violation'; END IF;
  IF public.storage_project_id(_storage_path) IS DISTINCT FROM _project_id THEN
    RAISE EXCEPTION 'Storage path must be inside the project folder' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'project-sources' AND name = _storage_path) THEN
    RAISE EXCEPTION 'Uploaded object not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.source_files (project_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    VALUES (_project_id, _storage_path, btrim(_file_name), _mime_type, _size_bytes, auth.uid()) RETURNING id INTO fid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'source_file.registered', jsonb_build_object('file_id', fid, 'mime_type', _mime_type, 'size_bytes', _size_bytes));
  RETURN fid;
END $$;

-- Server-only (service role): records the outcome of the deterministic extractor
CREATE OR REPLACE FUNCTION public.record_source_extraction(_file_id uuid, _status text, _text text, _fields jsonb, _error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF _status NOT IN ('succeeded','failed','unsupported') THEN RAISE EXCEPTION 'Invalid extraction status' USING ERRCODE = 'check_violation'; END IF;
  IF _status = 'succeeded' AND (jsonb_typeof(coalesce(_fields,'{}')) <> 'object' OR coalesce(_fields,'{}') = '{}'::jsonb) THEN
    RAISE EXCEPTION 'A successful extraction must contain fields' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.source_files SET extraction_status = _status, extracted_text = left(_text, 200000),
    extracted_fields = CASE WHEN _status = 'succeeded' THEN _fields ELSE '{}'::jsonb END,
    extraction_error = _error, extracted_at = now()
    WHERE id = _file_id RETURNING project_id INTO pid;
  IF pid IS NULL THEN RAISE EXCEPTION 'Source file not found' USING ERRCODE = 'no_data_found'; END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (pid, NULL, 'source_file.extracted', jsonb_build_object('file_id', _file_id, 'status', _status));
END $$;

CREATE OR REPLACE FUNCTION public.create_program_brief(_project_id uuid, _mode public.intake_mode, _category public.program_category,
  _fields jsonb DEFAULT '{}'::jsonb, _source_file_id uuid DEFAULT NULL, _snapshot jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f jsonb := public.brief_blank(); sf public.source_files%ROWTYPE; snap_id uuid; k text; aid uuid; vid uuid; title text;
BEGIN
  PERFORM public.require_contributor(_project_id);
  IF _mode = 'document_upload' THEN
    IF _source_file_id IS NULL THEN RAISE EXCEPTION 'An uploaded proposal is required' USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO sf FROM public.source_files WHERE id = _source_file_id AND project_id = _project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source file does not belong to this project' USING ERRCODE = 'check_violation'; END IF;
    IF sf.extraction_status = 'succeeded' THEN
      FOR k IN SELECT jsonb_object_keys(sf.extracted_fields) LOOP
        f := public.brief_set_value(f, k, sf.extracted_fields->>k, 'extracted', 'source_file:' || sf.id);
      END LOOP;
    END IF;
  ELSIF _source_file_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only the upload intake takes a source file' USING ERRCODE = 'check_violation';
  END IF;
  IF _mode = 'redevelopment' THEN
    IF _snapshot IS NULL OR jsonb_typeof(_snapshot) <> 'object' OR _snapshot = '{}'::jsonb THEN
      RAISE EXCEPTION 'An existing program source snapshot is required' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.program_source_snapshots (project_id, source_label, snapshot, imported_by)
      VALUES (_project_id, coalesce(nullif(btrim(_snapshot->>'source_label'),''), 'Existing program'), _snapshot, auth.uid()) RETURNING id INTO snap_id;
    IF jsonb_typeof(_snapshot->'fields') = 'object' THEN
      FOR k IN SELECT jsonb_object_keys(_snapshot->'fields') LOOP
        f := public.brief_set_value(f, k, _snapshot->'fields'->>k, 'imported', 'snapshot:' || snap_id);
      END LOOP;
    END IF;
    INSERT INTO public.audit_events (project_id, actor_id, action, details)
      VALUES (_project_id, auth.uid(), 'snapshot.imported', jsonb_build_object('snapshot_id', snap_id));
  ELSIF _snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'Only the redevelopment intake takes a snapshot' USING ERRCODE = 'check_violation';
  END IF;
  f := public.brief_apply_manual(f, coalesce(_fields, '{}'::jsonb) - 'category');
  f := jsonb_set(f, '{category}', jsonb_build_object('ar','','en',_category::text,'provenance','manual','source_ref',NULL));
  title := coalesce(nullif(f->'title'->>'en',''), nullif(f->'title'->>'ar',''));
  IF title IS NULL THEN RAISE EXCEPTION 'A title is required' USING ERRCODE = 'check_violation'; END IF;

  PERFORM set_config('app.structured_write', 'on', true);
  aid := public.create_artifact(_project_id, 'program_brief', left(title, 200), public.render_brief(f, _category, _mode));
  UPDATE public.artifacts SET structured = true WHERE id = aid;
  SELECT id INTO vid FROM public.artifact_versions WHERE artifact_id = aid;
  INSERT INTO public.program_briefs (artifact_version_id, project_id, artifact_id, intake_mode, category, fields, source_file_id, source_snapshot_id)
    VALUES (vid, _project_id, aid, _mode, _category, f, _source_file_id, snap_id);
  PERFORM set_config('app.structured_write', 'off', true);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'brief.created', jsonb_build_object('artifact_id', aid, 'version_id', vid, 'mode', _mode, 'category', _category));
  RETURN vid;
END $$;

CREATE OR REPLACE FUNCTION public.update_program_brief(_version_id uuid, _fields jsonb, _category public.program_category, _change_summary text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.program_briefs%ROWTYPE; f jsonb; nid uuid; assumptions_changed boolean;
BEGIN
  SELECT * INTO b FROM public.program_briefs WHERE artifact_version_id = _version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(b.project_id);
  f := public.brief_apply_manual(b.fields, coalesce(_fields, '{}'::jsonb) - 'category');
  f := jsonb_set(f, '{category}', jsonb_build_object('ar','','en',_category::text,'provenance','manual','source_ref',NULL));
  IF coalesce(nullif(f->'title'->>'en',''), nullif(f->'title'->>'ar','')) IS NULL THEN
    RAISE EXCEPTION 'A title is required' USING ERRCODE = 'check_violation';
  END IF;
  assumptions_changed := (f->'assumptions') IS DISTINCT FROM (b.fields->'assumptions');
  PERFORM set_config('app.structured_write', 'on', true);
  nid := public.edit_artifact(_version_id, public.render_brief(f, _category, b.intake_mode), _change_summary);
  UPDATE public.program_briefs SET fields = f, category = _category, updated_at = now(),
    assumptions_confirmed_at = CASE WHEN assumptions_changed THEN NULL ELSE assumptions_confirmed_at END,
    assumptions_confirmed_by = CASE WHEN assumptions_changed THEN NULL ELSE assumptions_confirmed_by END
    WHERE artifact_version_id = nid;
  PERFORM set_config('app.structured_write', 'off', true);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (b.project_id, auth.uid(), 'brief.updated', jsonb_build_object('version_id', nid, 'from_version_id', _version_id, 'assumptions_reset', assumptions_changed));
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_brief_assumptions(_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.program_briefs%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.program_briefs WHERE artifact_version_id = _version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(b.project_id);
  IF coalesce(b.fields->'assumptions'->>'ar','') = '' AND coalesce(b.fields->'assumptions'->>'en','') = '' THEN
    RAISE EXCEPTION 'State the assumptions before confirming them' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.program_briefs SET assumptions_confirmed_at = now(), assumptions_confirmed_by = auth.uid(), updated_at = now()
    WHERE artifact_version_id = _version_id;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (b.project_id, auth.uid(), 'brief.assumptions_confirmed', jsonb_build_object('version_id', _version_id));
END $$;

-- Alignment (internal, deterministic); defect order: orphaned, duplicate, no-parent, no-assessment; then position
CREATE OR REPLACE FUNCTION public.alignment_defects(_version_id uuid)
RETURNS TABLE(defect text, element_id uuid, code text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (SELECT * FROM public.arch_elements WHERE artifact_version_id = _version_id),
  m AS (SELECT mp.from_id, mp.to_id, ef.element_type AS ft, et.element_type AS tt
        FROM public.arch_mappings mp JOIN e ef ON ef.id = mp.from_id JOIN e et ON et.id = mp.to_id),
  co_ok AS (
    SELECT co.id FROM e co WHERE co.element_type = 'course_outcome' AND (
      EXISTS (SELECT 1 FROM m WHERE m.from_id = co.id AND m.tt = 'assessment')
      OR EXISTS (SELECT 1 FROM m m1 JOIN m m2 ON m2.from_id = m1.to_id AND m2.tt = 'assessment'
                 WHERE m1.from_id = co.id AND m1.tt = 'activity'))),
  norm AS (SELECT e.*, lower(regexp_replace(btrim(label_en), '\s+', ' ', 'g')) AS ne,
                       lower(regexp_replace(btrim(label_ar), '\s+', ' ', 'g')) AS na FROM e),
  d AS (
    SELECT 1 AS ord, 'orphaned_program_outcome' AS defect, e.id, e.code, e.position FROM e
      WHERE e.element_type = 'program_outcome' AND NOT EXISTS (SELECT 1 FROM m WHERE m.from_id = e.id AND m.tt IN ('course','course_outcome'))
    UNION ALL
    SELECT 2, 'duplicate_outcome', a.id, a.code, a.position FROM norm a
      WHERE a.element_type IN ('program_outcome','course_outcome') AND EXISTS (
        SELECT 1 FROM norm p WHERE p.element_type = a.element_type AND p.position < a.position
          AND (a.element_type = 'program_outcome' OR p.parent_id IS NOT DISTINCT FROM a.parent_id)
          AND ((a.ne <> '' AND p.ne = a.ne) OR (a.na <> '' AND p.na = a.na)))
    UNION ALL
    SELECT 3, 'course_outcome_without_parent', e.id, e.code, e.position FROM e
      WHERE e.element_type = 'course_outcome' AND NOT EXISTS (SELECT 1 FROM m WHERE m.to_id = e.id AND m.ft = 'program_outcome')
    UNION ALL
    SELECT 4, 'outcome_without_assessment', e.id, e.code, e.position FROM e
      WHERE (e.element_type = 'course_outcome' AND e.id NOT IN (SELECT id FROM co_ok))
         OR (e.element_type = 'program_outcome' AND NOT EXISTS (
              SELECT 1 FROM m WHERE m.from_id = e.id AND m.tt = 'course_outcome' AND m.to_id IN (SELECT id FROM co_ok))))
  SELECT defect, id, code FROM d ORDER BY ord, position
$$;

CREATE OR REPLACE FUNCTION public.check_architecture_alignment(_version_id uuid)
RETURNS TABLE(defect text, element_id uuid, code text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  SELECT project_id INTO pid FROM public.program_architectures WHERE artifact_version_id = _version_id;
  IF pid IS NULL OR NOT public.is_project_member(pid) THEN
    RAISE EXCEPTION 'Architecture not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT * FROM public.alignment_defects(_version_id);
END $$;

CREATE OR REPLACE FUNCTION public.render_architecture(_version_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(string_agg(
    e.element_type || ' ' || e.code || CASE WHEN p.id IS NOT NULL THEN ' (in ' || p.code || ')' ELSE '' END
    || E'\n  AR: ' || e.label_ar || E'\n  EN: ' || e.label_en
    || coalesce((SELECT E'\n  → ' || string_agg(t.code, ', ' ORDER BY t.position)
                 FROM public.arch_mappings mp JOIN public.arch_elements t ON t.id = mp.to_id WHERE mp.from_id = e.id), ''),
    E'\n' ORDER BY e.position), '(empty architecture)')
  FROM public.arch_elements e LEFT JOIN public.arch_elements p ON p.id = e.parent_id
  WHERE e.artifact_version_id = _version_id
$$;

CREATE OR REPLACE FUNCTION public.create_program_architecture(_brief_version_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.program_briefs%ROWTYPE; aid uuid; vid uuid; t text;
BEGIN
  SELECT * INTO b FROM public.program_briefs WHERE artifact_version_id = _brief_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(b.project_id);
  IF b.assumptions_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Confirm the brief assumptions before creating an architecture' USING ERRCODE = 'check_violation';
  END IF;
  t := coalesce(nullif(b.fields->'title'->>'en',''), b.fields->'title'->>'ar');
  PERFORM set_config('app.structured_write', 'on', true);
  aid := public.create_artifact(b.project_id, 'program_architecture', left('Architecture: ' || t, 200), '(empty architecture)');
  UPDATE public.artifacts SET structured = true WHERE id = aid;
  SELECT id INTO vid FROM public.artifact_versions WHERE artifact_id = aid;
  INSERT INTO public.program_architectures (artifact_version_id, project_id, artifact_id, brief_version_id)
    VALUES (vid, b.project_id, aid, _brief_version_id);
  PERFORM set_config('app.structured_write', 'off', true);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (b.project_id, auth.uid(), 'architecture.created', jsonb_build_object('artifact_id', aid, 'version_id', vid, 'brief_version_id', _brief_version_id));
  RETURN vid;
END $$;

-- Whole-document save. Elements reference each other by client keys; mappings must follow MAPPING rules.
CREATE OR REPLACE FUNCTION public.save_architecture(_version_id uuid, _elements jsonb, _mappings jsonb, _change_summary text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.program_architectures%ROWTYPE; nid uuid; el jsonb; mp jsonb; keymap jsonb := '{}'; typemap jsonb := '{}';
        i int := 0; t public.arch_element_type; pk text; new_id uuid; ft text; tt text;
BEGIN
  SELECT * INTO a FROM public.program_architectures WHERE artifact_version_id = _version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Architecture not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(a.project_id);
  IF jsonb_typeof(_elements) <> 'array' OR jsonb_typeof(coalesce(_mappings,'[]')) <> 'array' THEN
    RAISE EXCEPTION 'Elements and mappings must be arrays' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_array_length(_elements) > 1000 THEN RAISE EXCEPTION 'Too many elements' USING ERRCODE = 'check_violation'; END IF;

  PERFORM set_config('app.structured_write', 'on', true);
  nid := public.edit_artifact(_version_id, (SELECT content FROM public.artifact_versions WHERE id = _version_id), _change_summary);
  DELETE FROM public.arch_mappings WHERE artifact_version_id = nid;
  DELETE FROM public.arch_elements WHERE artifact_version_id = nid;

  FOR el IN SELECT * FROM jsonb_array_elements(_elements) LOOP
    i := i + 1;
    IF coalesce(el->>'key','') = '' OR keymap ? (el->>'key') THEN RAISE EXCEPTION 'Element keys must be unique' USING ERRCODE = 'check_violation'; END IF;
    t := (el->>'type')::public.arch_element_type;
    pk := nullif(el->>'parent_key','');
    IF t IN ('course_outcome','activity','assessment') THEN
      IF pk IS NULL OR typemap->>pk IS DISTINCT FROM 'course' THEN
        RAISE EXCEPTION 'Element % must belong to a course listed before it', el->>'key' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF pk IS NOT NULL THEN
      RAISE EXCEPTION 'Element % cannot have a parent', el->>'key' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.arch_elements (project_id, artifact_version_id, element_type, parent_id, code, label_ar, label_en, details, position)
      VALUES (a.project_id, nid, t, CASE WHEN pk IS NULL THEN NULL ELSE (keymap->>pk)::uuid END,
              btrim(coalesce(el->>'code','')), btrim(coalesce(el->>'label_ar','')), btrim(coalesce(el->>'label_en','')),
              coalesce(el->'details','{}'::jsonb), i)
      RETURNING id INTO new_id;
    keymap := keymap || jsonb_build_object(el->>'key', new_id::text);
    typemap := typemap || jsonb_build_object(el->>'key', t::text);
  END LOOP;

  FOR mp IN SELECT * FROM jsonb_array_elements(coalesce(_mappings,'[]')) LOOP
    ft := typemap->>(mp->>'from'); tt := typemap->>(mp->>'to');
    IF ft IS NULL OR tt IS NULL THEN RAISE EXCEPTION 'Mapping references an unknown element' USING ERRCODE = 'check_violation'; END IF;
    IF NOT (ft || '>' || tt = ANY(ARRAY['program_outcome>course','program_outcome>course_outcome','course_outcome>activity',
                                       'course_outcome>assessment','activity>assessment','source_evidence>program_outcome'])) THEN
      RAISE EXCEPTION 'Mapping % → % is not allowed', ft, tt USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.arch_mappings (project_id, artifact_version_id, from_id, to_id)
      VALUES (a.project_id, nid, (keymap->>(mp->>'from'))::uuid, (keymap->>(mp->>'to'))::uuid) ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.artifact_versions SET content = public.render_architecture(nid) WHERE id = nid;
  PERFORM set_config('app.structured_write', 'off', true);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (a.project_id, auth.uid(), 'architecture.saved', jsonb_build_object('version_id', nid, 'from_version_id', _version_id,
            'elements', jsonb_array_length(_elements), 'defects', (SELECT count(*) FROM public.alignment_defects(nid))));
  RETURN nid;
END $$;

-- Review gate: briefs need confirmed assumptions; architectures need a confirmed brief and zero alignment defects
CREATE OR REPLACE FUNCTION public.gate_structured_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.program_briefs%ROWTYPE; a public.program_architectures%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.program_briefs WHERE artifact_version_id = NEW.artifact_version_id;
  IF FOUND AND b.assumptions_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Confirm the brief assumptions before review' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO a FROM public.program_architectures WHERE artifact_version_id = NEW.artifact_version_id;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.program_briefs WHERE artifact_version_id = a.brief_version_id AND assumptions_confirmed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Confirm the brief assumptions before architecture review' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.arch_elements WHERE artifact_version_id = NEW.artifact_version_id) THEN
      RAISE EXCEPTION 'Add architecture elements before review (alignment incomplete)' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.alignment_defects(NEW.artifact_version_id)) THEN
      RAISE EXCEPTION 'Resolve alignment defects before review' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gate_structured_review BEFORE INSERT ON public.review_requests
  FOR EACH ROW EXECUTE FUNCTION public.gate_structured_review();

REVOKE ALL ON FUNCTION public.guard_snapshot_immutable(), public.guard_source_file_update(), public.guard_structured_rows(),
  public.guard_structured_version_write(), public.copy_structured_to_child(), public.gate_structured_review(),
  public.alignment_defects(uuid), public.render_architecture(uuid), public.brief_apply_manual(jsonb, jsonb),
  public.brief_set_value(jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_source_extraction(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_source_extraction(uuid, text, text, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.register_source_file(uuid, text, text, text, bigint),
  public.create_program_brief(uuid, public.intake_mode, public.program_category, jsonb, uuid, jsonb),
  public.update_program_brief(uuid, jsonb, public.program_category, text), public.confirm_brief_assumptions(uuid),
  public.check_architecture_alignment(uuid), public.create_program_architecture(uuid),
  public.save_architecture(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_source_file(uuid, text, text, text, bigint),
  public.create_program_brief(uuid, public.intake_mode, public.program_category, jsonb, uuid, jsonb),
  public.update_program_brief(uuid, jsonb, public.program_category, text), public.confirm_brief_assumptions(uuid),
  public.check_architecture_alignment(uuid), public.create_program_architecture(uuid),
  public.save_architecture(uuid, jsonb, jsonb, text) TO authenticated;