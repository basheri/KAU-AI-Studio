/** Canonical Program Brief model. Mirrors `public.brief_blank()` / intake RPCs; the database is authoritative. */
export const PROGRAM_CATEGORIES = [
  "micro_credential",
  "academic_program",
  "professional_program",
] as const;
export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number];

export const INTAKE_MODES = ["guided_idea", "document_upload", "redevelopment"] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

export const PROVENANCE = ["manual", "extracted", "imported", "AI_draft"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const BRIEF_FIELDS = [
  "title",
  "rationale",
  "target_learners",
  "delivery_mode",
  "duration_credits",
  "intended_outcomes",
  "assumptions",
  "required_sources",
  "stakeholders",
  "risks",
  "category",
] as const;
export type BriefFieldKey = (typeof BRIEF_FIELDS)[number];

export interface BriefField {
  ar: string;
  en: string;
  provenance: Provenance | null;
  source_ref: string | null;
}
export type BriefFields = Record<BriefFieldKey, BriefField>;

export function normalizeBriefFields(
  input: Partial<Record<BriefFieldKey, Partial<BriefField>>> = {},
): BriefFields {
  const out = {} as BriefFields;
  for (const k of BRIEF_FIELDS) {
    const f = input[k] ?? {};
    out[k] = {
      ar: f.ar ?? "",
      en: f.en ?? "",
      provenance: f.provenance ?? null,
      source_ref: f.source_ref ?? null,
    };
  }
  return out;
}

/** Upload rules — must match `public.register_source_file`. */
export const UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;
/** Types the deterministic extractor can read; others are recorded as "unsupported", never as success. */
export const EXTRACTABLE_TYPES = ["text/plain", "text/markdown"] as const;

export function validateUpload(file: {
  type: string;
  size: number;
}): "type" | "size" | "empty" | null {
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > UPLOAD_LIMIT_BYTES) return "size";
  return null;
}

const LABELS: Record<string, BriefFieldKey> = {
  title: "title",
  "program title": "title",
  العنوان: "title",
  "عنوان البرنامج": "title",
  rationale: "rationale",
  المبررات: "rationale",
  "target learners": "target_learners",
  "المتعلمون المستهدفون": "target_learners",
  "delivery mode": "delivery_mode",
  "نمط التقديم": "delivery_mode",
  duration: "duration_credits",
  credits: "duration_credits",
  "duration/credits": "duration_credits",
  المدة: "duration_credits",
  "الساعات المعتمدة": "duration_credits",
  outcomes: "intended_outcomes",
  "intended outcomes": "intended_outcomes",
  المخرجات: "intended_outcomes",
  "مخرجات التعلم": "intended_outcomes",
  assumptions: "assumptions",
  الافتراضات: "assumptions",
  sources: "required_sources",
  "required sources": "required_sources",
  evidence: "required_sources",
  المصادر: "required_sources",
  stakeholders: "stakeholders",
  "أصحاب المصلحة": "stakeholders",
  risks: "risks",
  المخاطر: "risks",
};

/**
 * Deterministic extraction stub: reads "Label: value" lines (English or Arabic labels).
 * Indented lines continue the previous field. Returns {} when nothing is recognised.
 */
export function parseProposalText(text: string): Partial<Record<BriefFieldKey, string>> {
  const out: Partial<Record<BriefFieldKey, string>> = {};
  let last: BriefFieldKey | null = null;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const m = /^([^:：]{1,40})[:：]\s*(.*)$/.exec(raw.trim());
    const key = m ? LABELS[m[1]!.trim().toLowerCase()] : undefined;
    if (m && key) {
      out[key] = m[2]!.trim();
      last = key;
    } else if (last && /^\s+\S/.test(raw)) {
      out[last] = `${out[last] ?? ""} ${raw.trim()}`.trim();
    } else {
      last = null;
    }
  }
  return out;
}
