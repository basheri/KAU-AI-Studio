-- Test helpers: t_as(name) acts as a throwaway user; t_err/t_eq assert an error or a value.
CREATE OR REPLACE FUNCTION public.t_user(_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM auth.users WHERE email = 't-' || _name || '@kau.edu.sa' $$;
CREATE OR REPLACE FUNCTION public.t_as(_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', public.t_user(_name)::text, false);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', public.t_user(_name), 'email', 't-' || _name || '@kau.edu.sa')::text, false);
END $$;
CREATE OR REPLACE FUNCTION public.t_err(_sql text, _pattern text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'EXPECTED ERROR /%/ BUT SUCCEEDED: %', _pattern, _sql;
EXCEPTION WHEN raise_exception THEN RAISE;
  WHEN OTHERS THEN
    IF SQLERRM !~* _pattern THEN RAISE EXCEPTION 'WRONG ERROR for %: got "%" expected /%/', _sql, SQLERRM, _pattern; END IF;
    RETURN 'ok: ' || left(SQLERRM, 70);
END $$;
CREATE OR REPLACE FUNCTION public.t_eq(_got anyelement, _want anyelement, _what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF _got IS DISTINCT FROM _want THEN RAISE EXCEPTION 'FAIL %: got % want %', _what, _got, _want; END IF;
  RETURN 'ok: ' || _what;
END $$;
GRANT EXECUTE ON FUNCTION public.t_user(text), public.t_as(text), public.t_err(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.t_eq(anyelement, anyelement, text) TO authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
