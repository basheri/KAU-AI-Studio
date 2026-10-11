import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Reads through RLS (members only). Files are produced only by the server functions in exports.functions.ts.

export type ExportFormat = Database["public"]["Enums"]["export_format"];
export type ExportableVersion = {
  artifactId: string;
  title: string;
  kind: "program_architecture" | "course_content";
  versionId: string;
  versionNumber: number;
  state: string;
};

/** For each architecture and course: its approved version and, if newer, its working version. */
export const exportablesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["exportables", projectId],
    queryFn: async (): Promise<ExportableVersion[]> => {
      const { data, error } = await supabase
        .from("artifacts")
        .select("id, title, kind, artifact_versions(id, version_number, state)")
        .eq("project_id", projectId)
        .in("kind", ["program_architecture", "course_content"])
        .order("created_at");
      if (error) throw error;
      const out: ExportableVersion[] = [];
      for (const a of data ?? []) {
        const versions = [...(a.artifact_versions ?? [])].sort(
          (x, y) => y.version_number - x.version_number,
        );
        const approved = versions.find((v) => v.state === "approved");
        const working = versions.find((v) => v.state !== "superseded" && v.state !== "archived");
        for (const v of [approved, working !== approved ? working : undefined]) {
          if (!v) continue;
          out.push({
            artifactId: a.id,
            title: a.title,
            kind: a.kind as ExportableVersion["kind"],
            versionId: v.id,
            versionNumber: v.version_number,
            state: v.state,
          });
        }
      }
      return out;
    },
  });

export const courseElementsQuery = (versionId: string) =>
  queryOptions({
    queryKey: ["export-courses", versionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arch_elements")
        .select("id, code, label_ar, label_en")
        .eq("artifact_version_id", versionId)
        .eq("element_type", "course")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

export type ExportOptions = {
  official: boolean;
  preview: boolean;
  official_problem: string | null;
  preview_problem: string | null;
};
export const exportOptionsQuery = (versionId: string, format: ExportFormat) =>
  queryOptions({
    queryKey: ["export-options", versionId, format],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("export_options", {
        _version_id: versionId,
        _format: format,
      });
      if (error) throw error;
      return data as unknown as ExportOptions;
    },
  });

export const exportHistoryQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["export-history", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("export_records")
        .select(
          "id, created_at, file_name, format, official, lang, version_state, sha256, created_by",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

export async function sha256Hex(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Looks a file's fingerprint up in the export log (only projects the person belongs to). */
export async function findExport(hash: string) {
  const { data, error } = await supabase
    .from("export_records")
    .select("id, created_at, file_name, format, official, version_state")
    .eq("sha256", hash)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export function downloadBase64(base64: string, fileName: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
