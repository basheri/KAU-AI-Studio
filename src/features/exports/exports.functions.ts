import { createServerFn } from "@tanstack/react-start";
import * as z from "zod/v4";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { ArchElement, ArchMapping } from "@/features/architecture/alignment";
import type { BlockType, Lang, PayloadMap } from "@/features/course/blocks";
import type { CourseTree, MediaInfo } from "@/features/course/tree";
import { bytesToBase64 } from "@/features/ai/base64";
import { buildDocx } from "./docx";
import { courseSpecDoc, programSummaryDoc, type ArchitectureExport } from "./documents";
import { buildScorm } from "./scorm";

// Server boundary for exports. Content is read as the signed-in user (RLS proves membership);
// the file is built here, fingerprinted, and logged through the service-role record_export,
// which re-checks every export rule. A file is returned only after it is logged.

type Sb = import("@supabase/supabase-js").SupabaseClient<Database>;
type Ctx = { supabase: Sb; userId: string };
type Format = Database["public"]["Enums"]["export_format"];

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const validate =
  <S extends z.ZodType>(schema: S) =>
  (input: unknown): z.infer<S> => {
    const r = schema.safeParse(input);
    if (!r.success) throw new Error("Invalid request");
    return r.data;
  };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function sha256(bytes: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ASCII-only file name part (codes are usually Latin; anything else is dropped). */
const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "export";

async function versionInfo(ctx: Ctx, versionId: string) {
  const v = await ctx.supabase
    .from("artifact_versions")
    .select("id, project_id, version_number, state, artifacts!inner(title, kind)")
    .eq("id", versionId)
    .single();
  if (v.error || !v.data) throw new Error("Version not found");
  const a = v.data.artifacts as unknown as { title: string; kind: string };
  return { ...v.data, title: a.title, kind: a.kind };
}

async function loadArchitecture(ctx: Ctx, versionId: string): Promise<ArchitectureExport> {
  const info = await versionInfo(ctx, versionId);
  const [arch, els, maps] = await Promise.all([
    ctx.supabase
      .from("program_architectures")
      .select("brief_version_id")
      .eq("artifact_version_id", versionId)
      .single(),
    ctx.supabase
      .from("arch_elements")
      .select("id, element_type, parent_id, code, label_ar, label_en, details")
      .eq("artifact_version_id", versionId)
      .order("position"),
    ctx.supabase
      .from("arch_mappings")
      .select("from_id, to_id")
      .eq("artifact_version_id", versionId),
  ]);
  for (const r of [arch, els, maps]) if (r.error) throw new Error("Architecture not found");
  const brief = await ctx.supabase
    .from("program_briefs")
    .select("fields")
    .eq("artifact_version_id", arch.data!.brief_version_id)
    .maybeSingle();
  const elements: ArchElement[] = (els.data ?? []).map((e) => ({
    key: e.id,
    type: e.element_type,
    parent_key: e.parent_id,
    code: e.code,
    label_ar: e.label_ar,
    label_en: e.label_en,
    ...(e.details && Object.keys(e.details as object).length
      ? { details: e.details as NonNullable<ArchElement["details"]> }
      : {}),
  }));
  const mappings: ArchMapping[] = (maps.data ?? []).map((m) => ({ from: m.from_id, to: m.to_id }));
  return {
    title: info.title,
    versionNumber: info.version_number,
    brief: (brief.data?.fields as ArchitectureExport["brief"]) ?? null,
    elements,
    mappings,
  };
}

async function loadCourse(ctx: Ctx, versionId: string) {
  const info = await versionInfo(ctx, versionId);
  const cc = await ctx.supabase
    .from("course_contents")
    .select("*")
    .eq("artifact_version_id", versionId)
    .single();
  if (cc.error || !cc.data) throw new Error("Course content not found");
  const [nodes, blocks, media] = await Promise.all([
    ctx.supabase
      .from("course_nodes")
      .select("*")
      .eq("artifact_version_id", versionId)
      .order("position"),
    ctx.supabase
      .from("content_blocks")
      .select("*")
      .eq("artifact_version_id", versionId)
      .order("position"),
    ctx.supabase
      .from("media_assets")
      .select("id, kind, title, source_url, rights_note")
      .eq("project_id", cc.data.project_id),
  ]);
  for (const r of [nodes, blocks, media]) if (r.error) throw new Error("Course content not found");
  const lang = (l: string | null) => (l === "ar" || l === "en" ? (l as Lang) : null);
  const tree: CourseTree = {
    title_ar: cc.data.title_ar,
    title_en: cc.data.title_en,
    lang: lang(cc.data.lang),
    modules: nodes
      .data!.filter((n) => n.node_type === "module")
      .map((m) => ({
        key: m.id,
        title_ar: m.title_ar,
        title_en: m.title_en,
        lang: lang(m.lang),
        lessons: nodes
          .data!.filter((l) => l.parent_id === m.id)
          .map((l) => ({
            key: l.id,
            title_ar: l.title_ar,
            title_en: l.title_en,
            lang: lang(l.lang),
            blocks: blocks
              .data!.filter((b) => b.lesson_id === l.id)
              .map((b) => ({
                key: b.id,
                type: b.block_type as BlockType,
                lang: lang(b.lang),
                payload: b.payload as unknown as PayloadMap[BlockType],
              })),
          })),
      })),
  };
  const mediaMap = new Map<string, MediaInfo>(
    (media.data ?? []).map((m) => [m.id, m as unknown as MediaInfo]),
  );
  return { info, tree, media: mediaMap, courseCode: cc.data.course_code };
}

async function finish(
  ctx: Ctx,
  args: {
    id: string;
    versionId: string;
    format: Format;
    targetKey: string;
    official: boolean;
    lang: Lang;
    fileName: string;
    bytes: Uint8Array;
    mime: string;
  },
) {
  const hash = await sha256(args.bytes);
  const rec = await (
    await admin()
  ).rpc("record_export", {
    _id: args.id,
    _user_id: ctx.userId,
    _version_id: args.versionId,
    _format: args.format,
    _target_key: args.targetKey,
    _official: args.official,
    _lang: args.lang,
    _file_name: args.fileName,
    _sha256: hash,
    _byte_size: args.bytes.byteLength,
  });
  if (rec.error) throw new Error(rec.error.message || "The export could not be recorded");
  return {
    exportId: args.id,
    fileName: args.fileName,
    mime: args.mime,
    sha256: hash,
    base64: bytesToBase64(args.bytes),
  };
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const common = { versionId: uuid, lang: z.enum(["ar", "en"]), official: z.boolean() };

export const exportArchitectureDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    validate(
      z.object({
        ...common,
        format: z.enum(["course_spec_docx", "program_summary_docx"]),
        courseKey: uuid.optional(),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    const arch = await loadArchitecture(context, data.versionId);
    const id = crypto.randomUUID();
    const meta = { exportId: id, official: data.official, lang: data.lang, createdAt: new Date() };
    const suffix = `${data.lang}-v${arch.versionNumber}${data.official ? "" : "-preview"}.docx`;
    let doc, fileName, targetKey;
    if (data.format === "course_spec_docx") {
      if (!data.courseKey) throw new Error("Invalid request");
      doc = courseSpecDoc(arch, data.courseKey, meta);
      const code = arch.elements.find((e) => e.key === data.courseKey)?.code ?? "";
      fileName = `${slug(code)}-course-specification-${suffix}`;
      targetKey = data.courseKey;
    } else {
      doc = programSummaryDoc(arch, meta);
      fileName = `${slug(arch.title)}-program-summary-${suffix}`;
      targetKey = "";
    }
    return finish(context, {
      id,
      versionId: data.versionId,
      format: data.format,
      targetKey,
      official: data.official,
      lang: data.lang,
      fileName,
      bytes: buildDocx(doc, meta.createdAt),
      mime: DOCX,
    });
  });

export const exportScormPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate(z.object(common)))
  .handler(async ({ data, context }) => {
    const c = await loadCourse(context, data.versionId);
    const id = crypto.randomUUID();
    const bytes = buildScorm(c.tree, c.media, {
      exportId: id,
      official: data.official,
      lang: data.lang,
      createdAt: new Date(),
      versionNumber: c.info.version_number,
      courseCode: c.courseCode,
    });
    return finish(context, {
      id,
      versionId: data.versionId,
      format: "scorm12",
      targetKey: c.courseCode,
      official: data.official,
      lang: data.lang,
      fileName: `${slug(c.courseCode)}-scorm12-${data.lang}-v${c.info.version_number}${
        data.official ? "" : "-preview"
      }.zip`,
      bytes,
      mime: "application/zip",
    });
  });
