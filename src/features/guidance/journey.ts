import type { MessageKey } from "@/features/i18n/locale";
import type { Focus } from "@/features/navigation/focus";

// Shape returned by public.project_journey and the pure logic that turns it into steps and one next action.

export interface Journey {
  brief: {
    artifact_id: string;
    version_id: string;
    version: number;
    state: string;
    assumptions_confirmed: boolean;
    ai_pending: number;
  } | null;
  architecture: {
    artifact_id: string;
    version_id: string;
    version: number;
    state: string;
    elements: number;
    defects: number;
    unverified_references: number;
    courses: number;
    courses_specified: number;
  } | null;
  courses: { with_content: number; critical_defects: number; in_review_or_approved: number };
  compliance: { active_rules: number; runs: number; open_blockers: number; open_findings: number };
  reviews: { in_review: number; changes_requested: number; approved: number };
}

export type StepId =
  "brief" | "architecture" | "specification" | "content" | "compliance" | "review";
export type StepStatus = "done" | "current" | "attention" | "todo";
export type Route =
  "/program-architect" | "/course-studio" | "/compliance" | "/reviews" | "/exports";
export interface NextStep {
  key: MessageKey;
  to: Route;
  search: Focus;
  count?: number;
}

const k = (s: string) => s as MessageKey;

export function nextStep(j: Journey, project: string): NextStep {
  const b = j.brief;
  const a = j.architecture;
  const pa = (key: string, artifact?: string, count?: number): NextStep => ({
    key: k(key),
    to: "/program-architect",
    search: artifact ? { project, artifact } : { project },
    ...(count ? { count } : {}),
  });
  if (!b) return pa("jr.next.createBrief");
  if (b.ai_pending > 0) return pa("jr.next.acceptAi", b.artifact_id, b.ai_pending);
  if (!b.assumptions_confirmed) return pa("jr.next.confirmAssumptions", b.artifact_id);
  if (!a) return pa("jr.next.createArchitecture", b.artifact_id);
  if (a.elements === 0) return pa("jr.next.buildArchitecture", a.artifact_id);
  if (a.defects > 0) return pa("jr.next.fixAlignment", a.artifact_id, a.defects);
  if (a.courses_specified < a.courses)
    return pa("jr.next.specifyCourses", a.artifact_id, a.courses - a.courses_specified);
  if (a.unverified_references > 0)
    return pa("jr.next.verifyReferences", a.artifact_id, a.unverified_references);
  if (j.courses.with_content < a.courses)
    return {
      key: k("jr.next.createContent"),
      to: "/course-studio",
      search: { project },
      count: a.courses - j.courses.with_content,
    };
  if (j.courses.critical_defects > 0)
    return {
      key: k("jr.next.fixContent"),
      to: "/course-studio",
      search: { project },
      count: j.courses.critical_defects,
    };
  if (j.compliance.active_rules === 0)
    return {
      key: k("jr.next.setupCompliance"),
      to: "/compliance",
      search: { project, tab: "rules" },
    };
  if (j.compliance.runs === 0)
    return { key: k("jr.next.runCompliance"), to: "/compliance", search: { project, tab: "run" } };
  if (j.compliance.open_blockers > 0)
    return {
      key: k("jr.next.resolveBlockers"),
      to: "/compliance",
      search: { project, tab: "findings" },
      count: j.compliance.open_blockers,
    };
  if (j.reviews.changes_requested > 0)
    return {
      key: k("jr.next.reviseReturned"),
      to: "/reviews",
      search: { project },
      count: j.reviews.changes_requested,
    };
  if (b.state === "draft" || a.state === "draft")
    return {
      key: k("jr.next.requestReview"),
      to: "/reviews",
      search: { project, artifact: b.state === "draft" ? b.artifact_id : a.artifact_id },
    };
  if (b.state === "approved" && a.state === "approved" && j.reviews.in_review === 0)
    return { key: k("jr.next.done"), to: "/exports", search: { project } };
  return { key: k("jr.next.awaitReview"), to: "/reviews", search: { project } };
}

export function journeySteps(j: Journey): { id: StepId; status: StepStatus }[] {
  const b = j.brief;
  const a = j.architecture;
  const briefS: StepStatus = !b
    ? "current"
    : b.ai_pending > 0 || !b.assumptions_confirmed
      ? "attention"
      : "done";
  const archS: StepStatus = !a
    ? briefS === "done"
      ? "current"
      : "todo"
    : a.elements === 0 || a.defects > 0
      ? "attention"
      : "done";
  const specS: StepStatus =
    !a || a.courses === 0
      ? "todo"
      : a.courses_specified < a.courses || a.unverified_references > 0
        ? "attention"
        : "done";
  const contentS: StepStatus =
    !a || a.courses === 0
      ? "todo"
      : j.courses.critical_defects > 0
        ? "attention"
        : j.courses.with_content >= a.courses
          ? "done"
          : j.courses.with_content > 0
            ? "current"
            : "todo";
  const compS: StepStatus =
    j.compliance.open_blockers > 0
      ? "attention"
      : j.compliance.runs > 0 && j.compliance.active_rules > 0
        ? "done"
        : j.compliance.active_rules > 0
          ? "current"
          : "todo";
  const reviewS: StepStatus =
    j.reviews.changes_requested > 0
      ? "attention"
      : b?.state === "approved" && a?.state === "approved" && j.reviews.in_review === 0
        ? "done"
        : j.reviews.in_review > 0
          ? "current"
          : "todo";
  return [
    { id: "brief", status: briefS },
    { id: "architecture", status: archS },
    { id: "specification", status: specS },
    { id: "content", status: contentS },
    { id: "compliance", status: compS },
    { id: "review", status: reviewS },
  ];
}

export interface WorkItem {
  kind: string;
  project_id: string;
  ref_id: string;
  artifact_id: string | null;
}

/** Where each "My work" item opens. */
export function workLink(w: WorkItem): { to: Route; search: Focus } {
  const project = w.project_id;
  const withArtifact = (to: Route) => ({
    to,
    search: w.artifact_id ? { project, artifact: w.artifact_id } : { project },
  });
  switch (w.kind) {
    case "finding":
      return { to: "/compliance", search: { project, tab: "findings", item: w.ref_id } };
    case "approve_source":
      return { to: "/compliance", search: { project, tab: "sources" } };
    case "activate_rule":
      return { to: "/compliance", search: { project, tab: "rules" } };
    case "accept_ai":
      return withArtifact("/program-architect");
    default:
      return withArtifact("/reviews");
  }
}

/** Where to fix a failed review-readiness check (null when there is nothing to open). */
export function readinessFix(
  check: string,
  project: string,
  artifact: string,
): { to: Route; search: Focus } | null {
  switch (check) {
    case "assumptions_confirmed":
    case "ai_accepted":
    case "has_elements":
    case "aligned":
    case "references_verified":
      return { to: "/program-architect", search: { project, artifact } };
    case "brief_confirmed":
      return { to: "/program-architect", search: { project } };
    case "no_critical_defects":
      return { to: "/course-studio", search: { project } };
    case "no_compliance_blockers":
      return { to: "/compliance", search: { project, tab: "findings" } };
    default:
      return null;
  }
}
