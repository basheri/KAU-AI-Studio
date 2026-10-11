import { aiTranslate } from "./ai.functions";

export type BiEntry = { id: string; ar: string; en: string };
export type Translation = { id: string; lang: "ar" | "en"; text: string };

/** Entries that have text in exactly one language, grouped by the language they need. */
export function missingLanguage(entries: BiEntry[]) {
  const toAr = entries
    .filter((e) => e.en.trim() && !e.ar.trim())
    .map((e) => ({ id: e.id, text: e.en }));
  const toEn = entries
    .filter((e) => e.ar.trim() && !e.en.trim())
    .map((e) => ({ id: e.id, text: e.ar }));
  return { toAr, toEn };
}

/** Translates only the missing language of each entry (never overwrites); returns suggestions. */
export async function translateMissing(versionId: string, entries: BiEntry[]) {
  const { toAr, toEn } = missingLanguage(entries);
  const out: Translation[] = [];
  const requestIds: string[] = [];
  for (const [target, items] of [
    ["ar", toAr],
    ["en", toEn],
  ] as const) {
    for (let i = 0; i < items.length; i += 80) {
      const r = await aiTranslate({ data: { versionId, target, items: items.slice(i, i + 80) } });
      requestIds.push(r.requestId);
      out.push(...r.items.map((x) => ({ id: x.id, lang: target, text: x.text })));
    }
  }
  return { translations: out, requestIds };
}
