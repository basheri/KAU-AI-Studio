import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXTRACTABLE_TYPES, parseProposalText } from "./brief";

export type ExtractionStatus = "succeeded" | "failed" | "unsupported";

/**
 * Deterministic, key-free extraction. The file is read as the signed-in user (storage RLS proves
 * project membership); only the result is recorded with the server-only RPC.
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
      .select("id, storage_path, mime_type, extraction_status")
      .eq("id", data.fileId)
      .single();
    if (file.error || !file.data) throw new Error("Source file not found");
    if (file.data.extraction_status !== "pending")
      return { status: file.data.extraction_status as ExtractionStatus };

    let status: ExtractionStatus;
    let text: string | null = null;
    let fields: Record<string, string> = {};
    let error: string | null = null;
    if ((EXTRACTABLE_TYPES as readonly string[]).includes(file.data.mime_type)) {
      const dl = await context.supabase.storage
        .from("project-sources")
        .download(file.data.storage_path);
      if (dl.error || !dl.data) throw new Error("Could not read the uploaded file");
      text = await dl.data.text();
      fields = parseProposalText(text) as Record<string, string>;
      status = Object.keys(fields).length ? "succeeded" : "failed";
      if (status === "failed") error = "No recognised brief fields";
    } else {
      status = "unsupported";
      error = "Automatic extraction is not available for this file type";
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rec = await supabaseAdmin.rpc("record_source_extraction", {
      _file_id: file.data.id,
      _status: status,
      _text: text ?? "",
      _fields: fields,
      _error: error ?? "",
    });
    if (rec.error) throw new Error("Could not record the extraction result");
    return { status };
  });
