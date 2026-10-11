// Course specification stored on the architecture's course element (details.spec).
// Mirrors public.course_spec_problem (migration 0009) for live UI hints; the database is authoritative.

export type Bi = { ar: string; en: string };
export type SpecTopic = Bi & { weeks?: number; outcomes?: string[] };
export type SpecReference = { citation: string; verified: boolean };
export interface CourseSpec {
  description_ar?: string;
  description_en?: string;
  prerequisites_ar?: string;
  prerequisites_en?: string;
  teaching_ar?: string;
  teaching_en?: string;
  credit_hours?: number;
  objectives?: Bi[];
  topics?: SpecTopic[];
  references?: SpecReference[];
}

const TEXT_KEYS = [
  "description_ar",
  "description_en",
  "prerequisites_ar",
  "prerequisites_en",
  "teaching_ar",
  "teaching_en",
] as const;
const LIST_KEYS = ["objectives", "topics", "references"] as const;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const optStr = (v: unknown) => v === undefined || typeof v === "string";

export function specProblem(spec: CourseSpec | undefined | null): string | null {
  if (spec == null) return null;
  if (!isObj(spec)) return "Course specification must be an object";
  const s = spec as Record<string, unknown>;
  for (const k of Object.keys(s))
    if (![...TEXT_KEYS, ...LIST_KEYS, "credit_hours"].includes(k as never))
      return `Unknown course specification field ${k}`;
  for (const k of TEXT_KEYS)
    if (k in s && (typeof s[k] !== "string" || (s[k] as string).length > 5000))
      return `Invalid ${k}`;
  if ("credit_hours" in s) {
    const c = s["credit_hours"];
    if (typeof c !== "number" || c < 0 || c > 30)
      return "Credit hours must be a number from 0 to 30";
  }
  for (const k of LIST_KEYS)
    if (k in s && (!Array.isArray(s[k]) || (s[k] as unknown[]).length > 60)) return `Invalid ${k}`;
  const biOk = (x: unknown) =>
    isObj(x) &&
    optStr(x["ar"]) &&
    optStr(x["en"]) &&
    `${x["ar"] ?? ""}${x["en"] ?? ""}`.length <= 2000;
  if (!((s["objectives"] as unknown[] | undefined) ?? []).every(biOk)) return "Invalid objective";
  for (const x of (s["topics"] as unknown[] | undefined) ?? []) {
    if (!biOk(x)) return "Invalid topic";
    const t = x as Record<string, unknown>;
    if ("weeks" in t && !(typeof t["weeks"] === "number" && t["weeks"] >= 0 && t["weeks"] <= 30))
      return "Invalid topic";
    if ("outcomes" in t && !Array.isArray(t["outcomes"])) return "Invalid topic";
  }
  for (const x of (s["references"] as unknown[] | undefined) ?? []) {
    if (
      !isObj(x) ||
      typeof x["citation"] !== "string" ||
      x["citation"].trim().length < 1 ||
      x["citation"].trim().length > 1000 ||
      typeof x["verified"] !== "boolean"
    )
      return "Invalid reference";
  }
  return null;
}

export function assessmentWeightTotal(assessments: { details?: { weight?: number } }[]): number {
  return assessments.reduce((n, a) => n + (Number(a.details?.weight) || 0), 0);
}

// ----- Outcome wording checks (deterministic hints, no AI) -----

const VAGUE_EN = [
  "understand",
  "know",
  "appreciate",
  "learn",
  "comprehend",
  "grasp",
  "realize",
  "be aware",
  "be familiar",
  "become familiar",
];
const VAGUE_AR = [
  "يفهم",
  "يعرف",
  "يدرك",
  "يقدر",
  "يتعرف",
  "يلم",
  "يستوعب",
  "فهم",
  "معرفة",
  "إدراك",
];
const BLOOM_EN = [
  "apply",
  "analyze",
  "analyse",
  "evaluate",
  "design",
  "create",
  "explain",
  "describe",
  "compare",
  "compute",
  "calculate",
  "construct",
  "develop",
  "demonstrate",
  "identify",
  "interpret",
  "justify",
  "solve",
  "implement",
  "assess",
  "critique",
  "formulate",
  "plan",
  "present",
  "write",
  "classify",
  "differentiate",
  "summarize",
  "summarise",
  "define",
  "list",
];
const BLOOM_AR = [
  "يطبق",
  "يحلل",
  "يقيم",
  "يصمم",
  "ينشئ",
  "يشرح",
  "يصف",
  "يقارن",
  "يحسب",
  "يبني",
  "يطور",
  "يوضح",
  "يحدد",
  "يفسر",
  "يبرر",
  "يحل",
  "ينفذ",
  "يصوغ",
  "يخطط",
  "يعرض",
  "يكتب",
  "يصنف",
  "يميز",
  "يلخص",
];

const stripAr = (s: string) => s.replace(/[ً-ْٰ]/g, "");
const enWords = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? [];
const arWords = (s: string): string[] => stripAr(s).match(/[ء-ي]+/g) ?? [];

export type OutcomeIssue = { kind: "vague"; word: string } | { kind: "multi" } | { kind: "short" };

export function outcomeIssues(en: string, ar: string): OutcomeIssue[] {
  const ew = enWords(en);
  const aw = arWords(ar);
  const enText = ` ${ew.join(" ")} `;
  const vagueEn = VAGUE_EN.find((v) => enText.includes(` ${v} `));
  if (vagueEn) return [{ kind: "vague", word: vagueEn }];
  const vagueAr = VAGUE_AR.find((v) => aw.includes(v));
  if (vagueAr) return [{ kind: "vague", word: vagueAr }];
  const bloomEn = new Set(ew.filter((w) => BLOOM_EN.includes(w)));
  const bloomAr = new Set(aw.filter((w) => BLOOM_AR.includes(w)));
  if (bloomEn.size > 1 || bloomAr.size > 1) return [{ kind: "multi" }];
  if ((en.trim() || ar.trim()) && Math.max(ew.length, aw.length) < 2) return [{ kind: "short" }];
  return [];
}

/** Index of the last item matching the predicate, or -1 (Array.findLastIndex needs ES2023). */
export function lastIndexWhere<T>(xs: readonly T[], pred: (x: T) => boolean): number {
  for (let i = xs.length - 1; i >= 0; i--) if (pred(xs[i]!)) return i;
  return -1;
}
