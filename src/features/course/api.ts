import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { BlockType, Lang, PayloadMap } from "./blocks";
import { toRpcTree, type CourseTree, type MediaInfo } from "./tree";

// Reads go through RLS (members only); writes only through audited RPCs.

async function rpc<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>;
}

export type MediaRecord = MediaInfo & { id: string };

export const mediaQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["media-assets", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("id, kind, title, source_url, rights_note")
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as MediaRecord[];
    },
  });

/** Latest version of each architecture with zero alignment defects, with its courses. */
export const alignedArchitecturesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["aligned-architectures", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_architectures")
        .select(
          "artifact_version_id, artifact_id, artifacts(title), artifact_versions!program_architectures_artifact_version_id_fkey(version_number, state)",
        )
        .eq("project_id", projectId);
      if (error) throw error;
      const used = await supabase
        .from("course_contents")
        .select("course_code")
        .eq("project_id", projectId);
      if (used.error) throw used.error;
      const taken = new Set((used.data ?? []).map((u) => u.course_code));
      const out: {
        versionId: string;
        label: string;
        courses: { id: string; code: string; label: string }[];
      }[] = [];
      for (const a of data ?? []) {
        const v = a.artifact_versions as unknown as {
          version_number: number;
          state: string;
        } | null;
        if (!v || v.state === "archived" || v.state === "superseded") continue;
        const defects = await supabase.rpc("check_architecture_alignment", {
          _version_id: a.artifact_version_id,
        });
        if (defects.error || (defects.data ?? []).length) continue;
        const els = await supabase
          .from("arch_elements")
          .select("id, code, label_ar, label_en")
          .eq("artifact_version_id", a.artifact_version_id)
          .eq("element_type", "course")
          .order("position");
        if (els.error) throw els.error;
        const free = els.data.filter((e) => !taken.has(e.code));
        if (!free.length) continue;
        out.push({
          versionId: a.artifact_version_id,
          label: `${(a.artifacts as unknown as { title: string } | null)?.title ?? ""} · v${v.version_number}`,
          courses: free.map((e) => ({
            id: e.id,
            code: e.code,
            label: `${e.code} ${e.label_en || e.label_ar}`,
          })),
        });
      }
      return out;
    },
  });

export type CourseData = {
  versionId: string;
  courseCode: string;
  architectureVersionId: string;
  tree: CourseTree;
  outcomes: { code: string; label: string }[];
  serverDefects: {
    severity: string;
    defect: string;
    node_id: string | null;
    block_id: string | null;
  }[];
};

export const courseQuery = (versionId: string) =>
  queryOptions({
    queryKey: ["course-content", versionId],
    queryFn: async (): Promise<CourseData> => {
      const cc = await supabase
        .from("course_contents")
        .select("*")
        .eq("artifact_version_id", versionId)
        .single();
      if (cc.error) throw cc.error;
      const [nodes, blocks, outcomes, defects] = await Promise.all([
        supabase
          .from("course_nodes")
          .select("*")
          .eq("artifact_version_id", versionId)
          .order("position"),
        supabase
          .from("content_blocks")
          .select("*")
          .eq("artifact_version_id", versionId)
          .order("position"),
        supabase
          .from("arch_elements")
          .select("code, label_ar, label_en, element_type, parent_id")
          .eq("artifact_version_id", cc.data.architecture_version_id)
          .in("element_type", ["program_outcome", "course_outcome"])
          .order("position"),
        supabase.rpc("check_course_content", { _version_id: versionId }),
      ]);
      for (const r of [nodes, blocks, outcomes, defects]) if (r.error) throw r.error;
      const lang = (l: string | null) => (l === "ar" || l === "en" ? (l as Lang) : null);
      const modules = nodes.data!.filter((n) => n.node_type === "module");
      const tree: CourseTree = {
        title_ar: cc.data.title_ar,
        title_en: cc.data.title_en,
        lang: lang(cc.data.lang),
        modules: modules.map((m) => ({
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
      return {
        versionId,
        courseCode: cc.data.course_code,
        architectureVersionId: cc.data.architecture_version_id,
        tree,
        outcomes: outcomes
          .data!.filter(
            (o) =>
              o.element_type === "program_outcome" || o.parent_id === cc.data.course_element_id,
          )
          .map((o) => ({ code: o.code, label: `${o.code} ${o.label_en || o.label_ar}` })),
        serverDefects: defects.data ?? [],
      };
    },
  });

export const createCourseContent = (architectureVersionId: string, courseElementId: string) =>
  rpc(
    supabase.rpc("create_course_content", {
      _architecture_version_id: architectureVersionId,
      _course_element_id: courseElementId,
    }),
  );

export const saveCourseContent = (
  versionId: string,
  tree: CourseTree,
  summary: string | null = null,
) =>
  rpc(
    supabase.rpc("save_course_content", {
      _version_id: versionId,
      _tree: toRpcTree(tree) as unknown as Json,
      ...(summary ? { _change_summary: summary } : {}),
    }),
  );

export const registerMedia = (projectId: string, m: Omit<MediaInfo, "kind"> & { kind: string }) =>
  rpc(
    supabase.rpc("register_media_asset", {
      _project_id: projectId,
      _kind: m.kind,
      _title: m.title,
      _source_url: m.source_url,
      _rights_note: m.rights_note,
    }),
  );
