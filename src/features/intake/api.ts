import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ArchElement, ArchMapping } from "@/features/architecture/alignment";
import { extractSourceFile } from "./extract.functions";
import { validateUpload, type BriefFields, type IntakeMode, type ProgramCategory } from "./brief";

// Reads go through RLS (members only); writes only through audited RPCs.

export const structuredArtifactsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["structured-artifacts", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artifacts")
        .select("id, kind, title, created_at, artifact_versions(id, version_number, state)")
        .eq("project_id", projectId)
        .eq("structured", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        ...a,
        versions: [...a.artifact_versions].sort((x, y) => y.version_number - x.version_number),
      }));
    },
  });
export type StructuredArtifact = Awaited<
  ReturnType<NonNullable<ReturnType<typeof structuredArtifactsQuery>["queryFn"]>>
>[number];

export const briefQuery = (versionId: string) =>
  queryOptions({
    queryKey: ["brief", versionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_briefs")
        .select(
          "artifact_version_id, artifact_id, intake_mode, category, fields, assumptions_confirmed_at, source_file_id, source_snapshot_id, source_files(file_name, extraction_status, extraction_error), program_source_snapshots(source_label, snapshot)",
        )
        .eq("artifact_version_id", versionId)
        .single();
      if (error) throw error;
      return { ...data, fields: data.fields as unknown as BriefFields };
    },
  });

export const architectureQuery = (versionId: string) =>
  queryOptions({
    queryKey: ["architecture", versionId],
    queryFn: async () => {
      const [meta, els, maps, defects] = await Promise.all([
        supabase
          .from("program_architectures")
          .select("brief_version_id")
          .eq("artifact_version_id", versionId)
          .single(),
        supabase
          .from("arch_elements")
          .select("id, element_type, parent_id, code, label_ar, label_en")
          .eq("artifact_version_id", versionId)
          .order("position"),
        supabase
          .from("arch_mappings")
          .select("from_id, to_id")
          .eq("artifact_version_id", versionId),
        supabase.rpc("check_architecture_alignment", { _version_id: versionId }),
      ]);
      for (const r of [meta, els, maps, defects]) if (r.error) throw r.error;
      const elements: ArchElement[] = (els.data ?? []).map((e) => ({
        key: e.id,
        type: e.element_type,
        parent_key: e.parent_id,
        code: e.code,
        label_ar: e.label_ar,
        label_en: e.label_en,
      }));
      const mappings: ArchMapping[] = (maps.data ?? []).map((m) => ({
        from: m.from_id,
        to: m.to_id,
      }));
      return {
        briefVersionId: meta.data!.brief_version_id,
        elements,
        mappings,
        serverDefects: defects.data ?? [],
      };
    },
  });

async function rpc<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>;
}

export class UploadRejected extends Error {
  constructor(public reason: "type" | "size" | "empty") {
    super(reason);
  }
}

/** Validates, uploads to the private project folder, registers metadata and runs the deterministic extractor. */
export async function uploadProposal(projectId: string, file: File) {
  const problem = validateUpload(file);
  if (problem) throw new UploadRejected(problem);
  const safe = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "file";
  const path = `${projectId}/${crypto.randomUUID()}/${safe}`;
  const up = await supabase.storage
    .from("project-sources")
    .upload(path, file, { contentType: file.type });
  if (up.error) throw up.error;
  const fileId = await rpc(
    supabase.rpc("register_source_file", {
      _project_id: projectId,
      _storage_path: path,
      _file_name: file.name,
      _mime_type: file.type,
      _size_bytes: file.size,
    }),
  );
  const { status } = await extractSourceFile({ data: { fileId } });
  return { fileId, status };
}

export const createBrief = (args: {
  projectId: string;
  mode: IntakeMode;
  category: ProgramCategory;
  fields: Partial<BriefFields> | Record<string, unknown>;
  sourceFileId?: string;
  snapshot?: Record<string, unknown>;
}) =>
  rpc(
    supabase.rpc("create_program_brief", {
      _project_id: args.projectId,
      _mode: args.mode,
      _category: args.category,
      _fields: args.fields as Json,
      ...(args.sourceFileId ? { _source_file_id: args.sourceFileId } : {}),
      ...(args.snapshot ? { _snapshot: args.snapshot as Json } : {}),
    }),
  );

export const updateBrief = (
  versionId: string,
  fields: BriefFields,
  category: ProgramCategory,
  summary: string,
) =>
  rpc(
    supabase.rpc("update_program_brief", {
      _version_id: versionId,
      _fields: fields as unknown as Json,
      _category: category,
      _change_summary: summary,
    }),
  );

export const confirmAssumptions = (versionId: string) =>
  rpc(supabase.rpc("confirm_brief_assumptions", { _version_id: versionId }));

export const createArchitecture = (briefVersionId: string) =>
  rpc(supabase.rpc("create_program_architecture", { _brief_version_id: briefVersionId }));

export const saveArchitecture = (
  versionId: string,
  elements: ArchElement[],
  mappings: ArchMapping[],
  summary: string,
) =>
  rpc(
    supabase.rpc("save_architecture", {
      _version_id: versionId,
      _elements: elements as unknown as Json,
      _mappings: mappings as unknown as Json,
      _change_summary: summary,
    }),
  );
