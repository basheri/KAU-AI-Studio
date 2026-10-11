import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bytesToBase64 } from "@/features/ai/base64";
import { AiError, parseAiConfig, providerFor, runAi } from "@/features/ai/engine";
import { proposalExtractSchema } from "@/features/ai/schemas";
import { EXTRACTABLE_TYPES, parseProposalText } from "./brief";
import { docxToText } from "./docx";

export type ExtractionStatus = "succeeded" | "failed" | "unsupported";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Proposal extraction. The file is read as the signed-in user (storage RLS proves project
 * membership); only the result is recorded with the server-only RPC.
 * 1. Deterministic first: TXT/MD as text, DOCX via its document XML, then "Label: value" parsing.
 * 2. If that finds nothing (or the file is a PDF) and AI is enabled, AI maps the content to the
 *    brief fields with page numbers; those fields become AI drafts, never "extracted".
 */
export const extractSourceFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input?.fileId ?? "")) throw new Error("Invalid file id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const file = await context.supabase
      .from("source_files")
      .select("id, project_id, storage_path, mime_type, extraction_status")
      .eq("id", data.fileId)
      .single();
    if (file.error || !file.data) throw new Error("Source file not found");
    if (file.data.extraction_status !== "pending")
      return { status: file.data.extraction_status as ExtractionStatus };

    const cfg = parseAiConfig({
      AI_ENABLED: process.env["AI_ENABLED"],
      ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
      AI_MODEL: process.env["AI_MODEL"],
      AI_DAILY_LIMIT: process.env["AI_DAILY_LIMIT"],
    });
    const mime = file.data.mime_type;
    const readable = (EXTRACTABLE_TYPES as readonly string[]).includes(mime);
    const isPdf = mime === "application/pdf";

    let status: ExtractionStatus = "unsupported";
    let text: string | null = null;
    let fields: Record<string, unknown> = {};
    let error: string | null = "Automatic extraction is not available for this file type";
    let method: "deterministic" | "ai" = "deterministic";
    let requestId: string | null = null;

    if (readable || (isPdf && cfg.enabled)) {
      const dl = await context.supabase.storage
        .from("project-sources")
        .download(file.data.storage_path);
      if (dl.error || !dl.data) throw new Error("Could not read the uploaded file");
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      try {
        if (mime === DOCX) text = docxToText(bytes);
        else if (readable) text = new TextDecoder().decode(bytes);
      } catch (e) {
        text = null;
        error = e instanceof Error ? e.message : "The file could not be read";
      }
      if (text !== null) {
        fields = parseProposalText(text);
        status = Object.keys(fields).length ? "succeeded" : "failed";
        error = status === "failed" ? "No recognised brief fields" : null;
      } else if (readable) {
        status = "failed";
      }

      if (status !== "succeeded" && cfg.enabled && (text?.trim() || isPdf)) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const res = await runAi({
            admin: supabaseAdmin,
            provider: providerFor(cfg),
            dailyLimit: cfg.dailyLimit,
            userId: context.userId,
            projectId: file.data.project_id,
            feature: "proposal_extract",
            input: text?.trim()
              ? { document_text: text.slice(0, 150000) }
              : { document: "attached" },
            schema: proposalExtractSchema,
            attachment: isPdf ? { kind: "pdf", base64: bytesToBase64(bytes) } : undefined,
            targetRef: `source_file:${file.data.id}`,
          });
          const mapped: Record<string, string> = {};
          const pages: Record<string, string> = {};
          for (const f of res.data.fields) {
            if (!f.text.trim() || mapped[f.field]) continue;
            mapped[f.field] = f.text.trim().slice(0, 10000);
            if (f.page && f.page > 0) pages[f.field] = String(f.page);
          }
          method = "ai";
          requestId = res.requestId;
          fields = Object.keys(mapped).length ? { ...mapped, _pages: pages } : {};
          status = Object.keys(mapped).length ? "succeeded" : "failed";
          error = status === "failed" ? "No recognised brief fields" : null;
        } catch (e) {
          if (e instanceof AiError && status === "unsupported") error = e.message;
        }
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rec = await supabaseAdmin.rpc("record_source_extraction", {
      _file_id: file.data.id,
      _status: status,
      _text: text ?? "",
      _fields: fields as never,
      _error: error ?? "",
      _method: method,
      ...(requestId ? { _request_id: requestId } : {}),
    });
    if (rec.error) throw new Error("Could not record the extraction result");
    return { status };
  });
