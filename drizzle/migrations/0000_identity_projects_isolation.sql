-- ===== Types =====
CREATE TYPE public.project_role AS ENUM (
  'system_administrator','program_owner','subject_matter_expert','instructional_designer',
  'compliance_reviewer','media_reviewer','observer');
CREATE TYPE public.invitation_status AS ENUM ('pending','accepted','declined','revoked');

-- ===== KAU domain helper =====
CREATE OR REPLACE FUNCTION public.normalize_kau_email(_email text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE e text := lower(btrim(coalesce(_email, '')));
BEGIN
  IF e ~ '^[a-z0-9._%+''-]+@kau\.edu\.sa$' THEN RETURN e; END IF;
  RETURN NULL;
END $$;

-- ===== Profiles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_kau_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.normalize_kau_email(NEW.email) IS NULL THEN
    RAISE EXCEPTION 'Only @kau.edu.sa accounts are allowed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_kau_signup BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_kau_signup();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, lower(NEW.email)) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Platform admins (protected: only service_role can write) =====
CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$;

-- ===== Projects =====
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.project_role NOT NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON public.project_members(user_id);
CREATE TABLE public.project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (public.normalize_kau_email(email) = email),
  role public.project_role NOT NULL,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE UNIQUE INDEX project_invitations_pending_uq ON public.project_invitations(project_id, email) WHERE status = 'pending';
CREATE INDEX project_invitations_email_idx ON public.project_invitations(email);
CREATE TABLE public.project_settings (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  default_locale text NOT NULL DEFAULT 'ar' CHECK (default_locale IN ('ar','en')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_files_project_idx ON public.project_files(project_id);
CREATE TABLE public.project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  author_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_comments_project_idx ON public.project_comments(project_id);
CREATE TABLE public.project_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  export_format text NOT NULL,
  file_name text,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_exports_project_idx ON public.project_exports(project_id);
CREATE TABLE public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_project_idx ON public.audit_events(project_id);

-- Grants (no direct INSERT on projects/members/invitations/audit: RPC only)
GRANT SELECT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, DELETE ON public.project_members TO authenticated;
GRANT SELECT ON public.project_invitations TO authenticated;
GRANT SELECT, UPDATE ON public.project_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.project_files TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.project_comments TO authenticated;
GRANT SELECT, INSERT ON public.project_exports TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.projects, public.project_members, public.project_invitations, public.project_settings,
  public.project_files, public.project_comments, public.project_exports, public.audit_events TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- ===== Membership helpers (security definer avoids RLS recursion) =====
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.has_project_role(_project_id uuid, _roles public.project_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members
                 WHERE project_id = _project_id AND user_id = auth.uid() AND role = ANY(_roles))
$$;

-- ===== Policies =====
CREATE POLICY "Members read project" ON public.projects FOR SELECT TO authenticated USING (public.is_project_member(id));
CREATE POLICY "Owners update project" ON public.projects FOR UPDATE TO authenticated
  USING (public.has_project_role(id, ARRAY['program_owner']::public.project_role[]))
  WITH CHECK (public.has_project_role(id, ARRAY['program_owner']::public.project_role[]));
CREATE POLICY "Owners delete project" ON public.projects FOR DELETE TO authenticated
  USING (public.has_project_role(id, ARRAY['program_owner']::public.project_role[]));

CREATE POLICY "Members read members" ON public.project_members FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Owners remove non-owners" ON public.project_members FOR DELETE TO authenticated
  USING (role <> 'program_owner' AND public.has_project_role(project_id, ARRAY['program_owner']::public.project_role[]));

CREATE POLICY "Owners read invitations" ON public.project_invitations FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, ARRAY['program_owner']::public.project_role[]));

CREATE POLICY "Members read settings" ON public.project_settings FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Owners update settings" ON public.project_settings FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, ARRAY['program_owner']::public.project_role[]))
  WITH CHECK (public.has_project_role(project_id, ARRAY['program_owner']::public.project_role[]));

CREATE POLICY "Members read files" ON public.project_files FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Contributors add files" ON public.project_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.is_project_member(project_id)
              AND NOT public.has_project_role(project_id, ARRAY['observer']::public.project_role[]));
CREATE POLICY "Uploader or owner deletes file" ON public.project_files FOR DELETE TO authenticated
  USING (public.is_project_member(project_id) AND (uploaded_by = auth.uid()
         OR public.has_project_role(project_id, ARRAY['program_owner']::public.project_role[])));

CREATE POLICY "Members read comments" ON public.project_comments FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Contributors add comments" ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_project_member(project_id)
              AND NOT public.has_project_role(project_id, ARRAY['observer']::public.project_role[]));
CREATE POLICY "Authors delete comments" ON public.project_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND public.is_project_member(project_id));

CREATE POLICY "Members read exports" ON public.project_exports FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "Owners and designers request exports" ON public.project_exports FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid()
              AND public.has_project_role(project_id, ARRAY['program_owner','instructional_designer']::public.project_role[]));

CREATE POLICY "Members or admins read audit" ON public.audit_events FOR SELECT TO authenticated
  USING ((project_id IS NOT NULL AND public.is_project_member(project_id)) OR public.is_platform_admin());

-- ===== Audit trigger for metadata tables =====
CREATE OR REPLACE FUNCTION public.audit_row_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
  VALUES (NEW.project_id, auth.uid(), TG_TABLE_NAME || '.created', jsonb_build_object('id', NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER audit_files AFTER INSERT ON public.project_files FOR EACH ROW EXECUTE FUNCTION public.audit_row_insert();
CREATE TRIGGER audit_comments AFTER INSERT ON public.project_comments FOR EACH ROW EXECUTE FUNCTION public.audit_row_insert();
CREATE TRIGGER audit_exports AFTER INSERT ON public.project_exports FOR EACH ROW EXECUTE FUNCTION public.audit_row_insert();

-- ===== RPCs =====
CREATE OR REPLACE FUNCTION public.create_project(_title text, _description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;
  INSERT INTO public.projects (title, description, created_by)
    VALUES (btrim(_title), nullif(btrim(coalesce(_description, '')), ''), uid) RETURNING id INTO pid;
  INSERT INTO public.project_members (project_id, user_id, role, added_by) VALUES (pid, uid, 'program_owner', uid);
  INSERT INTO public.project_settings (project_id) VALUES (pid);
  INSERT INTO public.audit_events (project_id, actor_id, action) VALUES (pid, uid, 'project.created');
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.invite_to_project(_project_id uuid, _email text, _role public.project_role)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e text := public.normalize_kau_email(_email); iid uuid;
BEGIN
  IF uid IS NULL OR NOT public.has_project_role(_project_id, ARRAY['program_owner']::public.project_role[]) THEN
    RAISE EXCEPTION 'Only the program owner can invite' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF e IS NULL THEN RAISE EXCEPTION 'Only @kau.edu.sa addresses can be invited' USING ERRCODE = 'check_violation'; END IF;
  IF _role = 'system_administrator' THEN
    RAISE EXCEPTION 'System administrator cannot be granted by invitation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_members m JOIN public.profiles p ON p.id = m.user_id
             WHERE m.project_id = _project_id AND p.email = e) THEN
    RAISE EXCEPTION 'Already a member' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO public.project_invitations (project_id, email, role, invited_by)
    VALUES (_project_id, e, _role, uid)
    ON CONFLICT (project_id, email) WHERE status = 'pending' DO UPDATE SET role = EXCLUDED.role
    RETURNING id INTO iid;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (_project_id, uid, 'invitation.created', jsonb_build_object('email', e, 'role', _role));
  RETURN iid;
END $$;

CREATE OR REPLACE FUNCTION public.list_my_invitations()
RETURNS TABLE (id uuid, project_id uuid, project_title text, role public.project_role, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.project_id, p.title, i.role, i.created_at
  FROM public.project_invitations i JOIN public.projects p ON p.id = i.project_id
  WHERE auth.uid() IS NOT NULL AND i.status = 'pending'
    AND i.email = public.normalize_kau_email(auth.jwt() ->> 'email')
  ORDER BY i.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.respond_to_invitation(_invitation_id uuid, _accept boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e text := public.normalize_kau_email(auth.jwt() ->> 'email');
        inv public.project_invitations%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO inv FROM public.project_invitations WHERE id = _invitation_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'no_data_found'; END IF;
  IF e IS NULL OR inv.email <> e THEN
    RAISE EXCEPTION 'Invitation belongs to another user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.project_invitations SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END::public.invitation_status,
    responded_at = now() WHERE id = inv.id;
  IF _accept THEN
    INSERT INTO public.project_members (project_id, user_id, role, added_by)
      VALUES (inv.project_id, uid, inv.role, inv.invited_by) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action, details)
    VALUES (inv.project_id, uid, CASE WHEN _accept THEN 'invitation.accepted' ELSE 'invitation.declined' END,
            jsonb_build_object('invitation_id', inv.id, 'role', inv.role));
  RETURN inv.project_id;
END $$;

CREATE OR REPLACE FUNCTION public.accept_invitation(_invitation_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.respond_to_invitation(_invitation_id, true)
$$;
CREATE OR REPLACE FUNCTION public.decline_invitation(_invitation_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.respond_to_invitation(_invitation_id, false)
$$;

-- Audited admin capability: platform admins only.
CREATE OR REPLACE FUNCTION public.admin_list_projects()
RETURNS TABLE (id uuid, title text, created_at timestamptz, member_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.audit_events (project_id, actor_id, action) VALUES (NULL, auth.uid(), 'admin.list_projects');
  RETURN QUERY SELECT p.id, p.title, p.created_at, (SELECT count(*) FROM public.project_members m WHERE m.project_id = p.id)
    FROM public.projects p ORDER BY p.created_at DESC;
END $$;

-- Execution rights
REVOKE ALL ON FUNCTION public.create_project(text, text), public.invite_to_project(uuid, text, public.project_role),
  public.list_my_invitations(), public.respond_to_invitation(uuid, boolean), public.accept_invitation(uuid),
  public.decline_invitation(uuid), public.admin_list_projects(), public.is_platform_admin(),
  public.is_project_member(uuid), public.has_project_role(uuid, public.project_role[]),
  public.guard_kau_signup(), public.handle_new_user(), public.audit_row_insert() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_project(text, text), public.invite_to_project(uuid, text, public.project_role),
  public.list_my_invitations(), public.accept_invitation(uuid), public.decline_invitation(uuid),
  public.admin_list_projects(), public.is_platform_admin(), public.is_project_member(uuid),
  public.has_project_role(uuid, public.project_role[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_to_invitation(uuid, boolean) FROM authenticated;
