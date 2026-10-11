import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAiStatus } from "./ai.functions";

// Reads go through RLS; AI calls go through the server functions in ai.functions.ts.

export const aiStatusQuery = queryOptions({
  queryKey: ["ai-status"],
  queryFn: () => getAiStatus(),
  staleTime: 5 * 60_000,
});

export const isPlatformAdminQuery = (userId: string) =>
  queryOptions({
    queryKey: ["is-platform-admin", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) throw error;
      return Boolean(data);
    },
  });

export const glossaryQuery = queryOptions({
  queryKey: ["glossary"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("glossary_terms")
      .select("id, term_ar, term_en, domain, note")
      .order("term_en");
    if (error) throw error;
    return data ?? [];
  },
});

export const aiUsageQuery = (userId: string) =>
  queryOptions({
    queryKey: ["ai-usage", userId],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("ai_requests")
        .select("feature, status, outcome, input_tokens, output_tokens, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

export type UsageRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof aiUsageQuery>["queryFn"]>>
>[number];

/** Per-feature counts and how often people kept drafts unchanged (a warning sign when near 100%). */
export function summarizeUsage(rows: UsageRow[]) {
  const by = new Map<
    string,
    {
      feature: string;
      calls: number;
      failed: number;
      accepted: number;
      edited: number;
      discarded: number;
      tokens: number;
    }
  >();
  for (const r of rows) {
    const s = by.get(r.feature) ?? {
      feature: r.feature,
      calls: 0,
      failed: 0,
      accepted: 0,
      edited: 0,
      discarded: 0,
      tokens: 0,
    };
    s.calls += 1;
    if (r.status !== "succeeded") s.failed += 1;
    if (r.outcome === "accepted") s.accepted += 1;
    if (r.outcome === "edited") s.edited += 1;
    if (r.outcome === "discarded") s.discarded += 1;
    s.tokens += r.input_tokens + r.output_tokens;
    by.set(r.feature, s);
  }
  return [...by.values()].sort((a, b) => b.calls - a.calls);
}

export async function recordAiOutcome(
  requestId: string | null | undefined,
  outcome: "accepted" | "edited" | "discarded",
) {
  if (!requestId) return;
  // Feedback only; failures must not block the person's work.
  await supabase.rpc("record_ai_outcome", { _request_id: requestId, _outcome: outcome });
}

export async function acceptBriefField(versionId: string, key: string) {
  const { error } = await supabase.rpc("accept_ai_brief_field", {
    _version_id: versionId,
    _key: key,
  });
  if (error) throw error;
}

export async function saveGlossaryTerm(t: {
  id: string | null;
  term_ar: string;
  term_en: string;
  domain: string;
  note: string;
}) {
  const { error } = await supabase.rpc("save_glossary_term", {
    _id: t.id as string,
    _term_ar: t.term_ar,
    _term_en: t.term_en,
    _domain: t.domain,
    _note: t.note,
  });
  if (error) throw error;
}

export async function deleteGlossaryTerm(id: string) {
  const { error } = await supabase.rpc("delete_glossary_term", { _id: id });
  if (error) throw error;
}

export const errText = (e: unknown) =>
  e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
