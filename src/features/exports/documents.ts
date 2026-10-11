import { translate, type MessageKey } from "@/features/i18n/locale";
import type { ArchElement, ArchMapping } from "@/features/architecture/alignment";
import type { CourseSpec } from "@/features/architecture/spec";
import type { DocBlock, DocLang, DocSpec } from "./docx";

// Builds the export documents from an architecture version. Pure functions: the server loads the data
// (as the signed-in user) and turns the result into a .docx with buildDocx.

type Bi = { ar: string; en: string };
export interface ArchitectureExport {
  title: string;
  versionNumber: number;
  brief: Record<string, Partial<Bi>> | null;
  elements: ArchElement[];
  mappings: ArchMapping[];
}
export interface ExportMeta {
  exportId: string;
  official: boolean;
  lang: DocLang;
  createdAt: Date;
}

const NONE = "—";
const tr = (lang: DocLang) => (key: string) => translate(lang, key as MessageKey);
/** The text in the export language, falling back to the other language. */
export const pick = (lang: DocLang, ar?: string | null, en?: string | null) => {
  const [a, b] = lang === "ar" ? [ar, en] : [en, ar];
  return (a ?? "").trim() || (b ?? "").trim();
};
const label = (lang: DocLang, e: ArchElement | undefined) =>
  e ? pick(lang, e.label_ar, e.label_en) || e.code || NONE : NONE;
const withCode = (lang: DocLang, e: ArchElement) =>
  [e.code, pick(lang, e.label_ar, e.label_en)].filter(Boolean).join(" — ") || NONE;

export function stamp(meta: ExportMeta, versionNumber: number) {
  const t = tr(meta.lang);
  const date = meta.createdAt.toISOString().slice(0, 10);
  return {
    header: meta.official ? undefined : t("ex.doc.previewBanner"),
    footer: `${t("ex.doc.ref")} ${meta.exportId} · ${t("ex.doc.version")} ${versionNumber} · ${date} · ${
      meta.official ? t("ex.doc.official") : t("ex.doc.preview")
    }`,
  };
}

function graph(data: ArchitectureExport) {
  const byKey = new Map(data.elements.map((e) => [e.key, e]));
  const from = (key: string, type: ArchElement["type"]) =>
    data.mappings
      .filter((m) => m.to === key && byKey.get(m.from)?.type === type)
      .map((m) => byKey.get(m.from)!);
  const to = (key: string, type: ArchElement["type"]) =>
    data.mappings
      .filter((m) => m.from === key && byKey.get(m.to)?.type === type)
      .map((m) => byKey.get(m.to)!);
  const children = (key: string, type: ArchElement["type"]) =>
    data.elements.filter((e) => e.parent_key === key && e.type === type);
  return { byKey, from, to, children };
}

export const courseElements = (data: ArchitectureExport) =>
  data.elements.filter((e) => e.type === "course");

/** Course specification, following the section structure of the NCAAA course specification. */
export function courseSpecDoc(
  data: ArchitectureExport,
  courseKey: string,
  meta: ExportMeta,
): DocSpec {
  const { lang } = meta;
  const t = tr(lang);
  const g = graph(data);
  const course = g.byKey.get(courseKey);
  if (!course || course.type !== "course") throw new Error("Course not found");
  const spec = (course.details?.spec ?? {}) as CourseSpec;
  const clos = g.children(course.key, "course_outcome");
  const assessments = g.children(course.key, "assessment");
  const programTitle =
    pick(lang, data.brief?.["title"]?.ar, data.brief?.["title"]?.en) || data.title;
  const comma = lang === "ar" ? "، " : ", ";
  const join = (xs: ArchElement[]) => xs.map((x) => x.code || label(lang, x)).join(comma) || NONE;
  const joinLabels = (xs: ArchElement[]) =>
    xs.map((x) => label(lang, x)).join(lang === "ar" ? "؛ " : "; ") || NONE;
  const total = assessments.reduce((n, a) => n + (Number(a.details?.weight) || 0), 0);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  const blocks: DocBlock[] = [
    { t: "p", text: t("ex.doc.basedOn"), muted: true },
    { t: "h", level: 1, text: t("ex.doc.A") },
    {
      t: "table",
      head: [],
      rows: [
        [t("ex.doc.courseTitle"), label(lang, course)],
        [t("ex.doc.courseCode"), course.code || NONE],
        [t("ex.doc.program"), programTitle],
        [t("ex.doc.creditHours"), spec.credit_hours != null ? String(spec.credit_hours) : NONE],
        [
          t("ex.doc.prerequisites"),
          pick(lang, spec.prerequisites_ar, spec.prerequisites_en) || NONE,
        ],
      ],
    },
    { t: "h", level: 2, text: t("ex.doc.description") },
    { t: "p", text: pick(lang, spec.description_ar, spec.description_en) || NONE },
    { t: "h", level: 2, text: t("ex.doc.objectives") },
    (spec.objectives ?? []).length
      ? { t: "ul", items: (spec.objectives ?? []).map((o) => pick(lang, o.ar, o.en) || NONE) }
      : { t: "p", text: NONE },
    { t: "h", level: 2, text: t("ex.doc.teaching") },
    { t: "p", text: pick(lang, spec.teaching_ar, spec.teaching_en) || NONE },

    { t: "h", level: 1, text: t("ex.doc.B") },
    {
      t: "table",
      head: [
        t("ex.doc.code"),
        t("ex.doc.clo"),
        t("ex.doc.plo"),
        t("ex.doc.strategies"),
        t("ex.doc.assessment"),
      ],
      rows: clos.map((c) => [
        c.code || NONE,
        pick(lang, c.label_ar, c.label_en) || NONE,
        join(g.from(c.key, "program_outcome")),
        joinLabels(g.to(c.key, "activity")),
        joinLabels(g.to(c.key, "assessment")),
      ]),
    },

    { t: "h", level: 1, text: t("ex.doc.C") },
    {
      t: "table",
      head: [t("ex.doc.no"), t("ex.doc.topic"), t("ex.doc.weeks"), t("ex.doc.clos")],
      rows: (spec.topics ?? []).map((x, i) => [
        String(i + 1),
        pick(lang, x.ar, x.en) || NONE,
        x.weeks != null ? String(x.weeks) : NONE,
        (x.outcomes ?? []).join(comma) || NONE,
      ]),
    },

    { t: "h", level: 1, text: t("ex.doc.D") },
    {
      t: "table",
      head: [t("ex.doc.no"), t("ex.doc.activity"), t("ex.doc.clos"), t("ex.doc.weight")],
      rows: [
        ...assessments.map((a, i) => [
          String(i + 1),
          label(lang, a),
          join(g.from(a.key, "course_outcome")),
          a.details?.weight != null ? `${fmt(Number(a.details.weight))}%` : NONE,
        ]),
        ["", t("ex.doc.total"), "", `${fmt(total)}%`],
      ],
    },

    { t: "h", level: 1, text: t("ex.doc.E") },
    (spec.references ?? []).length
      ? {
          t: "ul",
          items: (spec.references ?? []).map(
            (r) => r.citation.trim() + (r.verified ? "" : ` (${t("ex.doc.unverified")})`),
          ),
        }
      : { t: "p", text: NONE },

    { t: "h", level: 1, text: t("ex.doc.F") },
    {
      t: "table",
      head: [t("ex.doc.area"), t("ex.doc.assessor"), t("ex.doc.method")],
      rows: ["ex.doc.F1", "ex.doc.F2", "ex.doc.F3", "ex.doc.F4"].map((k) => [t(k), "", ""]),
    },
    { t: "p", text: t("ex.doc.byDepartment"), muted: true },

    { t: "h", level: 1, text: t("ex.doc.G") },
    {
      t: "table",
      head: [t("ex.doc.council"), t("ex.doc.refNo"), t("ex.doc.date")],
      rows: [["", "", ""]],
    },
  ];
  return {
    lang,
    title: `${t("ex.doc.specTitle")}: ${withCode(lang, course)}`,
    blocks,
    ...stamp(meta, data.versionNumber),
  };
}

const BRIEF_ROWS = [
  "rationale",
  "target_learners",
  "delivery_mode",
  "duration_credits",
  "intended_outcomes",
] as const;

/** Program summary for councils: overview, outcomes, courses and the outcome-to-course matrix. */
export function programSummaryDoc(data: ArchitectureExport, meta: ExportMeta): DocSpec {
  const { lang } = meta;
  const t = tr(lang);
  const g = graph(data);
  const plos = data.elements.filter((e) => e.type === "program_outcome");
  const courses = courseElements(data);
  const covers = (plo: ArchElement, course: ArchElement) =>
    g.to(plo.key, "course").some((c) => c.key === course.key) ||
    g.to(plo.key, "course_outcome").some((c) => c.parent_key === course.key);
  const title = pick(lang, data.brief?.["title"]?.ar, data.brief?.["title"]?.en) || data.title;

  const blocks: DocBlock[] = [
    { t: "h", level: 1, text: t("ex.doc.overview") },
    {
      t: "table",
      head: [],
      rows: BRIEF_ROWS.map((k) => [
        t(`bf.${k}`),
        pick(lang, data.brief?.[k]?.ar, data.brief?.[k]?.en) || NONE,
      ]),
    },
    { t: "h", level: 1, text: t("ex.doc.plos") },
    plos.length ? { t: "ul", items: plos.map((p) => withCode(lang, p)) } : { t: "p", text: NONE },
    { t: "h", level: 1, text: t("ex.doc.courses") },
    {
      t: "table",
      head: [
        t("ex.doc.courseCode"),
        t("ex.doc.courseTitle"),
        t("ex.doc.creditHours"),
        t("ex.doc.clos"),
      ],
      rows: courses.map((c) => {
        const spec = (c.details?.spec ?? {}) as CourseSpec;
        return [
          c.code || NONE,
          pick(lang, c.label_ar, c.label_en) || NONE,
          spec.credit_hours != null ? String(spec.credit_hours) : NONE,
          String(g.children(c.key, "course_outcome").length),
        ];
      }),
    },
    { t: "h", level: 1, text: t("ex.doc.matrix") },
    {
      t: "table",
      head: [t("ex.doc.plo"), ...courses.map((c) => c.code || label(lang, c))],
      rows: plos.map((p) => [
        p.code || label(lang, p),
        ...courses.map((c) => (covers(p, c) ? "✓" : "")),
      ]),
    },
  ];
  return {
    lang,
    title: `${t("ex.doc.summaryTitle")}: ${title}`,
    blocks,
    ...stamp(meta, data.versionNumber),
  };
}
