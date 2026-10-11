CREATE TYPE public.course_block_type AS ENUM ('rich_text','image','audio','video','embed','knowledge_check','scenario','rubric','glossary','references');

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image','audio','video')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  source_url text NOT NULL DEFAULT '' CHECK (source_url = '' OR source_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]<>"]*)?$'),
  rights_note text NOT NULL DEFAULT '' CHECK (length(rights_note) <= 2000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.course_contents (
  artifact_version_id uuid PRIMARY KEY REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  architecture_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  course_element_id uuid NOT NULL REFERENCES public.arch_elements(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  title_ar text NOT NULL DEFAULT '' CHECK (length(title_ar) <= 300),
  title_en text NOT NULL DEFAULT '' CHECK (length(title_en) <= 300),
  lang text CHECK (lang IN ('ar','en')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.course_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('module','lesson')),
  parent_id uuid REFERENCES public.course_nodes(id) ON DELETE CASCADE,
  position int NOT NULL,
  title_ar text NOT NULL DEFAULT '' CHECK (length(title_ar) <= 300),
  title_en text NOT NULL DEFAULT '' CHECK (length(title_en) <= 300),
  lang text CHECK (lang IN ('ar','en')),
  CHECK ((node_type = 'module') = (parent_id IS NULL))
);
CREATE INDEX course_nodes_version ON public.course_nodes(artifact_version_id);

CREATE TABLE public.content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_version_id uuid NOT NULL REFERENCES public.artifact_versions(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.course_nodes(id) ON DELETE CASCADE,
  position int NOT NULL,
  block_type public.course_block_type NOT NULL,
  lang text CHECK (lang IN ('ar','en')),
  payload jsonb NOT NULL
);
CREATE INDEX content_blocks_version ON public.content_blocks(artifact_version_id);

GRANT SELECT ON public.media_assets, public.course_contents, public.course_nodes, public.content_blocks TO authenticated;
GRANT ALL ON public.media_assets, public.course_contents, public.course_nodes, public.content_blocks TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read media assets" ON public.media_assets FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read course contents" ON public.course_contents FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read course nodes" ON public.course_nodes FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Members read content blocks" ON public.content_blocks FOR SELECT TO authenticated USING (public.is_project_member(project_id));

CREATE TRIGGER guard_course_content_rows BEFORE INSERT OR UPDATE OR DELETE ON public.course_contents FOR EACH ROW EXECUTE FUNCTION public.guard_structured_rows();
CREATE TRIGGER guard_course_node_rows BEFORE INSERT OR UPDATE OR DELETE ON public.course_nodes FOR EACH ROW EXECUTE FUNCTION public.guard_structured_rows();
CREATE TRIGGER guard_content_block_rows BEFORE INSERT OR UPDATE OR DELETE ON public.content_blocks FOR EACH ROW EXECUTE FUNCTION public.guard_structured_rows();

-- Interim platform default embed allowlist (pending institutional policy); mirrored in src/features/course/blocks.ts
CREATE OR REPLACE FUNCTION public.approved_embed_hosts() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['www.youtube-nocookie.com','www.youtube.com','player.vimeo.com']
$$;

CREATE OR REPLACE FUNCTION public.is_http_url(_u text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(_u, '') ~ '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]+)?(/[^[:space:]<>"]*)?$'
$$;

-- Strict payload schema per block type. Raises on any shape violation or unsafe content.
CREATE OR REPLACE FUNCTION public.validate_block_payload(_project_id uuid, _type public.course_block_type, _p jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE keys text[]; spec jsonb; k text; s text; el jsonb; lv jsonb; n int;
  bad text := 'Invalid ' || _type || ' payload';
BEGIN
  IF _p IS NULL OR jsonb_typeof(_p) <> 'object' THEN RAISE EXCEPTION '%: must be an object', bad USING ERRCODE = 'check_violation'; END IF;
  spec := CASE _type
    WHEN 'rich_text' THEN '{"text":"string"}'
    WHEN 'image' THEN '{"media_id":"media","alt":"string","caption":"string","decorative":"boolean"}'
    WHEN 'audio' THEN '{"media_id":"media","transcript":"string"}'
    WHEN 'video' THEN '{"media_id":"media","captions_url":"string","transcript":"string"}'
    WHEN 'embed' THEN '{"url":"string","title":"string"}'
    WHEN 'knowledge_check' THEN '{"question":"string","choices":"array","correct_index":"index","feedback_correct":"string","feedback_incorrect":"string","outcome_code":"string"}'
    WHEN 'scenario' THEN '{"prompt":"string","branches":"array"}'
    WHEN 'rubric' THEN '{"criteria":"array"}'
    WHEN 'glossary' THEN '{"terms":"array"}'
    WHEN 'references' THEN '{"items":"array"}' END::jsonb;
  SELECT array_agg(x ORDER BY x) INTO keys FROM jsonb_object_keys(_p) x;
  IF keys IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(spec) x) THEN
    RAISE EXCEPTION '%: expected fields %', bad, (SELECT string_agg(x, ', ') FROM jsonb_object_keys(spec) x) USING ERRCODE = 'check_violation';
  END IF;
  FOR k IN SELECT jsonb_object_keys(spec) LOOP
    CASE spec->>k
      WHEN 'string' THEN IF jsonb_typeof(_p->k) <> 'string' THEN RAISE EXCEPTION '%: % must be text', bad, k USING ERRCODE = 'check_violation'; END IF;
      WHEN 'boolean' THEN IF jsonb_typeof(_p->k) <> 'boolean' THEN RAISE EXCEPTION '%: % must be true/false', bad, k USING ERRCODE = 'check_violation'; END IF;
      WHEN 'array' THEN IF jsonb_typeof(_p->k) <> 'array' OR jsonb_array_length(_p->k) > 50 THEN RAISE EXCEPTION '%: % must be a list (max 50)', bad, k USING ERRCODE = 'check_violation'; END IF;
      WHEN 'index' THEN IF jsonb_typeof(_p->k) NOT IN ('null','number') THEN RAISE EXCEPTION '%: % must be a number or empty', bad, k USING ERRCODE = 'check_violation'; END IF;
      WHEN 'media' THEN
        IF jsonb_typeof(_p->k) = 'null' THEN NULL;
        ELSIF jsonb_typeof(_p->k) <> 'string' OR (_p->>k) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          OR NOT EXISTS (SELECT 1 FROM public.media_assets m WHERE m.id = (_p->>k)::uuid AND m.project_id = _project_id AND m.kind = _type::text) THEN
          RAISE EXCEPTION '%: media must be a % record of this project', bad, _type USING ERRCODE = 'check_violation';
        END IF;
    END CASE;
  END LOOP;
  -- Every text anywhere in the payload: bounded, and no HTML tags or script URLs
  FOR s IN SELECT v FROM jsonb_path_query(_p, 'strict $.**') j, LATERAL (SELECT j #>> '{}' AS v) t WHERE jsonb_typeof(j) = 'string' LOOP
    IF length(s) > 20000 THEN RAISE EXCEPTION '%: text too long', bad USING ERRCODE = 'check_violation'; END IF;
    IF s ~ '<[A-Za-z!/?]' OR s ~* 'javascript:|vbscript:|data:text/html' THEN
      RAISE EXCEPTION 'Content must not contain HTML or scripts' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF _type = 'embed' AND _p->>'url' <> '' AND (_p->>'url') !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(/[^[:space:]<>"]*)?$' THEN
    RAISE EXCEPTION 'Embed URL must be an https address' USING ERRCODE = 'check_violation';
  END IF;
  IF _type = 'video' AND _p->>'captions_url' <> '' AND (_p->>'captions_url') !~ '^https://' THEN
    RAISE EXCEPTION 'Captions URL must be an https address' USING ERRCODE = 'check_violation';
  END IF;
  IF _type = 'knowledge_check' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_p->'choices') c WHERE jsonb_typeof(c) <> 'string') THEN
      RAISE EXCEPTION '%: choices must be text', bad USING ERRCODE = 'check_violation'; END IF;
    n := jsonb_array_length(_p->'choices');
    IF jsonb_typeof(_p->'correct_index') = 'number' AND ((_p->>'correct_index') !~ '^[0-9]+$' OR (_p->>'correct_index')::int >= n) THEN
      RAISE EXCEPTION '%: correct answer must be one of the choices', bad USING ERRCODE = 'check_violation'; END IF;
  ELSIF _type = 'scenario' THEN
    FOR el IN SELECT * FROM jsonb_array_elements(_p->'branches') LOOP
      IF jsonb_typeof(el) <> 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(el) x) IS DISTINCT FROM ARRAY['choice','feedback']
         OR jsonb_typeof(el->'choice') <> 'string' OR jsonb_typeof(el->'feedback') <> 'string' THEN
        RAISE EXCEPTION '%: each branch needs choice and feedback text', bad USING ERRCODE = 'check_violation'; END IF;
    END LOOP;
  ELSIF _type = 'rubric' THEN
    FOR el IN SELECT * FROM jsonb_array_elements(_p->'criteria') LOOP
      IF jsonb_typeof(el) <> 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(el) x) IS DISTINCT FROM ARRAY['levels','name']
         OR jsonb_typeof(el->'name') <> 'string' OR jsonb_typeof(el->'levels') <> 'array' OR jsonb_array_length(el->'levels') > 10 THEN
        RAISE EXCEPTION '%: each criterion needs a name and levels', bad USING ERRCODE = 'check_violation'; END IF;
      FOR lv IN SELECT * FROM jsonb_array_elements(el->'levels') LOOP
        IF jsonb_typeof(lv) <> 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(lv) x) IS DISTINCT FROM ARRAY['description','label','points']
           OR jsonb_typeof(lv->'label') <> 'string' OR jsonb_typeof(lv->'description') <> 'string' OR jsonb_typeof(lv->'points') <> 'number' THEN
          RAISE EXCEPTION '%: each level needs label, numeric points and description', bad USING ERRCODE = 'check_violation'; END IF;
      END LOOP;
    END LOOP;
  ELSIF _type = 'glossary' THEN
    FOR el IN SELECT * FROM jsonb_array_elements(_p->'terms') LOOP
      IF jsonb_typeof(el) <> 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(el) x) IS DISTINCT FROM ARRAY['definition','term']
         OR jsonb_typeof(el->'term') <> 'string' OR jsonb_typeof(el->'definition') <> 'string' THEN
        RAISE EXCEPTION '%: each term needs term and definition text', bad USING ERRCODE = 'check_violation'; END IF;
    END LOOP;
  ELSIF _type = 'references' THEN
    FOR el IN SELECT * FROM jsonb_array_elements(_p->'items') LOOP
      IF jsonb_typeof(el) <> 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(el) x) IS DISTINCT FROM ARRAY['author','publisher','title','url','year']
         OR EXISTS (SELECT 1 FROM jsonb_each(el) e WHERE jsonb_typeof(e.value) <> 'string') THEN
        RAISE EXCEPTION '%: each reference needs author, title, year, publisher and url text', bad USING ERRCODE = 'check_violation'; END IF;
    END LOOP;
  END IF;
END $$;

-- Deterministic content validation; mirrored in src/features/course/tree.ts
CREATE OR REPLACE FUNCTION public.course_content_defects(_version_id uuid)
RETURNS TABLE(severity text, defect text, node_id uuid, block_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.course_contents%ROWTYPE; n public.course_nodes%ROWTYPE; b public.content_blocks%ROWTYPE;
  codes text[]; last int; lvl int; ln text; p jsonb; m public.media_assets%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.course_contents WHERE artifact_version_id = _version_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT array_agg(e.code) INTO codes FROM public.arch_elements e
    WHERE e.artifact_version_id = c.architecture_version_id
      AND (e.element_type = 'program_outcome' OR (e.element_type = 'course_outcome' AND e.parent_id = c.course_element_id));
  IF c.lang IS NULL THEN severity := 'critical'; defect := 'missing_language'; node_id := NULL; block_id := NULL; RETURN NEXT; END IF;
  IF (CASE c.lang WHEN 'ar' THEN btrim(c.title_ar) WHEN 'en' THEN btrim(c.title_en) ELSE btrim(c.title_ar || c.title_en) END) = '' THEN
    severity := 'critical'; defect := 'missing_title'; node_id := NULL; block_id := NULL; RETURN NEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.course_nodes WHERE artifact_version_id = _version_id AND node_type = 'lesson') THEN
    severity := 'critical'; defect := 'no_lessons'; node_id := NULL; block_id := NULL; RETURN NEXT; END IF;
  FOR n IN SELECT * FROM public.course_nodes WHERE artifact_version_id = _version_id
           ORDER BY (SELECT position FROM public.course_nodes p2 WHERE p2.id = coalesce(course_nodes.parent_id, course_nodes.id)), parent_id NULLS FIRST, position LOOP
    block_id := NULL; node_id := n.id;
    IF n.lang IS NULL THEN severity := 'critical'; defect := 'missing_language'; RETURN NEXT; END IF;
    IF (CASE n.lang WHEN 'ar' THEN btrim(n.title_ar) WHEN 'en' THEN btrim(n.title_en) ELSE btrim(n.title_ar || n.title_en) END) = '' THEN
      severity := 'critical'; defect := 'missing_title'; RETURN NEXT; END IF;
    IF n.node_type = 'lesson' THEN
      last := 2;
      FOR b IN SELECT * FROM public.content_blocks WHERE lesson_id = n.id ORDER BY position LOOP
        block_id := b.id; p := b.payload; severity := 'critical';
        IF b.lang IS NULL THEN defect := 'missing_language'; RETURN NEXT; END IF;
        IF (b.block_type = 'rich_text' AND btrim(p->>'text') = '')
          OR (b.block_type IN ('image','audio','video') AND jsonb_typeof(p->'media_id') = 'null')
          OR (b.block_type = 'embed' AND btrim(p->>'url') = '')
          OR (b.block_type = 'knowledge_check' AND (btrim(p->>'question') = '' OR (SELECT count(*) FROM jsonb_array_elements_text(p->'choices') x WHERE btrim(x) <> '') < 2))
          OR (b.block_type = 'scenario' AND (btrim(p->>'prompt') = '' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p->'branches') x WHERE btrim(x->>'choice') <> '')))
          OR (b.block_type = 'rubric' AND (jsonb_array_length(p->'criteria') = 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p->'criteria') x WHERE btrim(x->>'name') = '' OR jsonb_array_length(x->'levels') = 0)))
          OR (b.block_type = 'glossary' AND (jsonb_array_length(p->'terms') = 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p->'terms') x WHERE btrim(x->>'term') = '' OR btrim(x->>'definition') = '')))
          OR (b.block_type = 'references' AND (jsonb_array_length(p->'items') = 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p->'items') x WHERE btrim(x->>'title') = '' OR btrim(x->>'author') = '')))
        THEN defect := 'empty_payload'; RETURN NEXT; END IF;
        IF b.block_type = 'rich_text' THEN
          FOR ln IN SELECT regexp_split_to_table(p->>'text', E'\n') LOOP
            IF ln ~ '^#{1,6}\s' THEN
              lvl := length(substring(ln from '^(#+)')) + 1;
              IF lvl < 3 OR lvl > last + 1 THEN defect := 'invalid_heading_hierarchy'; RETURN NEXT; EXIT; END IF;
              last := lvl;
            END IF;
          END LOOP;
        ELSIF b.block_type = 'image' AND NOT (p->>'decorative')::boolean AND btrim(p->>'alt') = '' THEN
          defect := 'missing_alt_text'; RETURN NEXT;
        ELSIF b.block_type = 'audio' AND btrim(p->>'transcript') = '' THEN
          defect := 'missing_transcript'; RETURN NEXT;
        ELSIF b.block_type = 'video' AND btrim(p->>'captions_url') = '' AND btrim(p->>'transcript') = '' THEN
          defect := 'missing_captions'; RETURN NEXT;
        ELSIF b.block_type = 'embed' AND btrim(p->>'url') <> ''
          AND NOT (substring(p->>'url' from '^https://([^/:?#]+)') = ANY(public.approved_embed_hosts())) THEN
          defect := 'invalid_embed_domain'; RETURN NEXT;
        ELSIF b.block_type = 'knowledge_check' THEN
          IF jsonb_typeof(p->'correct_index') = 'null' THEN defect := 'kc_missing_answer'; RETURN NEXT; END IF;
          IF btrim(p->>'feedback_correct') = '' OR btrim(p->>'feedback_incorrect') = '' THEN defect := 'kc_missing_feedback'; RETURN NEXT; END IF;
          IF btrim(p->>'outcome_code') = '' OR NOT (btrim(p->>'outcome_code') = ANY(coalesce(codes, '{}'))) THEN defect := 'outcome_link_missing'; RETURN NEXT; END IF;
        ELSIF b.block_type = 'references' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p->'items') x WHERE btrim(x->>'url') <> '' AND NOT public.is_http_url(btrim(x->>'url'))) THEN
          defect := 'reference_url_invalid'; RETURN NEXT;
        END IF;
        IF b.block_type IN ('image','audio','video') AND jsonb_typeof(p->'media_id') = 'string' THEN
          SELECT * INTO m FROM public.media_assets WHERE id = (p->>'media_id')::uuid;
          IF FOUND AND (m.source_url = '' OR btrim(m.rights_note) = '') THEN severity := 'warning'; defect := 'media_metadata_incomplete'; RETURN NEXT; END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_course_content(_version_id uuid)
RETURNS TABLE(severity text, defect text, node_id uuid, block_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  SELECT project_id INTO pid FROM public.course_contents WHERE artifact_version_id = _version_id;
  IF pid IS NULL OR NOT public.is_project_member(pid) THEN RAISE EXCEPTION 'Course content not found' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN QUERY SELECT * FROM public.course_content_defects(_version_id);
END $$;

CREATE OR REPLACE FUNCTION public.render_course(_version_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT 'Course ' || course_code || ' [' || coalesce(lang,'-') || ']' || E'\n  AR: ' || title_ar || E'\n  EN: ' || title_en
                   FROM public.course_contents WHERE artifact_version_id = _version_id), '') || coalesce(E'\n' || string_agg(line, E'\n' ORDER BY o1, o2, o3), '')
  FROM (
    SELECT m.position o1, 0 o2, 0 o3, 'Module ' || m.position || ' [' || coalesce(m.lang,'-') || ']: ' || m.title_ar || ' / ' || m.title_en AS line
      FROM public.course_nodes m WHERE m.artifact_version_id = _version_id AND m.node_type = 'module'
    UNION ALL
    SELECT m.position, l.position, 0, '  Lesson ' || l.position || ' [' || coalesce(l.lang,'-') || ']: ' || l.title_ar || ' / ' || l.title_en
      FROM public.course_nodes l JOIN public.course_nodes m ON m.id = l.parent_id WHERE l.artifact_version_id = _version_id
    UNION ALL
    SELECT m.position, l.position, b.position, '    ' || b.block_type || ' [' || coalesce(b.lang,'-') || ']: ' || b.payload::text
      FROM public.content_blocks b JOIN public.course_nodes l ON l.id = b.lesson_id JOIN public.course_nodes m ON m.id = l.parent_id
      WHERE b.artifact_version_id = _version_id
  ) x
$$;

CREATE OR REPLACE FUNCTION public.register_media_asset(_project_id uuid, _kind text, _title text, _source_url text DEFAULT '', _rights_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mid uuid;
BEGIN
  PERFORM public.require_contributor(_project_id);
  INSERT INTO public.media_assets (project_id, kind, title, source_url, rights_note, created_by)
    VALUES (_project_id, _kind, btrim(coalesce(_title,'')), btrim(coalesce(_source_url,'')), btrim(coalesce(_rights_note,'')), auth.uid()) RETURNING id INTO mid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, auth.uid(), 'media_asset.registered', jsonb_build_object('media_id', mid, 'kind', _kind));
  RETURN mid;
END $$;

CREATE OR REPLACE FUNCTION public.create_course_content(_architecture_version_id uuid, _course_element_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.program_architectures%ROWTYPE; e public.arch_elements%ROWTYPE; aid uuid; vid uuid;
BEGIN
  SELECT * INTO a FROM public.program_architectures WHERE artifact_version_id = _architecture_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Architecture not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(a.project_id);
  SELECT * INTO e FROM public.arch_elements WHERE id = _course_element_id AND artifact_version_id = _architecture_version_id;
  IF NOT FOUND OR e.element_type <> 'course' THEN RAISE EXCEPTION 'The selected element is not a course of this architecture' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.alignment_defects(_architecture_version_id)) THEN
    RAISE EXCEPTION 'Resolve architecture alignment defects before authoring course content' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.course_contents cc WHERE cc.project_id = a.project_id AND cc.course_code = e.code
             AND EXISTS (SELECT 1 FROM public.artifact_versions v WHERE v.artifact_id = cc.artifact_id AND v.state <> 'archived')) THEN
    RAISE EXCEPTION 'Course % already has content; edit the existing course instead', e.code USING ERRCODE = 'unique_violation';
  END IF;
  PERFORM set_config('app.structured_write', 'on', true);
  aid := public.create_artifact(a.project_id, 'course_content', left('Course: ' || e.code || ' ' || coalesce(nullif(e.label_en,''), e.label_ar), 200), '');
  UPDATE public.artifacts SET structured = true WHERE id = aid;
  SELECT id INTO vid FROM public.artifact_versions WHERE artifact_id = aid;
  INSERT INTO public.course_contents (artifact_version_id, project_id, artifact_id, architecture_version_id, course_element_id, course_code, title_ar, title_en, lang)
    VALUES (vid, a.project_id, aid, _architecture_version_id, e.id, e.code, e.label_ar, e.label_en,
            CASE WHEN e.label_ar <> '' AND e.label_en = '' THEN 'ar' ELSE 'en' END);
  UPDATE public.artifact_versions SET content = public.render_course(vid) WHERE id = vid;
  PERFORM set_config('app.structured_write', 'off', true);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (a.project_id, auth.uid(), 'course_content.created', jsonb_build_object('artifact_id', aid, 'version_id', vid, 'course_code', e.code, 'architecture_version_id', _architecture_version_id));
  RETURN vid;
END $$;

-- Whole-tree save: {title_ar,title_en,lang,modules:[{title_ar,title_en,lang,lessons:[{...,blocks:[{type,lang,payload}]}]}]}
CREATE OR REPLACE FUNCTION public.save_course_content(_version_id uuid, _tree jsonb, _change_summary text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.course_contents%ROWTYPE; nid uuid; md jsonb; ls jsonb; bl jsonb; mi int := 0; li int; bi int;
  mid uuid; lid uuid; bt public.course_block_type; total int := 0;
BEGIN
  SELECT * INTO c FROM public.course_contents WHERE artifact_version_id = _version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course content not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.require_contributor(c.project_id);
  IF _tree IS NULL OR jsonb_typeof(_tree) <> 'object' OR jsonb_typeof(_tree->'modules') <> 'array' THEN
    RAISE EXCEPTION 'Course tree must be an object with modules' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(_tree->>'lang','') NOT IN ('','ar','en') THEN RAISE EXCEPTION 'Language must be ar or en' USING ERRCODE = 'check_violation'; END IF;
  PERFORM set_config('app.structured_write', 'on', true);
  nid := public.edit_artifact(_version_id, (SELECT content FROM public.artifact_versions WHERE id = _version_id), _change_summary);
  DELETE FROM public.content_blocks WHERE artifact_version_id = nid;
  DELETE FROM public.course_nodes WHERE artifact_version_id = nid AND node_type = 'lesson';
  DELETE FROM public.course_nodes WHERE artifact_version_id = nid;
  UPDATE public.course_contents SET title_ar = btrim(coalesce(_tree->>'title_ar','')), title_en = btrim(coalesce(_tree->>'title_en','')),
    lang = nullif(_tree->>'lang','') WHERE artifact_version_id = nid;
  FOR md IN SELECT * FROM jsonb_array_elements(_tree->'modules') LOOP
    mi := mi + 1;
    IF jsonb_typeof(md) <> 'object' OR jsonb_typeof(coalesce(md->'lessons','[]')) <> 'array' THEN RAISE EXCEPTION 'Each module needs a lessons list' USING ERRCODE = 'check_violation'; END IF;
    INSERT INTO public.course_nodes (project_id, artifact_version_id, node_type, parent_id, position, title_ar, title_en, lang)
      VALUES (c.project_id, nid, 'module', NULL, mi, btrim(coalesce(md->>'title_ar','')), btrim(coalesce(md->>'title_en','')), nullif(md->>'lang',''))
      RETURNING id INTO mid;
    li := 0;
    FOR ls IN SELECT * FROM jsonb_array_elements(coalesce(md->'lessons','[]')) LOOP
      li := li + 1;
      IF jsonb_typeof(ls) <> 'object' OR jsonb_typeof(coalesce(ls->'blocks','[]')) <> 'array' THEN RAISE EXCEPTION 'Each lesson needs a blocks list' USING ERRCODE = 'check_violation'; END IF;
      INSERT INTO public.course_nodes (project_id, artifact_version_id, node_type, parent_id, position, title_ar, title_en, lang)
        VALUES (c.project_id, nid, 'lesson', mid, li, btrim(coalesce(ls->>'title_ar','')), btrim(coalesce(ls->>'title_en','')), nullif(ls->>'lang',''))
        RETURNING id INTO lid;
      bi := 0;
      FOR bl IN SELECT * FROM jsonb_array_elements(coalesce(ls->'blocks','[]')) LOOP
        bi := bi + 1; total := total + 1;
        IF total > 2000 THEN RAISE EXCEPTION 'Too many blocks' USING ERRCODE = 'check_violation'; END IF;
        IF NOT (coalesce(bl->>'type','') = ANY(enum_range(NULL::public.course_block_type)::text[])) THEN
          RAISE EXCEPTION 'Unknown block type %', bl->>'type' USING ERRCODE = 'check_violation';
        END IF;
        bt := (bl->>'type')::public.course_block_type;
        IF coalesce(bl->>'lang','') NOT IN ('','ar','en') THEN RAISE EXCEPTION 'Language must be ar or en' USING ERRCODE = 'check_violation'; END IF;
        PERFORM public.validate_block_payload(c.project_id, bt, bl->'payload');
        INSERT INTO public.content_blocks (project_id, artifact_version_id, lesson_id, position, block_type, lang, payload)
          VALUES (c.project_id, nid, lid, bi, bt, nullif(bl->>'lang',''), bl->'payload');
      END LOOP;
    END LOOP;
  END LOOP;
  UPDATE public.artifact_versions SET content = public.render_course(nid) WHERE id = nid;
  PERFORM set_config('app.structured_write', 'off', true);
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (c.project_id, auth.uid(), 'course_content.saved', jsonb_build_object('version_id', nid, 'from_version_id', _version_id,
      'blocks', total, 'critical_defects', (SELECT count(*) FROM public.course_content_defects(nid) d WHERE d.severity = 'critical')));
  RETURN nid;
END $$;

-- Child versions inherit structured content (brief, architecture, course tree) with new ids
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

  INSERT INTO public.course_contents (artifact_version_id, project_id, artifact_id, architecture_version_id, course_element_id, course_code, title_ar, title_en, lang)
    SELECT NEW.id, project_id, artifact_id, architecture_version_id, course_element_id, course_code, title_ar, title_en, lang
    FROM public.course_contents WHERE artifact_version_id = NEW.parent_version_id;
  SELECT coalesce(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb) INTO idmap
    FROM public.course_nodes WHERE artifact_version_id = NEW.parent_version_id;
  INSERT INTO public.course_nodes (id, project_id, artifact_version_id, node_type, parent_id, position, title_ar, title_en, lang)
    SELECT (idmap->>id::text)::uuid, project_id, NEW.id, node_type, NULL, position, title_ar, title_en, lang
    FROM public.course_nodes WHERE artifact_version_id = NEW.parent_version_id AND node_type = 'module';
  INSERT INTO public.course_nodes (id, project_id, artifact_version_id, node_type, parent_id, position, title_ar, title_en, lang)
    SELECT (idmap->>id::text)::uuid, project_id, NEW.id, node_type, (idmap->>parent_id::text)::uuid, position, title_ar, title_en, lang
    FROM public.course_nodes WHERE artifact_version_id = NEW.parent_version_id AND node_type = 'lesson';
  INSERT INTO public.content_blocks (project_id, artifact_version_id, lesson_id, position, block_type, lang, payload)
    SELECT project_id, NEW.id, (idmap->>lesson_id::text)::uuid, position, block_type, lang, payload
    FROM public.content_blocks WHERE artifact_version_id = NEW.parent_version_id;
  RETURN NEW;
END $$;

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
  IF EXISTS (SELECT 1 FROM public.course_contents WHERE artifact_version_id = NEW.artifact_version_id)
     AND EXISTS (SELECT 1 FROM public.course_content_defects(NEW.artifact_version_id) d WHERE d.severity = 'critical') THEN
    RAISE EXCEPTION 'Resolve critical content validation defects before review' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.validate_block_payload(uuid, public.course_block_type, jsonb), public.course_content_defects(uuid),
  public.render_course(uuid), public.copy_structured_to_child(), public.gate_structured_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_media_asset(uuid, text, text, text, text), public.create_course_content(uuid, uuid),
  public.save_course_content(uuid, jsonb, text), public.check_course_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_media_asset(uuid, text, text, text, text), public.create_course_content(uuid, uuid),
  public.save_course_content(uuid, jsonb, text), public.check_course_content(uuid) TO authenticated;
