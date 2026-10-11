import type { AiBadgeKind } from "./AiParts";

// Mirrors public.brief_ai_pending and public.gate_ai_review (migration 0009) for live UI hints.
// The database stays authoritative; change both together.

const BRIEF_ORDER = [
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
];

type Field = { provenance?: string | null; ar_prov?: string; en_prov?: string };

export function briefAiPending(fields: Record<string, Field>): string[] {
  return BRIEF_ORDER.filter((k) => {
    const x = fields[k];
    return (
      !!x &&
      (x.provenance === "AI_draft" ||
        x.ar_prov === "AI_translation" ||
        x.en_prov === "AI_translation")
    );
  });
}

const langBadge = (p?: string): AiBadgeKind | null =>
  p === "AI_translation"
    ? "translation"
    : p === "AI_translation_accepted"
      ? "translationAccepted"
      : null;

export function fieldAiBadges(x: Field): {
  field: AiBadgeKind | null;
  ar: AiBadgeKind | null;
  en: AiBadgeKind | null;
} {
  return {
    field:
      x.provenance === "AI_draft" ? "draft" : x.provenance === "AI_accepted" ? "accepted" : null,
    ar: langBadge(x.ar_prov),
    en: langBadge(x.en_prov),
  };
}

type El = { type: string; details?: { spec?: { references?: { verified?: boolean }[] } } };

export function unverifiedReferenceCount(elements: El[]): number {
  return elements
    .filter((e) => e.type === "course")
    .reduce(
      (n, e) => n + (e.details?.spec?.references ?? []).filter((r) => r.verified !== true).length,
      0,
    );
}
