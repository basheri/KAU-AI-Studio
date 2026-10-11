import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProjectRole = Database["public"]["Enums"]["project_role"];

/** Roles an owner may grant by invitation (system administrator is never invitable). */
export const INVITABLE_ROLES: readonly ProjectRole[] = [
  "program_owner",
  "subject_matter_expert",
  "instructional_designer",
  "compliance_reviewer",
  "media_reviewer",
  "observer",
];

export interface MyProject {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  role: ProjectRole;
}

// All reads go through RLS as the signed-in user: non-members get zero rows.
export const myProjectsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["projects", userId],
    queryFn: async (): Promise<MyProject[]> => {
      const { data, error } = await supabase
        .from("project_members")
        .select("role, projects(id, title, description, created_at)")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.projects)
        .map((r) => ({ ...r.projects!, role: r.role }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

export const projectMembersQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("user_id, role")
        .eq("project_id", projectId);
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectInvitationsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-invitations", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_invitations")
        .select("id, email, role, status, created_at")
        .eq("project_id", projectId)
        .eq("status", "pending");
      if (error) throw error;
      return data ?? [];
    },
  });

export const myInvitationsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["my-invitations", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_invitations");
      if (error) throw error;
      return data ?? [];
    },
  });

export async function createProject(title: string, description: string) {
  const { data, error } = await supabase.rpc("create_project", {
    _title: title,
    _description: description,
  });
  if (error) throw error;
  return data;
}

export async function inviteToProject(projectId: string, email: string, role: ProjectRole) {
  const { data, error } = await supabase.rpc("invite_to_project", {
    _project_id: projectId,
    _email: email,
    _role: role,
  });
  if (error) throw error;
  return data;
}

export async function respondToInvitation(id: string, accept: boolean) {
  const { error } = accept
    ? await supabase.rpc("accept_invitation", { _invitation_id: id })
    : await supabase.rpc("decline_invitation", { _invitation_id: id });
  if (error) throw error;
}
