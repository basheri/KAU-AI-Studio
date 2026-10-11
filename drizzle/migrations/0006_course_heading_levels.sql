DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.course_content_defects(uuid)'::regprocedure) INTO src;
  src := replace(src, 'lvl := length(substring(ln from ''^(#+)'')) + 1;', 'lvl := length(substring(ln from ''^(#+)''));');
  EXECUTE src;
END $$;
REVOKE ALL ON FUNCTION public.course_content_defects(uuid) FROM PUBLIC, anon, authenticated;