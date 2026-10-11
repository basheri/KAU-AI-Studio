import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { Applicability, FindingStatus, SourceStatus } from "./rules";

// Reads go through RLS (members only); writes only through audited RPCs.

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];
export type SourceRow = Views["compliance_sources_current"]["Row"];
export type RulesetRow = Tables["compliance_rulesets"]["Row"];
export type EvidenceRow = Pick<
  Tables["compliance_rule_evidence"]["Row"],
  "source_id" | "locator" | "page" | "section"
>;
export type RuleRow = Omit<Tables["compliance_rules"]["Row"], "applicability"> & {
  applicability: Applicability;
  compliance_rule_evidence: EvidenceRow[];
};
export type RunRow = Tables["compliance_runs"]["Row"];
export type FindingRow = Tables["compliance_findings"]["Row"];
export type FindingEventRow = Tables["compliance_finding_events"]["Row"];
export type RunContext = { delivery_mode: string; credit_type: string; language: string };

async function rpc<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}
async function rows<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  return (await rpc(p)) ?? [];
}

export const sourcesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["compliance-sources", projectId],
    queryFn: () =>
      rows(
        supabase
          .from("compliance_sources_current")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ),
  });

export const rulesetsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["compliance-rulesets", projectId],
    queryFn: () =>
      rows(
        supabase.from("compliance_rulesets").select("*").eq("project_id", projectId).order("code"),
      ),
  });

export const rulesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["compliance-rules", projectId],
    queryFn: async () =>
      (await rows(
        supabase
          .from("compliance_rules")
          .select("*, compliance_rule_evidence(source_id, locator, page, section)")
          .eq("project_id", projectId)
          .order("rule_code")
          .order("version_number", { ascending: false }),
      )) as unknown as RuleRow[],
  });

export const runsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["compliance-runs", projectId],
    queryFn: () =>
      rows(
        supabase
          .from("compliance_runs")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ),
  });

export const findingsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["compliance-findings", projectId],
    queryFn: () =>
      rows(
        supabase
          .from("compliance_findings")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ),
  });

export const findingEventsQuery = (findingId: string) =>
  queryOptions({
    queryKey: ["compliance-finding-events", findingId],
    queryFn: () =>
      rows(
        supabase
          .from("compliance_finding_events")
          .select("*")
          .eq("finding_id", findingId)
          .order("created_at"),
      ),
  });

export const saveSource = (projectId: string, sourceId: string | null, fields: object) =>
  rpc(
    supabase.rpc("save_compliance_source", {
      _project_id: projectId,
      _source_id: sourceId as string,
      _fields: fields as Json,
    }),
  );

export const reviseSource = (sourceId: string, fields: object = {}) =>
  rpc(supabase.rpc("revise_compliance_source", { _source_id: sourceId, _fields: fields as Json }));

export const transitionSource = (sourceId: string, to: SourceStatus, comment: string | null) =>
  rpc(
    supabase.rpc("transition_compliance_source", {
      _source_id: sourceId,
      _to: to,
      ...(comment ? { _comment: comment } : {}),
    }),
  );

export const saveRuleset = (projectId: string, code: string, titleAr: string, titleEn: string) =>
  rpc(
    supabase.rpc("save_compliance_ruleset", {
      _project_id: projectId,
      _ruleset_id: null as unknown as string,
      _code: code,
      _title_ar: titleAr,
      _title_en: titleEn,
    }),
  );

export const saveRule = (
  rulesetId: string,
  ruleId: string | null,
  fields: object,
  evidence: EvidenceRow[],
) =>
  rpc(
    supabase.rpc("save_compliance_rule", {
      _ruleset_id: rulesetId,
      _rule_id: ruleId as string,
      _fields: fields as Json,
      _evidence: evidence as unknown as Json,
    }),
  );

export const reviseRule = (ruleId: string) =>
  rpc(supabase.rpc("revise_compliance_rule", { _rule_id: ruleId }));

export const setRuleStatus = (ruleId: string, to: "active" | "retired", comment: string | null) =>
  rpc(
    supabase.rpc("set_compliance_rule_status", {
      _rule_id: ruleId,
      _to: to,
      ...(comment ? { _comment: comment } : {}),
    }),
  );

export const runCompliance = (versionId: string, rulesetId: string, ctx: RunContext) =>
  rpc(
    supabase.rpc("run_compliance", {
      _version_id: versionId,
      _ruleset_id: rulesetId,
      _context: ctx as unknown as Json,
    }),
  );

export const assignFinding = (findingId: string, assignee: string | null, due: string | null) =>
  rpc(
    supabase.rpc("assign_finding", {
      _finding_id: findingId,
      _assignee: assignee as string,
      _due: due as string,
    }),
  );

export const commentFinding = (findingId: string, body: string) =>
  rpc(supabase.rpc("comment_finding", { _finding_id: findingId, _body: body }));

export const transitionFinding = (
  findingId: string,
  to: FindingStatus,
  opts: { comment?: string; exceptionId?: string; verifiedRunId?: string } = {},
) =>
  rpc(
    supabase.rpc("transition_finding", {
      _finding_id: findingId,
      _to: to,
      ...(opts.comment ? { _comment: opts.comment } : {}),
      ...(opts.exceptionId ? { _exception_id: opts.exceptionId } : {}),
      ...(opts.verifiedRunId ? { _verified_run_id: opts.verifiedRunId } : {}),
    }),
  );
