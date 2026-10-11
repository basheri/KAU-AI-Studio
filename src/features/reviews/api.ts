import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ArtifactKind, DecisionKind } from "./rules";

// Reads go through RLS (members only). Writes go through audited RPCs only.

export const stagesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["stages", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_stages")
        .select("id, stage_key, position, name_ar, name_en, approver_roles")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
export type Stage = Awaited<
  ReturnType<NonNullable<ReturnType<typeof stagesQuery>["queryFn"]>>
>[number];

export const membersQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["members-directory", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_project_members", {
        _project_id: projectId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

export const artifactsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["artifacts", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artifacts")
        .select(
          "id, kind, title, current_stage_id, created_at, artifact_versions(id, version_number, state)",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const versionsQuery = (artifactId: string) =>
  queryOptions({
    queryKey: ["versions", artifactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artifact_versions")
        .select(
          "id, version_number, parent_version_id, state, content, change_summary, created_by, created_at, updated_at",
        )
        .eq("artifact_id", artifactId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
export type Version = Awaited<
  ReturnType<NonNullable<ReturnType<typeof versionsQuery>["queryFn"]>>
>[number];

export const versionReviewQuery = (versionId: string) =>
  queryOptions({
    queryKey: ["version-review", versionId],
    queryFn: async () => {
      const [requests, decisions, comments, mentions] = await Promise.all([
        supabase
          .from("review_requests")
          .select(
            "id, stage_id, status, note, requested_by, created_at, closed_at, review_assignments(assignee_id)",
          )
          .eq("artifact_version_id", versionId)
          .order("created_at"),
        supabase
          .from("review_decisions")
          .select("id, stage_id, decision, comment, exception_id, actor_id, actor_role, decided_at")
          .eq("artifact_version_id", versionId)
          .order("decided_at"),
        supabase
          .from("review_comments")
          .select("id, parent_id, body, author_id, created_at")
          .eq("artifact_version_id", versionId)
          .order("created_at"),
        supabase.from("review_comment_mentions").select("comment_id, user_id"),
      ]);
      for (const r of [requests, decisions, comments, mentions]) if (r.error) throw r.error;
      const ids = new Set((comments.data ?? []).map((c) => c.id));
      return {
        requests: requests.data ?? [],
        decisions: decisions.data ?? [],
        comments: comments.data ?? [],
        mentions: (mentions.data ?? []).filter((m) => ids.has(m.comment_id)),
      };
    },
  });

export const exceptionsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["exceptions", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documented_exceptions")
        .select(
          "id, reference, title, justification, artifact_id, created_at, created_by, status, decided_by, decided_at, decision_comment",
        )
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

async function rpc<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>;
}

export const createArtifact = (
  projectId: string,
  kind: ArtifactKind,
  title: string,
  content: string,
) =>
  rpc(
    supabase.rpc("create_artifact", {
      _project_id: projectId,
      _kind: kind,
      _title: title,
      _content: content,
    }),
  );

/** Returns the id of the edited draft or of the newly proposed child version. */
export const editArtifact = (versionId: string, content: string, summary: string) =>
  rpc(
    supabase.rpc("edit_artifact", {
      _version_id: versionId,
      _content: content,
      _change_summary: summary,
    }),
  );

export const requestReview = (versionId: string, note: string, assignees: string[]) =>
  rpc(
    supabase.rpc("request_review", { _version_id: versionId, _note: note, _assignees: assignees }),
  );

export const assignReviewer = (requestId: string, assignee: string) =>
  rpc(supabase.rpc("assign_reviewer", { _request_id: requestId, _assignee: assignee }));

export const decideReview = (
  requestId: string,
  decision: DecisionKind,
  comment: string,
  exceptionId: string | null,
) =>
  rpc(
    supabase.rpc("decide_review", {
      _request_id: requestId,
      _decision: decision,
      _comment: comment,
      ...(exceptionId ? { _exception_id: exceptionId } : {}),
    }),
  );

export const addComment = (
  versionId: string,
  body: string,
  parentId: string | null,
  mentions: string[],
) =>
  rpc(
    supabase.rpc("add_review_comment", {
      _version_id: versionId,
      _body: body,
      _mentions: mentions,
      ...(parentId ? { _parent_id: parentId } : {}),
    }),
  );

export const createException = (
  projectId: string,
  artifactId: string | null,
  title: string,
  justification: string,
) =>
  rpc(
    supabase.rpc("create_exception", {
      _project_id: projectId,
      _title: title,
      _justification: justification,
      _artifact_id: artifactId as string, // null = project-wide exception
    }),
  );

export const decideException = (exceptionId: string, approve: boolean, comment: string) =>
  rpc(
    supabase.rpc("decide_exception", {
      _exception_id: exceptionId,
      _approve: approve,
      ...(comment.trim() ? { _comment: comment } : {}),
    }),
  );
