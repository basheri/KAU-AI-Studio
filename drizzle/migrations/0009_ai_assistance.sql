-- AI assistance (drafting, extraction, translation) under human control.
--  * Every AI call is logged in ai_requests by the server (service role) and audited.
--  * AI never decides: briefs carry AI provenance until a person accepts each field, and review is
--    blocked while AI-drafted or AI-translated brief text is unaccepted or course references are unverified.
--  * The institutional glossary is readable by every signed-in user and maintained by platform admins.

-- ===== Usage log =====
CREATE TABLE public.ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  feature text NOT NULL CHECK (feature ~ '^[a-z_]{1,60}$'),
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded','failed','refused','limited')),
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  target_ref text CHECK (target_ref IS NULL OR length(target_ref) <= 200),
  error text CHECK (error IS NULL OR length(error) <= 500),
  outcome text CHECK (outcome IS NULL OR outcome IN ('accepted','edited','discarded')),
  outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_requests_project ON public.ai_requests(project_id);
CREATE INDEX ai_requests_user_day ON public.ai_requests(user_id, created_at);
GRANT SELECT ON public.ai_requests TO authenticated;
GRANT ALL ON public.ai_requests TO service_role;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and admins read AI usage" ON public.ai_requests FOR SELECT TO authenticated
  USING ((project_id IS NOT NULL AND public.is_project_member(project_id)) OR user_id = auth.uid() OR public.is_platform_admin());

-- Only the outcome of a request may change, once, by the person who made it.
CREATE OR REPLACE FUNCTION public.guard_ai_request() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['outcome','outcome_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['outcome','outcome_at']) THEN
    RAISE EXCEPTION 'AI request records are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.outcome IS NOT NULL AND NEW.outcome IS DISTINCT FROM OLD.outcome THEN
    RAISE EXCEPTION 'The outcome is already recorded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_requests_guard BEFORE UPDATE ON public.ai_requests FOR EACH ROW EXECUTE FUNCTION public.guard_ai_request();

-- Server only: authorise the caller for AI work in a project (contributors only) and count today's use.
CREATE OR REPLACE FUNCTION public.ai_authorize(_project_id uuid, _actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.project_role;
BEGIN
  SELECT m.role INTO r FROM public.project_members m WHERE m.project_id = _project_id AND m.user_id = _actor;
  IF r IS NULL THEN RAISE EXCEPTION 'Not a project member' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF r = 'observer' THEN RAISE EXCEPTION 'Observers cannot use AI drafting' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN jsonb_build_object('role', r, 'used_today',
    (SELECT count(*) FROM public.ai_requests a WHERE a.user_id = _actor AND a.created_at >= date_trunc('day', now())
       AND a.status <> 'limited'));
END $$;

CREATE OR REPLACE FUNCTION public.record_ai_request(_project_id uuid, _actor uuid, _feature text, _provider text, _model text,
  _status text, _input_tokens int, _output_tokens int, _target_ref text, _error text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid;
BEGIN
  INSERT INTO public.ai_requests (project_id, user_id, feature, provider, model, status, input_tokens, output_tokens, target_ref, error)
    VALUES (_project_id, _actor, _feature, _provider, _model, _status, greatest(coalesce(_input_tokens, 0), 0),
            greatest(coalesce(_output_tokens, 0), 0), left(_target_ref, 200), left(_error, 500))
    RETURNING id INTO rid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, _actor, 'ai.request', jsonb_build_object('request_id', rid, 'feature', _feature, 'status', _status, 'model', _model));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.record_ai_outcome(_request_id uuid, _outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _outcome NOT IN ('accepted','edited','discarded') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.ai_requests SET outcome = _outcome, outcome_at = now()
    WHERE id = _request_id AND user_id = auth.uid() AND outcome IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI request not found or already decided' USING ERRCODE = 'no_data_found'; END IF;
END $$;

-- ===== Institutional glossary =====
CREATE TABLE public.glossary_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_ar text NOT NULL CHECK (length(btrim(term_ar)) BETWEEN 1 AND 200),
  term_en text NOT NULL CHECK (length(btrim(term_en)) BETWEEN 1 AND 200),
  domain text NOT NULL DEFAULT '' CHECK (length(domain) <= 100),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX glossary_terms_en ON public.glossary_terms(lower(btrim(term_en)));
GRANT SELECT ON public.glossary_terms TO authenticated;
GRANT ALL ON public.glossary_terms TO service_role;
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read the glossary" ON public.glossary_terms FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.save_glossary_term(_id uuid, _term_ar text, _term_en text, _domain text DEFAULT '', _note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.glossary_terms (term_ar, term_en, domain, note, updated_by)
      VALUES (btrim(_term_ar), btrim(_term_en), btrim(coalesce(_domain, '')), btrim(coalesce(_note, '')), auth.uid()) RETURNING id INTO gid;
  ELSE
    UPDATE public.glossary_terms SET term_ar = btrim(_term_ar), term_en = btrim(_term_en), domain = btrim(coalesce(_domain, '')),
      note = btrim(coalesce(_note, '')), updated_by = auth.uid(), updated_at = now() WHERE id = _id RETURNING id INTO gid;
    IF gid IS NULL THEN RAISE EXCEPTION 'Term not found' USING ERRCODE = 'no_data_found'; END IF;
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (NULL, auth.uid(), 'admin.glossary.saved', jsonb_build_object('term_id', gid, 'term_en', btrim(_term_en)));
  RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.delete_glossary_term(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM public.glossary_terms WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Term not found' USING ERRCODE = 'no_data_found'; END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (NULL, auth.uid(), 'admin.glossary.deleted', jsonb_build_object('term_id', _id));
END $$;

-- ===== Brief provenance: AI drafts, AI translations, acceptance =====
-- Field shape gains optional per-language provenance: {ar, en, provenance, source_ref, ar_prov?, en_prov?}.
-- provenance 'AI_draft' -> 'AI_accepted'; <lang>_prov 'AI_translation' -> 'AI_translation_accepted'.
-- A manual change to one language keeps the other language's provenance.
CREATE OR REPLACE FUNCTION public.brief_apply_manual(_current jsonb, _input jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; cur jsonb; inp jsonb; ar text; en text; out jsonb := _current; nf jsonb;
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
      nf := jsonb_build_object('ar', ar, 'en', en,
        'provenance', CASE WHEN ar = '' AND en = '' THEN NULL ELSE 'manual' END, 'source_ref', NULL);
      IF ar <> '' AND ar = coalesce(cur->>'ar','') AND cur ? 'ar_prov' THEN nf := nf || jsonb_build_object('ar_prov', cur->'ar_prov'); END IF;
      IF en <> '' AND en = coalesce(cur->>'en','') AND cur ? 'en_prov' THEN nf := nf || jsonb_build_object('en_prov', cur->'en_prov'); END IF;
      out := jsonb_set(out, ARRAY[k], nf);
    END IF;
  END LOOP;
  RETURN out;
END $$;

-- Which brief fields still hold unaccepted AI text (internal; mirrored in src/features/ai/gate.ts)
CREATE OR REPLACE FUNCTION public.brief_ai_pending(_fields jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(k ORDER BY ord), '{}') FROM unnest(public.brief_field_keys()) WITH ORDINALITY AS t(k, ord)
  WHERE _fields->k->>'provenance' = 'AI_draft' OR _fields->k->>'ar_prov' = 'AI_translation' OR _fields->k->>'en_prov' = 'AI_translation'
$$;

-- Server only: write AI output into a draft brief for a contributing member. Never overwrites text a person wrote:
-- 'draft' fills empty fields; 'translate' fills only the empty language of a field that has the other language.
CREATE OR REPLACE FUNCTION public.record_ai_brief_output(_version_id uuid, _actor uuid, _request_id uuid, _mode text, _fields jsonb)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.program_briefs%ROWTYPE; st public.artifact_state; r public.project_role; k text; f jsonb; cur jsonb; v jsonb;
  ar text; en text; changed text[] := '{}';
BEGIN
  IF _mode NOT IN ('draft','translate') THEN RAISE EXCEPTION 'Invalid mode' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO b FROM public.program_briefs WHERE artifact_version_id = _version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE = 'no_data_found'; END IF;
  SELECT m.role INTO r FROM public.project_members m WHERE m.project_id = b.project_id AND m.user_id = _actor;
  IF r IS NULL OR r = 'observer' THEN RAISE EXCEPTION 'Not a contributing member' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT state INTO st FROM public.artifact_versions WHERE id = _version_id;
  IF st <> 'draft' THEN RAISE EXCEPTION 'Only draft briefs can receive AI text' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_requests a WHERE a.id = _request_id AND a.user_id = _actor AND a.status = 'succeeded') THEN
    RAISE EXCEPTION 'Unknown AI request' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(_fields) <> 'object' THEN RAISE EXCEPTION 'Fields must be an object' USING ERRCODE = 'check_violation'; END IF;
  f := b.fields;
  FOR k IN SELECT jsonb_object_keys(_fields) LOOP
    CONTINUE WHEN NOT (k = ANY(public.brief_field_keys())) OR k = 'category';
    cur := f -> k; v := _fields -> k;
    ar := left(btrim(coalesce(v->>'ar', '')), 10000); en := left(btrim(coalesce(v->>'en', '')), 10000);
    IF _mode = 'draft' THEN
      CONTINUE WHEN coalesce(cur->>'ar','') <> '' OR coalesce(cur->>'en','') <> '' OR (ar = '' AND en = '');
      f := jsonb_set(f, ARRAY[k], jsonb_build_object('ar', ar, 'en', en, 'provenance', 'AI_draft', 'source_ref', 'ai_request:' || _request_id));
      changed := changed || k;
    ELSE
      IF coalesce(cur->>'ar','') = '' AND coalesce(cur->>'en','') <> '' AND ar <> '' THEN
        f := jsonb_set(f, ARRAY[k], cur || jsonb_build_object('ar', ar, 'ar_prov', 'AI_translation'));
        changed := changed || k;
      ELSIF coalesce(cur->>'en','') = '' AND coalesce(cur->>'ar','') <> '' AND en <> '' THEN
        f := jsonb_set(f, ARRAY[k], cur || jsonb_build_object('en', en, 'en_prov', 'AI_translation'));
        changed := changed || k;
      END IF;
    END IF;
  END LOOP;
  IF cardinality(changed) > 0 THEN
    PERFORM set_config('app.structured_write', 'on', true);
    UPDATE public.program_briefs SET fields = f, updated_at = now(),
      assumptions_confirmed_at = CASE WHEN 'assumptions' = ANY(changed) THEN NULL ELSE assumptions_confirmed_at END,
      assumptions_confirmed_by = CASE WHEN 'assumptions' = ANY(changed) THEN NULL ELSE assumptions_confirmed_by END
      WHERE artifact_version_id = _version_id;
    UPDATE public.artifact_versions SET content = public.render_brief(f, b.category, b.intake_mode) WHERE id = _version_id;
    PERFORM set_config('app.structured_write', 'off', true);
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (b.project_id, _actor, 'brief.ai_' || _mode, jsonb_build_object('version_id', _version_id, 'request_id', _request_id, 'fields', to_jsonb(changed)));
  RETURN changed;
END $$;

-- A person accepts AI text in one field (both the draft and any AI translation in it).
CREATE OR REPLACE FUNCTION public.accept_ai_brief_field(_version_id uuid, _key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.program_briefs%ROWTYPE; cur jsonb; st public.artifact_state;
BEGIN
  SELECT * INTO b FROM public.program_briefs WHERE artifact_version_id = _version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(b.project_id);
  SELECT state INTO st FROM public.artifact_versions WHERE id = _version_id;
  IF st <> 'draft' THEN RAISE EXCEPTION 'Only draft briefs can be changed' USING ERRCODE = 'check_violation'; END IF;
  cur := b.fields -> _key;
  IF cur IS NULL OR NOT (_key = ANY(public.brief_ai_pending(b.fields))) THEN
    RAISE EXCEPTION 'This field has no AI text to accept' USING ERRCODE = 'check_violation';
  END IF;
  IF cur->>'provenance' = 'AI_draft' THEN cur := cur || jsonb_build_object('provenance', 'AI_accepted'); END IF;
  IF cur->>'ar_prov' = 'AI_translation' THEN cur := cur || jsonb_build_object('ar_prov', 'AI_translation_accepted'); END IF;
  IF cur->>'en_prov' = 'AI_translation' THEN cur := cur || jsonb_build_object('en_prov', 'AI_translation_accepted'); END IF;
  PERFORM set_config('app.structured_write', 'on', true);
  UPDATE public.program_briefs SET fields = jsonb_set(fields, ARRAY[_key], cur), updated_at = now() WHERE artifact_version_id = _version_id;
  UPDATE public.artifact_versions SET content = public.render_brief(jsonb_set(b.fields, ARRAY[_key], cur), b.category, b.intake_mode) WHERE id = _version_id;
  PERFORM set_config('app.structured_write', 'off', true);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (b.project_id, auth.uid(), 'brief.ai_accepted', jsonb_build_object('version_id', _version_id, 'field', _key));
END $$;

-- ===== AI-assisted document extraction =====
ALTER TABLE public.source_files ADD COLUMN extraction_method text NOT NULL DEFAULT 'deterministic'
  CHECK (extraction_method IN ('deterministic','ai'));
ALTER TABLE public.source_files ADD COLUMN extraction_request_id uuid REFERENCES public.ai_requests(id) ON DELETE SET NULL;

DROP FUNCTION public.record_source_extraction(uuid, text, text, jsonb, text);
CREATE OR REPLACE FUNCTION public.record_source_extraction(_file_id uuid, _status text, _text text, _fields jsonb, _error text,
  _method text DEFAULT 'deterministic', _request_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF _status NOT IN ('succeeded','failed','unsupported') THEN RAISE EXCEPTION 'Invalid extraction status' USING ERRCODE = 'check_violation'; END IF;
  IF _method NOT IN ('deterministic','ai') THEN RAISE EXCEPTION 'Invalid extraction method' USING ERRCODE = 'check_violation'; END IF;
  IF _method = 'ai' AND _request_id IS NULL THEN RAISE EXCEPTION 'AI extraction needs its request record' USING ERRCODE = 'check_violation'; END IF;
  IF _status = 'succeeded' AND (jsonb_typeof(coalesce(_fields,'{}')) <> 'object' OR coalesce(_fields,'{}') = '{}'::jsonb) THEN
    RAISE EXCEPTION 'A successful extraction must contain fields' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.source_files SET extraction_status = _status, extracted_text = left(_text, 200000),
    extracted_fields = CASE WHEN _status = 'succeeded' THEN _fields ELSE '{}'::jsonb END,
    extraction_error = _error, extracted_at = now(), extraction_method = _method, extraction_request_id = _request_id
    WHERE id = _file_id RETURNING project_id INTO pid;
  IF pid IS NULL THEN RAISE EXCEPTION 'Source file not found' USING ERRCODE = 'no_data_found'; END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (pid, NULL, 'source_file.extracted', jsonb_build_object('file_id', _file_id, 'status', _status, 'method', _method));
END $$;

-- Fields read by AI from an uploaded proposal are AI drafts (with the page they came from), not "extracted".
CREATE OR REPLACE FUNCTION public.create_program_brief(_project_id uuid, _mode public.intake_mode, _category public.program_category,
  _fields jsonb DEFAULT '{}'::jsonb, _source_file_id uuid DEFAULT NULL, _snapshot jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f jsonb := public.brief_blank(); sf public.source_files%ROWTYPE; snap_id uuid; k text; aid uuid; vid uuid; title text;
  prov text; ref text;
BEGIN
  PERFORM public.require_contributor(_project_id);
  IF _mode = 'document_upload' THEN
    IF _source_file_id IS NULL THEN RAISE EXCEPTION 'An uploaded proposal is required' USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO sf FROM public.source_files WHERE id = _source_file_id AND project_id = _project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source file does not belong to this project' USING ERRCODE = 'check_violation'; END IF;
    IF sf.extraction_status = 'succeeded' THEN
      prov := CASE WHEN sf.extraction_method = 'ai' THEN 'AI_draft' ELSE 'extracted' END;
      FOR k IN SELECT jsonb_object_keys(sf.extracted_fields) LOOP
        ref := 'source_file:' || sf.id || coalesce('#p' || nullif(sf.extracted_fields->'_pages'->>k, ''), '');
        f := public.brief_set_value(f, k, sf.extracted_fields->>k, prov, ref);
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

-- ===== Course specification (stored on the architecture's course element: details.spec) =====
-- Mirrored in src/features/architecture/spec.ts. Text is rendered as React text only.
CREATE OR REPLACE FUNCTION public.course_spec_problem(_spec jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; x jsonb;
  text_keys text[] := ARRAY['description_ar','description_en','prerequisites_ar','prerequisites_en','teaching_ar','teaching_en'];
  list_keys text[] := ARRAY['objectives','topics','references'];
BEGIN
  IF _spec IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(_spec) <> 'object' THEN RETURN 'Course specification must be an object'; END IF;
  FOR k IN SELECT jsonb_object_keys(_spec) LOOP
    IF NOT (k = ANY(text_keys || list_keys || ARRAY['credit_hours'])) THEN RETURN 'Unknown course specification field ' || k; END IF;
  END LOOP;
  FOREACH k IN ARRAY text_keys LOOP
    IF _spec ? k AND (jsonb_typeof(_spec->k) <> 'string' OR length(_spec->>k) > 5000) THEN RETURN 'Invalid ' || k; END IF;
  END LOOP;
  IF _spec ? 'credit_hours' AND NOT (jsonb_typeof(_spec->'credit_hours') = 'number'
       AND (_spec->>'credit_hours')::numeric BETWEEN 0 AND 30) THEN
    RETURN 'Credit hours must be a number from 0 to 30';
  END IF;
  FOREACH k IN ARRAY list_keys LOOP
    IF _spec ? k AND (jsonb_typeof(_spec->k) <> 'array' OR jsonb_array_length(_spec->k) > 60) THEN RETURN 'Invalid ' || k; END IF;
  END LOOP;
  FOR x IN SELECT jsonb_array_elements(coalesce(_spec->'objectives','[]')) LOOP
    IF jsonb_typeof(x) <> 'object' OR coalesce(jsonb_typeof(x->'ar'),'string') <> 'string' OR coalesce(jsonb_typeof(x->'en'),'string') <> 'string'
       OR length(coalesce(x->>'ar','') || coalesce(x->>'en','')) > 2000 THEN RETURN 'Invalid objective'; END IF;
  END LOOP;
  FOR x IN SELECT jsonb_array_elements(coalesce(_spec->'topics','[]')) LOOP
    IF jsonb_typeof(x) <> 'object' OR coalesce(jsonb_typeof(x->'ar'),'string') <> 'string' OR coalesce(jsonb_typeof(x->'en'),'string') <> 'string'
       OR length(coalesce(x->>'ar','') || coalesce(x->>'en','')) > 2000
       OR (x ? 'weeks' AND NOT (jsonb_typeof(x->'weeks') = 'number' AND (x->>'weeks')::numeric BETWEEN 0 AND 30))
       OR (x ? 'outcomes' AND jsonb_typeof(x->'outcomes') <> 'array') THEN RETURN 'Invalid topic'; END IF;
  END LOOP;
  FOR x IN SELECT jsonb_array_elements(coalesce(_spec->'references','[]')) LOOP
    IF jsonb_typeof(x) <> 'object' OR jsonb_typeof(x->'citation') <> 'string' OR length(btrim(x->>'citation')) NOT BETWEEN 1 AND 1000
       OR jsonb_typeof(x->'verified') <> 'boolean' THEN RETURN 'Invalid reference'; END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.guard_course_spec() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p text;
BEGIN
  IF NEW.details ? 'spec' THEN
    IF NEW.element_type <> 'course' THEN
      RAISE EXCEPTION 'Only courses have a course specification' USING ERRCODE = 'check_violation';
    END IF;
    p := public.course_spec_problem(NEW.details->'spec');
    IF p IS NOT NULL THEN RAISE EXCEPTION '%', p USING ERRCODE = 'check_violation'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arch_elements_course_spec BEFORE INSERT OR UPDATE ON public.arch_elements
  FOR EACH ROW EXECUTE FUNCTION public.guard_course_spec();

-- ===== Review gate for AI text and unverified references =====
CREATE OR REPLACE FUNCTION public.gate_ai_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pending text[];
BEGIN
  SELECT public.brief_ai_pending(b.fields) INTO pending FROM public.program_briefs b WHERE b.artifact_version_id = NEW.artifact_version_id;
  IF cardinality(pending) > 0 THEN
    RAISE EXCEPTION 'Review and accept the AI-drafted brief fields before review: %', array_to_string(pending, ', ') USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.arch_elements e, jsonb_array_elements(coalesce(e.details->'spec'->'references','[]')) r
             WHERE e.artifact_version_id = NEW.artifact_version_id AND e.element_type = 'course' AND (r->>'verified')::boolean IS NOT TRUE) THEN
    RAISE EXCEPTION 'Verify every course reference before review' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_requests_ai_gate BEFORE INSERT ON public.review_requests
  FOR EACH ROW EXECUTE FUNCTION public.gate_ai_review();

-- ===== Grants =====
REVOKE ALL ON FUNCTION public.guard_ai_request(), public.guard_course_spec(), public.gate_ai_review(),
  public.brief_ai_pending(jsonb), public.course_spec_problem(jsonb), public.brief_apply_manual(jsonb, jsonb),
  public.ai_authorize(uuid, uuid), public.record_ai_request(uuid, uuid, text, text, text, text, int, int, text, text),
  public.record_ai_brief_output(uuid, uuid, uuid, text, jsonb),
  public.record_source_extraction(uuid, text, text, jsonb, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_authorize(uuid, uuid), public.record_ai_request(uuid, uuid, text, text, text, text, int, int, text, text),
  public.record_ai_brief_output(uuid, uuid, uuid, text, jsonb),
  public.record_source_extraction(uuid, text, text, jsonb, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_ai_outcome(uuid, text), public.save_glossary_term(uuid, text, text, text, text),
  public.delete_glossary_term(uuid), public.accept_ai_brief_field(uuid, text),
  public.create_program_brief(uuid, public.intake_mode, public.program_category, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ai_outcome(uuid, text), public.save_glossary_term(uuid, text, text, text, text),
  public.delete_glossary_term(uuid), public.accept_ai_brief_field(uuid, text),
  public.create_program_brief(uuid, public.intake_mode, public.program_category, jsonb, uuid, jsonb) TO authenticated, service_role;
