import type { Database } from "@/integrations/supabase/types";
import type { ProjectRole } from "@/features/projects/api";

// Client mirror of migration 0007 for live UI hints only; the database stays authoritative.
// Change together with public.source_status_on, source_authorizes, rule_applies,
// compliance_source_input, save_compliance_rule and transition_finding.

type Enums = Database["public"]["Enums"];
export type SourceStatus = Enums["compliance_source_status"];
export type RuleStatus = Enums["compliance_rule_status"];
export type Severity = Enums["rule_severity"];
export type CheckType = Enums["rule_check_type"];
export type FindingStatus = Enums["finding_status"];

export const SOURCE_STATUSES: readonly SourceStatus[] = [
  "draft",
  "under_review",
  "active",
  "superseded",
  "expired",
  "rejected",
];
export const SEVERITIES: readonly Severity[] = ["info", "warning", "blocker"];
export const CHECK_TYPES: readonly CheckType[] = ["automated", "manual", "hybrid"];
export const FINDING_STATUSES: readonly FindingStatus[] = [
  "open",
  "acknowledged",
  "remediation_in_progress",
  "resolved",
  "accepted_exception",
  "false_positive",
];
export const CLOSED_FINDING: readonly FindingStatus[] = [
  "resolved",
  "accepted_exception",
  "false_positive",
];

/** Applicability dimensions → run context key and allowed values (compliance_validate_applicability). */
export const APPLICABILITY = {
  categories: {
    key: "category",
    values: ["micro_credential", "academic_program", "professional_program"],
  },
  delivery_modes: { key: "delivery_mode", values: ["in_person", "online", "blended"] },
  credit_types: { key: "credit_type", values: ["credit_bearing", "non_credit"] },
  languages: { key: "language", values: ["ar", "en", "bilingual"] },
  artifact_kinds: {
    key: "artifact_kind",
    values: ["program_brief", "program_architecture", "course_content"],
  },
} as const;
export type ApplicabilityDim = keyof typeof APPLICABILITY;
export type Applicability = Partial<Record<ApplicabilityDim, string[]>>;

/** Automated check types and the artifact kind each targets (compliance_check_target). */
export const CHECK_SPECS = {
  brief_field_present: "program_brief",
  brief_field_bilingual: "program_brief",
  architecture_min_elements: "program_architecture",
  architecture_aligned: "program_architecture",
  course_block_present: "course_content",
  course_no_critical_defects: "course_content",
} as const;
export type CheckSpecType = keyof typeof CHECK_SPECS;

const EDITORS: readonly ProjectRole[] = [
  "program_owner",
  "compliance_reviewer",
  "system_administrator",
];
const APPROVERS: readonly ProjectRole[] = ["compliance_reviewer", "system_administrator"];
export const canEditCompliance = (r: ProjectRole | undefined) => !!r && EDITORS.includes(r);
export const canApproveCompliance = (r: ProjectRole | undefined) => !!r && APPROVERS.includes(r);
export const canRunCompliance = (r: ProjectRole | undefined) => !!r && r !== "observer";

export function sourceStatusOn(
  status: SourceStatus,
  _effective: string | null,
  expires: string | null,
  on: string,
): SourceStatus {
  return status === "active" && expires !== null && on > expires ? "expired" : status;
}

export function sourceAuthorizes(
  status: SourceStatus,
  effective: string | null,
  expires: string | null,
  on: string,
): boolean {
  return (
    sourceStatusOn(status, effective, expires, on) === "active" &&
    (effective === null || effective <= on)
  );
}

export function ruleApplies(
  app: Applicability,
  from: string | null,
  to: string | null,
  ctx: Record<string, string>,
  on: string,
): boolean {
  if (from !== null && from > on) return false;
  if (to !== null && on > to) return false;
  return (Object.keys(APPLICABILITY) as ApplicabilityDim[]).every((d) => {
    const allowed = app[d] ?? [];
    const v = ctx[APPLICABILITY[d].key] ?? "";
    return allowed.length === 0 || (v !== "" && allowed.includes(v));
  });
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type SourceDraft = Partial<
  Record<
    | "title_ar"
    | "title_en"
    | "issuing_authority"
    | "document_type"
    | "official_identifier"
    | "source_url"
    | "source_file_id"
    | "checksum"
    | "effective_on"
    | "expires_on",
    string | null
  >
>;
export type SourceProblem =
  | "title"
  | "issuing_authority"
  | "document_type"
  | "official_identifier"
  | "location"
  | "source_url"
  | "checksum"
  | "dates";

export function validateSourceDraft(f: SourceDraft): SourceProblem[] {
  const out: SourceProblem[] = [];
  if (!trim(f.title_ar) && !trim(f.title_en)) out.push("title");
  if (!trim(f.issuing_authority)) out.push("issuing_authority");
  if (!trim(f.document_type)) out.push("document_type");
  if (!trim(f.official_identifier)) out.push("official_identifier");
  const url = trim(f.source_url);
  if (!url && !trim(f.source_file_id)) out.push("location");
  if (url && !/^https:\/\/[^\s<>"]+$/.test(url)) out.push("source_url");
  const sum = trim(f.checksum).toLowerCase();
  if (sum && !/^[0-9a-f]{64}$/.test(sum)) out.push("checksum");
  if (f.effective_on && f.expires_on && f.expires_on < f.effective_on) out.push("dates");
  return out;
}

export type RuleDraft = {
  rule_code?: string;
  statement_ar?: string;
  statement_en?: string;
  remediation_ar?: string;
  remediation_en?: string;
  severity?: string;
  check_type?: string;
  check_spec?: { type?: string } | null;
  effective_from?: string;
  effective_to?: string;
};
export type RuleProblem =
  "rule_code" | "statement" | "severity" | "check_type" | "remediation" | "check_spec" | "dates";

export function validateRuleDraft(f: RuleDraft, isNew = true): RuleProblem[] {
  const out: RuleProblem[] = [];
  if (isNew && !CODE.test(trim(f.rule_code))) out.push("rule_code");
  if (!trim(f.statement_ar) && !trim(f.statement_en)) out.push("statement");
  if (!SEVERITIES.includes(f.severity as Severity)) out.push("severity");
  if (!CHECK_TYPES.includes(f.check_type as CheckType)) out.push("check_type");
  if (f.severity === "blocker" && !trim(f.remediation_ar) && !trim(f.remediation_en))
    out.push("remediation");
  const hasSpec = !!f.check_spec?.type;
  if (
    (f.check_type === "manual" && hasSpec) ||
    (f.check_type && f.check_type !== "manual" && !hasSpec)
  )
    out.push("check_spec");
  if (f.effective_from && f.effective_to && f.effective_to < f.effective_from) out.push("dates");
  return out;
}

export const isValidCode = (c: string) => CODE.test(c.trim());

type FindingLike = {
  status: string;
  severity: string;
  outcome: string;
  assignee_id: string | null;
};

/** Status changes the database would accept from this user (transition_finding). */
export function findingActions(
  f: FindingLike,
  role: ProjectRole | undefined,
  userId: string,
): FindingStatus[] {
  if (!role || role === "observer" || CLOSED_FINDING.includes(f.status as FindingStatus)) return [];
  const out: FindingStatus[] = [];
  if (EDITORS.includes(role) || f.assignee_id === userId) {
    if (f.status === "open") out.push("acknowledged");
    if (f.status !== "remediation_in_progress") out.push("remediation_in_progress");
  }
  if (APPROVERS.includes(role)) {
    out.push("resolved", "accepted_exception");
    if (f.severity !== "blocker") out.push("false_positive");
  }
  return out;
}

/** What closing a finding needs, so the form can ask for it up front. */
export function closureNeeds(f: FindingLike, to: FindingStatus) {
  return {
    comment:
      to === "accepted_exception" ||
      to === "false_positive" ||
      (to === "resolved" && f.severity === "blocker"),
    exception: to === "accepted_exception",
    verificationRun: to === "resolved" && f.severity === "blocker" && f.outcome === "fail",
  };
}
