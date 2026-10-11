import type { SupabaseClient } from "@supabase/supabase-js";
import type * as z from "zod/v4";
import type { Database } from "@/integrations/supabase/types";
import { anthropicProvider, type AiAttachment, type AiProvider } from "./gateway";
import { buildSystem, buildUserText, FEATURE_EFFORT, type GlossaryEntry } from "./prompts";
import type { AiFeature } from "./schemas";

// Governed AI execution used by the server functions: authorise -> daily limit -> call -> log.
// Configuration arrives as plain values read by the calling handler (no environment access here).

type Admin = SupabaseClient<Database>;

export interface AiConfig {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string;
  dailyLimit: number;
}

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Parses raw environment values. AI stays off unless AI_ENABLED is exactly "true" and a key exists. */
export function parseAiConfig(env: Record<string, string | undefined>): AiConfig {
  const apiKey = env["ANTHROPIC_API_KEY"] ?? "";
  const limit = Number.parseInt(env["AI_DAILY_LIMIT"] ?? "", 10);
  return {
    enabled: env["AI_ENABLED"] === "true" && apiKey !== "",
    provider: "anthropic",
    model: env["AI_MODEL"]?.trim() || DEFAULT_MODEL,
    apiKey,
    dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 200,
  };
}

export class AiError extends Error {}

export function providerFor(cfg: AiConfig): AiProvider {
  if (!cfg.enabled) throw new AiError("AI assistance is turned off for this platform");
  return anthropicProvider({ apiKey: cfg.apiKey, model: cfg.model });
}

export async function loadGlossary(admin: Admin): Promise<GlossaryEntry[]> {
  const { data } = await admin.from("glossary_terms").select("term_ar, term_en").order("term_en");
  return data ?? [];
}

export interface RunOptions<T> {
  admin: Admin;
  provider: AiProvider;
  dailyLimit: number;
  userId: string;
  projectId: string;
  feature: AiFeature;
  input: unknown;
  schema: z.ZodType<T>;
  attachment?: AiAttachment | undefined;
  targetRef?: string | undefined;
  glossary?: GlossaryEntry[] | undefined;
}

export async function runAi<T>(o: RunOptions<T>): Promise<{ requestId: string; data: T }> {
  const auth = await o.admin.rpc("ai_authorize", { _project_id: o.projectId, _actor: o.userId });
  if (auth.error) throw new AiError("Your project role cannot use AI drafting here");
  const used = Number((auth.data as { used_today?: number } | null)?.used_today ?? 0);
  const log = (status: string, inT: number, outT: number, error: string | null) =>
    o.admin.rpc("record_ai_request", {
      _project_id: o.projectId,
      _actor: o.userId,
      _feature: o.feature,
      _provider: o.provider.name,
      _model: o.provider.model,
      _status: status,
      _input_tokens: inT,
      _output_tokens: outT,
      _target_ref: (o.targetRef ?? null) as string,
      _error: error as string,
    });
  if (used >= o.dailyLimit) {
    await log("limited", 0, 0, "Daily limit reached");
    throw new AiError("You have reached today's AI limit; try again tomorrow");
  }
  const glossary = o.glossary ?? (await loadGlossary(o.admin));
  const res = await o.provider.run({
    system: buildSystem(o.feature, glossary),
    userText: buildUserText(o.input),
    schema: o.schema,
    effort: FEATURE_EFFORT[o.feature],
    attachment: o.attachment,
  });
  const rec = await log(
    res.status,
    res.inputTokens,
    res.outputTokens,
    res.status === "succeeded" ? null : res.error,
  );
  if (rec.error || !rec.data) throw new AiError("Could not record the AI request");
  if (res.status !== "succeeded") throw new AiError(res.error);
  return { requestId: rec.data as string, data: res.data };
}
