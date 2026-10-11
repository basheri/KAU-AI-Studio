import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { aiExplainAlignment, aiSuggestProgramOutcomes } from "@/features/ai/ai.functions";
import { AiError, AiPanel } from "@/features/ai/AiParts";
import { recordAiOutcome } from "@/features/ai/api";
import { translateMissing, type Translation } from "@/features/ai/translate";
import type { ArchElement, ArchMapping, Defect } from "./alignment";
import { lastIndexWhere } from "./spec";

const k = (s: string) => s as MessageKey;

type Plo = { code: string; ar: string; en: string; domain: string };

/** Architecture-wide AI help. Everything is a suggestion inserted into the unsaved editor state. */
export function ArchitectureAi({
  versionId,
  elements,
  mappings,
  defects,
  setElements,
}: {
  versionId: string;
  elements: ArchElement[];
  mappings: ArchMapping[];
  defects: Defect[];
  setElements: Dispatch<SetStateAction<ArchElement[]>>;
}) {
  const { t } = useLocale();
  const [plos, setPlos] = useState<{ requestId: string; items: Plo[] } | null>(null);
  const [labels, setLabels] = useState<{ ids: string[]; items: Translation[] } | null>(null);
  const existing = elements.filter((e) => e.type === "program_outcome");
  const codeOf = (key: string) => elements.find((e) => e.key === key)?.code ?? "";

  const suggest = useMutation({
    mutationFn: () =>
      aiSuggestProgramOutcomes({
        data: {
          versionId,
          existing: existing.map((e) => ({ code: e.code, ar: e.label_ar, en: e.label_en })),
        },
      }),
    onSuccess: (r) => setPlos({ requestId: r.requestId, items: r.outcomes }),
  });
  const explain = useMutation({
    mutationFn: () =>
      aiExplainAlignment({
        data: {
          versionId,
          defects: defects.map((d) => ({ defect: d.type, code: d.code })),
          elements: elements.map((e) => ({
            code: e.code,
            type: e.type,
            label: e.label_en || e.label_ar,
          })),
          mappings: mappings.map((m) => ({ from: codeOf(m.from), to: codeOf(m.to) })),
        },
      }),
  });
  const translate = useMutation({
    mutationFn: () =>
      translateMissing(
        versionId,
        elements.map((e) => ({ id: e.key, ar: e.label_ar, en: e.label_en })),
      ),
    onSuccess: (r) => setLabels({ ids: r.requestIds, items: r.translations }),
  });

  const insertPlos = () => {
    if (!plos) return;
    const taken = new Set(existing.map((e) => e.code));
    const add: ArchElement[] = plos.items
      .filter((p) => p.code.trim() && !taken.has(p.code))
      .map((p) => ({
        key: `n-${crypto.randomUUID()}`,
        type: "program_outcome",
        parent_key: null,
        code: p.code.trim().slice(0, 40),
        label_ar: p.ar,
        label_en: p.en,
      }));
    setElements((xs) => {
      const at = lastIndexWhere(xs, (e) => e.type === "program_outcome");
      return [...xs.slice(0, at + 1), ...add, ...xs.slice(at + 1)];
    });
    void recordAiOutcome(plos.requestId, "accepted").catch(() => {});
    setPlos(null);
  };
  const applyLabels = () => {
    if (!labels) return;
    setElements((xs) =>
      xs.map((e) => {
        const tr = labels.items.filter((x) => x.id === e.key);
        return tr.reduce((acc, x) => ({ ...acc, [`label_${x.lang}`]: x.text }), e);
      }),
    );
    for (const id of labels.ids) void recordAiOutcome(id, "accepted").catch(() => {});
    setLabels(null);
  };
  const busy = suggest.isPending || explain.isPending || translate.isPending;

  return (
    <AiPanel title={t("ai.label")} id="arch-ai">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="chip-btn"
          disabled={busy || !!plos}
          onClick={() => suggest.mutate()}
        >
          {suggest.isPending ? t("ai.working") : t("ai.arch.suggestPlo")}
        </button>
        <button
          type="button"
          className="chip-btn"
          disabled={busy || defects.length === 0}
          onClick={() => explain.mutate()}
        >
          {explain.isPending ? t("ai.working") : t("ai.arch.explain")}
        </button>
        <button
          type="button"
          className="chip-btn"
          disabled={busy || !!labels}
          onClick={() => translate.mutate()}
        >
          {translate.isPending ? t("ai.working") : t("ai.arch.translate")}
        </button>
      </div>
      {plos && (
        <div className="ai-suggestion space-y-2" role="region" aria-label={t("ai.arch.suggestPlo")}>
          <ul className="space-y-2">
            {plos.items.map((p, i) => (
              <li key={i}>
                <span className="font-mono">{p.code}</span> · {t(k(`ai.domain.${p.domain}`))}
                <p lang="ar" dir="rtl">
                  {p.ar}
                </p>
                <p lang="en" dir="ltr">
                  {p.en}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" onClick={insertPlos}>
              {t("ai.insertAll")}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                void recordAiOutcome(plos.requestId, "discarded").catch(() => {});
                setPlos(null);
              }}
            >
              {t("ai.discard")}
            </button>
          </div>
        </div>
      )}
      {explain.data && (
        <ul className="ai-suggestion space-y-2" role="status">
          {explain.data.explanations.map((x, i) => (
            <li key={i}>
              <span className="font-mono">{x.code}</span>
              <p lang="ar" dir="rtl">
                {x.ar}
              </p>
              <p lang="en" dir="ltr">
                {x.en}
              </p>
            </li>
          ))}
        </ul>
      )}
      {labels && (
        <div className="ai-suggestion space-y-2" role="region" aria-label={t("ai.arch.translated")}>
          <p className="text-sm font-medium">{t("ai.arch.translated")}</p>
          <ul className="space-y-1 text-sm">
            {labels.items.map((x) => (
              <li key={`${x.id}-${x.lang}`}>
                <span className="font-mono">{codeOf(x.id) || "—"}</span>:{" "}
                <span lang={x.lang} dir={x.lang === "ar" ? "rtl" : "ltr"}>
                  {x.text}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={!labels.items.length}
              onClick={applyLabels}
            >
              {t("ai.insertAll")}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                for (const id of labels.ids) void recordAiOutcome(id, "discarded").catch(() => {});
                setLabels(null);
              }}
            >
              {t("ai.discard")}
            </button>
          </div>
        </div>
      )}
      <AiError error={suggest.error ?? explain.error ?? translate.error} />
    </AiPanel>
  );
}
