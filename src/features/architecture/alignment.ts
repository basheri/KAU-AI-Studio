/** Deterministic alignment checks. Mirrors `public.alignment_defects`; the database result is authoritative. */
export const ELEMENT_TYPES = [
  "program_outcome",
  "course",
  "course_outcome",
  "activity",
  "assessment",
  "source_evidence",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export interface ArchElement {
  key: string;
  type: ElementType;
  parent_key: string | null;
  code: string;
  label_ar: string;
  label_en: string;
  /** Extra data kept with the element: course specification (details.spec) or assessment weight. */
  details?: ElementDetails;
}
export interface ElementDetails {
  spec?: import("./spec").CourseSpec;
  weight?: number;
}
export interface ArchMapping {
  from: string;
  to: string;
}

/** Allowed mapping directions (from → to). */
export const MAPPING_RULES: readonly [ElementType, ElementType][] = [
  ["program_outcome", "course"],
  ["program_outcome", "course_outcome"],
  ["course_outcome", "activity"],
  ["course_outcome", "assessment"],
  ["activity", "assessment"],
  ["source_evidence", "program_outcome"],
];

export const DEFECT_TYPES = [
  "orphaned_program_outcome",
  "duplicate_outcome",
  "course_outcome_without_parent",
  "outcome_without_assessment",
] as const;
export type DefectType = (typeof DEFECT_TYPES)[number];
export interface Defect {
  type: DefectType;
  key: string;
  code: string;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function checkAlignment(elements: ArchElement[], mappings: ArchMapping[]): Defect[] {
  const byKey = new Map(elements.map((e) => [e.key, e]));
  const typeOf = (k: string) => byKey.get(k)?.type;
  const has = (from: string, toType: ElementType) =>
    mappings.some((m) => m.from === from && typeOf(m.to) === toType);
  const targets = (from: string, toType: ElementType) =>
    mappings.filter((m) => m.from === from && typeOf(m.to) === toType).map((m) => m.to);

  const coAssessed = (co: string) =>
    has(co, "assessment") || targets(co, "activity").some((a) => has(a, "assessment"));

  const defects: Defect[] = [];
  const add = (type: DefectType, e: ArchElement) =>
    defects.push({ type, key: e.key, code: e.code });

  elements.forEach((e, i) => {
    if (e.type === "program_outcome" && !has(e.key, "course") && !has(e.key, "course_outcome"))
      add("orphaned_program_outcome", e);
    if (e.type === "program_outcome" || e.type === "course_outcome") {
      const dup = elements
        .slice(0, i)
        .some(
          (p) =>
            p.type === e.type &&
            (e.type === "program_outcome" || p.parent_key === e.parent_key) &&
            ((norm(e.label_en) !== "" && norm(p.label_en) === norm(e.label_en)) ||
              (norm(e.label_ar) !== "" && norm(p.label_ar) === norm(e.label_ar))),
        );
      if (dup) add("duplicate_outcome", e);
    }
    if (
      e.type === "course_outcome" &&
      !mappings.some((m) => m.to === e.key && typeOf(m.from) === "program_outcome")
    )
      add("course_outcome_without_parent", e);
    if (e.type === "course_outcome" && !coAssessed(e.key)) add("outcome_without_assessment", e);
    if (e.type === "program_outcome" && !targets(e.key, "course_outcome").some(coAssessed))
      add("outcome_without_assessment", e);
  });

  const order = (d: Defect) => DEFECT_TYPES.indexOf(d.type);
  const pos = (d: Defect) => elements.findIndex((e) => e.key === d.key);
  return defects.sort((a, b) => order(a) - order(b) || pos(a) - pos(b));
}
