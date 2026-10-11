import type { BlockType } from "@/features/course/blocks";
import type { LessonNode } from "@/features/course/tree";

// Text inside course block payloads that people read (and may be translated). Codes, links,
// media references, flags and numbers are never included, so structure always survives.

const SKIP = new Set([
  "media_id",
  "url",
  "captions_url",
  "outcome_code",
  "correct_index",
  "decorative",
  "points",
  "year",
]);

export function blockStrings(
  _type: BlockType,
  payload: unknown,
  base = "",
): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (v: unknown, path: string, key: string) => {
    if (SKIP.has(key)) return;
    if (typeof v === "string") {
      if (v.trim()) out.push({ path, text: v });
    } else if (Array.isArray(v))
      v.forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i), key));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, k);
  };
  walk(payload, base, "");
  return out;
}

export function applyStrings<T>(payload: T, map: Record<string, string>): T {
  const rec = (v: unknown, path: string): unknown => {
    if (typeof v === "string") return path in map ? map[path] : v;
    if (Array.isArray(v)) return v.map((x, i) => rec(x, path ? `${path}.${i}` : String(i)));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, rec(x, path ? `${path}.${k}` : k)]),
      );
    return v;
  };
  return rec(payload, "") as T;
}

export function lessonText(lesson: LessonNode): string {
  const title =
    lesson.lang === "ar" ? lesson.title_ar || lesson.title_en : lesson.title_en || lesson.title_ar;
  return [
    title,
    ...lesson.blocks.map((b) =>
      blockStrings(b.type, b.payload)
        .map((s) => s.text)
        .join("\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 30000);
}
