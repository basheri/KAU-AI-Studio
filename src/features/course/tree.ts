// Course tree model, safe tree operations and deterministic validation.
// Validation mirrors public.course_content_defects for live hints; the database gate is authoritative.
import {
  APPROVED_EMBED_HOSTS,
  embedHost,
  isHttpUrl,
  isMediaBlock,
  type AnyPayload,
  type BlockType,
  type Lang,
  type PayloadMap,
} from "./blocks";

export type Block<T extends BlockType = BlockType> = {
  key: string;
  type: T;
  lang: Lang | null;
  payload: PayloadMap[T];
};
export type LessonNode = {
  key: string;
  title_ar: string;
  title_en: string;
  lang: Lang | null;
  blocks: Block[];
};
export type ModuleNode = {
  key: string;
  title_ar: string;
  title_en: string;
  lang: Lang | null;
  lessons: LessonNode[];
};
export type CourseTree = {
  title_ar: string;
  title_en: string;
  lang: Lang | null;
  modules: ModuleNode[];
};

export type MediaInfo = {
  kind: "image" | "audio" | "video";
  title: string;
  source_url: string;
  rights_note: string;
};
export type ValidationContext = { outcomeCodes: Set<string>; media: Map<string, MediaInfo> };

export const DEFECT_CODES = [
  "missing_title",
  "missing_language",
  "no_lessons",
  "empty_payload",
  "invalid_heading_hierarchy",
  "missing_alt_text",
  "missing_transcript",
  "missing_captions",
  "invalid_embed_domain",
  "kc_missing_answer",
  "kc_missing_feedback",
  "outcome_link_missing",
  "reference_url_invalid",
  "media_metadata_incomplete",
] as const;
export type DefectCode = (typeof DEFECT_CODES)[number];
export type Defect = {
  severity: "critical" | "warning";
  code: DefectCode;
  module?: string;
  lesson?: string;
  block?: string;
};

export const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Moves the item at `index` by `delta`, clamped to the list; returns a new array. */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = Math.max(0, Math.min(list.length - 1, index + delta));
  if (index < 0 || index >= list.length || to === index) return [...list];
  const out = [...list];
  const [it] = out.splice(index, 1);
  out.splice(to, 0, it as T);
  return out;
}

export function duplicateBlock(b: Block): Block {
  return { ...b, key: newKey(), payload: structuredClone(b.payload) };
}

const blank = (s: string | undefined | null) => !s || s.trim() === "";
const titleMissing = (n: { title_ar: string; title_en: string; lang: Lang | null }) =>
  n.lang === "ar"
    ? blank(n.title_ar)
    : n.lang === "en"
      ? blank(n.title_en)
      : blank(n.title_ar + n.title_en);

function isEmpty(b: Block): boolean {
  const p = b.payload as AnyPayload & Record<string, unknown>;
  switch (b.type) {
    case "rich_text":
      return blank((p as PayloadMap["rich_text"]).text);
    case "image":
    case "audio":
    case "video":
      return (p as { media_id: string | null }).media_id === null;
    case "embed":
      return blank((p as PayloadMap["embed"]).url);
    case "knowledge_check": {
      const k = p as PayloadMap["knowledge_check"];
      return blank(k.question) || k.choices.filter((c) => !blank(c)).length < 2;
    }
    case "scenario": {
      const s = p as PayloadMap["scenario"];
      return blank(s.prompt) || !s.branches.some((x) => !blank(x.choice));
    }
    case "rubric": {
      const r = p as PayloadMap["rubric"];
      return !r.criteria.length || r.criteria.some((c) => blank(c.name) || !c.levels.length);
    }
    case "glossary": {
      const g = p as PayloadMap["glossary"];
      return !g.terms.length || g.terms.some((t) => blank(t.term) || blank(t.definition));
    }
    case "references": {
      const r = p as PayloadMap["references"];
      return !r.items.length || r.items.some((i) => blank(i.title) || blank(i.author));
    }
  }
}

export function contentDefects(tree: CourseTree, ctx: ValidationContext): Defect[] {
  const out: Defect[] = [];
  const crit = (code: DefectCode, at: Omit<Defect, "severity" | "code"> = {}) =>
    out.push({ severity: "critical", code, ...at });
  if (!tree.lang) crit("missing_language");
  if (titleMissing(tree)) crit("missing_title");
  if (!tree.modules.some((m) => m.lessons.length)) crit("no_lessons");
  for (const m of tree.modules) {
    if (!m.lang) crit("missing_language", { module: m.key });
    if (titleMissing(m)) crit("missing_title", { module: m.key });
    for (const l of m.lessons) {
      const at = { module: m.key, lesson: l.key };
      if (!l.lang) crit("missing_language", at);
      if (titleMissing(l)) crit("missing_title", at);
      let last = 2;
      for (const b of l.blocks) {
        const bat = { ...at, block: b.key };
        if (!b.lang) crit("missing_language", bat);
        if (isEmpty(b)) crit("empty_payload", bat);
        const p = b.payload as never as Record<string, unknown>;
        if (b.type === "rich_text") {
          for (const line of String(p["text"]).split("\n")) {
            const h = /^(#{1,6})\s/.exec(line);
            if (!h) continue;
            const lvl = (h[1] ?? "").length;
            if (lvl < 3 || lvl > last + 1) {
              crit("invalid_heading_hierarchy", bat);
              break;
            }
            last = lvl;
          }
        } else if (b.type === "image" && !p["decorative"] && blank(p["alt"] as string))
          crit("missing_alt_text", bat);
        else if (b.type === "audio" && blank(p["transcript"] as string))
          crit("missing_transcript", bat);
        else if (
          b.type === "video" &&
          blank(p["captions_url"] as string) &&
          blank(p["transcript"] as string)
        )
          crit("missing_captions", bat);
        else if (
          b.type === "embed" &&
          !blank(p["url"] as string) &&
          !APPROVED_EMBED_HOSTS.includes(embedHost(p["url"] as string) ?? "")
        )
          crit("invalid_embed_domain", bat);
        else if (b.type === "knowledge_check") {
          const k = p as never as PayloadMap["knowledge_check"];
          if (k.correct_index === null) crit("kc_missing_answer", bat);
          if (blank(k.feedback_correct) || blank(k.feedback_incorrect))
            crit("kc_missing_feedback", bat);
          if (blank(k.outcome_code) || !ctx.outcomeCodes.has(k.outcome_code.trim()))
            crit("outcome_link_missing", bat);
        } else if (b.type === "references") {
          const r = p as never as PayloadMap["references"];
          if (r.items.some((i) => !blank(i.url) && !isHttpUrl(i.url.trim())))
            crit("reference_url_invalid", bat);
        }
        if (isMediaBlock(b.type) && typeof p["media_id"] === "string") {
          const m2 = ctx.media.get(p["media_id"]);
          if (m2 && (blank(m2.source_url) || blank(m2.rights_note)))
            out.push({ severity: "warning", code: "media_metadata_incomplete", ...bat });
        }
      }
    }
  }
  return out;
}

/** Strips client keys for the save RPC. */
export function toRpcTree(t: CourseTree) {
  return {
    title_ar: t.title_ar,
    title_en: t.title_en,
    lang: t.lang ?? "",
    modules: t.modules.map((m) => ({
      title_ar: m.title_ar,
      title_en: m.title_en,
      lang: m.lang ?? "",
      lessons: m.lessons.map((l) => ({
        title_ar: l.title_ar,
        title_en: l.title_en,
        lang: l.lang ?? "",
        blocks: l.blocks.map((b) => ({ type: b.type, lang: b.lang ?? "", payload: b.payload })),
      })),
    })),
  };
}
