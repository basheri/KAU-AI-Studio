import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import type { Effort } from "./prompts";

// Provider-neutral AI call. The server functions pick a provider from configuration; adding a
// Saudi-hosted or university-hosted model means adding another AiProvider, not changing features.

export type AiAttachment =
  | { kind: "pdf"; base64: string }
  | { kind: "pdf_url"; url: string }
  | { kind: "image_url"; url: string };

export interface AiRequest<T> {
  system: string;
  userText: string;
  schema: z.ZodType<T>;
  effort: Effort;
  attachment?: AiAttachment | undefined;
}

export type AiResult<T> =
  | { status: "succeeded"; data: T; inputTokens: number; outputTokens: number }
  | { status: "refused" | "failed"; error: string; inputTokens: number; outputTokens: number };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  run<T>(req: AiRequest<T>): Promise<AiResult<T>>;
}

function attachmentBlock(a: AiAttachment): Anthropic.Beta.BetaContentBlockParam {
  if (a.kind === "pdf")
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: a.base64 },
    };
  if (a.kind === "pdf_url") return { type: "document", source: { type: "url", url: a.url } };
  return { type: "image", source: { type: "url", url: a.url } };
}

/** Claude through the official Anthropic SDK, with server-side refusal fallback enabled. */
export function anthropicProvider(opts: { apiKey: string; model: string }): AiProvider {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 120_000 });
  return {
    name: "anthropic",
    model: opts.model,
    async run<T>(req: AiRequest<T>): Promise<AiResult<T>> {
      try {
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (req.attachment) content.push(attachmentBlock(req.attachment));
        content.push({ type: "text", text: req.userText });
        const res = await client.beta.messages.parse({
          model: opts.model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: req.system,
          messages: [{ role: "user", content }],
          output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
        });
        const usage = {
          inputTokens: res.usage.input_tokens ?? 0,
          outputTokens: res.usage.output_tokens ?? 0,
        };
        if (res.stop_reason === "refusal")
          return { status: "refused", error: "The request was declined", ...usage };
        if (res.stop_reason === "max_tokens" || res.parsed_output == null)
          return { status: "failed", error: "The response was incomplete", ...usage };
        return { status: "succeeded", data: res.parsed_output as T, ...usage };
      } catch (e) {
        const error =
          e instanceof Anthropic.RateLimitError
            ? "The AI service is busy; try again shortly"
            : e instanceof Anthropic.AuthenticationError
              ? "The AI service is not authorised; check the configured key"
              : e instanceof Anthropic.APIError
                ? `The AI service returned an error (${e.status ?? "network"})`
                : "The AI service could not be reached";
        return { status: "failed", error, inputTokens: 0, outputTokens: 0 };
      }
    },
  };
}

/** Deterministic provider for tests: returns queued results in order. */
export function scriptedProvider(results: AiResult<unknown>[]): AiProvider & {
  calls: AiRequest<unknown>[];
} {
  const calls: AiRequest<unknown>[] = [];
  return {
    name: "scripted",
    model: "scripted",
    calls,
    async run<T>(req: AiRequest<T>) {
      calls.push(req as AiRequest<unknown>);
      const next = results.shift();
      if (!next)
        return { status: "failed", error: "no scripted result", inputTokens: 0, outputTokens: 0 };
      if (next.status === "succeeded") {
        const parsed = req.schema.safeParse(next.data);
        if (!parsed.success)
          return { status: "failed", error: "schema mismatch", inputTokens: 0, outputTokens: 0 };
        return { ...next, data: parsed.data };
      }
      return next as AiResult<T>;
    },
  };
}
