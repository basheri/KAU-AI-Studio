import type { ArchElement, ArchMapping } from "./alignment";

const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v as object)
            .sort()
            .map((key) => [key, stable((v as Record<string, unknown>)[key])]),
        )
      : v;

/**
 * Key-independent form of an architecture, matching what `save_architecture` stores
 * (positions instead of keys, trimmed text, empty details dropped). Equal forms mean nothing to save.
 */
export function architectureForm(elements: ArchElement[], mappings: ArchMapping[]): string {
  const pos = new Map(elements.map((e, i) => [e.key, i]));
  const els = elements.map((e) => ({
    type: e.type,
    parent: e.parent_key ? (pos.get(e.parent_key) ?? null) : null,
    code: e.code.trim(),
    ar: e.label_ar.trim(),
    en: e.label_en.trim(),
    details: e.details && Object.keys(e.details).length ? stable(e.details) : null,
  }));
  const maps = [
    ...new Set(mappings.map((m) => `${pos.get(m.from) ?? "?"}>${pos.get(m.to) ?? "?"}`)),
  ].sort();
  return JSON.stringify({ els, maps });
}
