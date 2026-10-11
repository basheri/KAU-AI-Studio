import type { Database } from "@/integrations/supabase/types";

export type ArtifactState = Database["public"]["Enums"]["artifact_state"];
export type DecisionKind = Database["public"]["Enums"]["review_decision_kind"];

export const ARTIFACT_STATES: readonly ArtifactState[] = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "superseded",
  "archived",
];

export const ARTIFACT_KINDS = [
  "program_brief",
  "program_architecture",
  "course_architecture",
  "learner_content",
  "other",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** Mirrors `public.edit_artifact`: the database is the authority, this only drives the UI. */
export function editOutcome(state: ArtifactState): "in_place" | "child" | "blocked" {
  if (state === "draft") return "in_place";
  if (state === "in_review" || state === "approved" || state === "changes_requested")
    return "child";
  return "blocked";
}

/** Mirrors `public.decide_review` validation. */
export function decisionProblem(
  decision: DecisionKind,
  comment: string,
  exceptionId: string | null,
): "comment" | "exception" | null {
  if (decision !== "approve" && !comment.trim()) return "comment";
  if (decision === "approve_exception" && !exceptionId) return "exception";
  return null;
}

// Segregation of duties — mirrors migration 0008 triggers; the database stays authoritative.

/** The requester and the version's creator cannot decide, except at the administrative export freeze. */
export function selfDecisionBlocked(p: {
  stageKey: string;
  userId: string;
  requestedBy: string;
  versionCreatedBy: string;
}): boolean {
  return (
    p.stageKey !== "export_frozen" &&
    (p.userId === p.requestedBy || p.userId === p.versionCreatedBy)
  );
}

export type ExceptionStatus = Database["public"]["Enums"]["exception_status"];
type Role = Database["public"]["Enums"]["project_role"];

/** A pending exception is decided by a compliance reviewer or administrator other than its creator. */
export function canDecideException(
  e: { status: ExceptionStatus; created_by: string },
  role: Role | undefined,
  userId: string,
): boolean {
  return (
    e.status === "pending" &&
    e.created_by !== userId &&
    (role === "compliance_reviewer" || role === "system_administrator")
  );
}
