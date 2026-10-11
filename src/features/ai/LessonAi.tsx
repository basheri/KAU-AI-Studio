import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import type { Lang, PayloadMap } from "@/features/course/blocks";
import type { MediaRecord } from "@/features/course/api";
import { PreviewBlock } from "@/features/course/LearnerPreview";
import { newKey, type Block, type LessonNode } from "@/features/course/tree";
import { aiAltText, aiDraftBlock, aiLearnerCheck, aiTranslate } from "./ai.functions";
import { AiError, AiPanel } from "./AiParts";
import { recordAiOutcome } from "./api";
import { applyStrings, blockStrings, lessonText } from "./blockText";
import { AI_BLOCK_TYPES, type AiBlockType } from "./schemas";

const k = (s: string) => s as MessageKey;

/** AI help for one lesson. Drafts are previewed and only enter the lesson when a person inserts them. */
export function LessonAi({
  versionId,
  lesson,
  outcomes,
  media,
  setBlocks,
}: {
  versionId: string;
  lesson: LessonNode;
  outcomes: { code: string; label: string }[];
  media: MediaRecord[];
  setBlocks: (fn: (bs: Block[]) => Block[]) => void;
}) {
  const { t } = useLocale();
  const title =
    lesson.lang === "ar" ? lesson.title_ar || lesson.title_en : lesson.title_en || lesson.title_ar;
  const [type, setType] = useState<AiBlockType>("rich_text");
  const [lang, setLang] = useState<Lang>(lesson.lang ?? "ar");
  const [outcome, setOutcome] = useState(outcomes[0]?.code ?? "");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<{ requestId: string; block: Block } | null>(null);
  const [target, setTarget] = useState<Lang>(lesson.lang === "ar" ? "en" : "ar");
  const [copies, setCopies] = useState<{
    ids: string[];
    blocks: { after: string; block: Block }[];
  } | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [alts, setAlts] = useState<
    Record<string, { requestId: string; alt_ar: string; alt_en: string }>
  >({});

  const drafting = useMutation({
    mutationFn: () => {
      const o = outcomes.find((x) => x.code === outcome);
      return aiDraftBlock({
        data: {
          versionId,
          blockType: type,
          lang,
          lessonTitle: title.slice(0, 300),
          instruction: instruction.slice(0, 1000),
          outcome: o ? { code: o.code, label: o.label.slice(0, 2000) } : null,
        },
      });
    },
    onSuccess: (r) =>
      setDraft({
        requestId: r.requestId,
        block: { key: newKey(), type, lang, payload: r.payload as PayloadMap[AiBlockType] },
      }),
  });

  const translating = useMutation({
    mutationFn: async () => {
      const sources = lesson.blocks.filter((b) => b.lang !== target);
      const items = sources.flatMap((b) =>
        blockStrings(b.type, b.payload).map((s) => ({
          id: `${b.key}|${s.path}`,
          text: s.text.slice(0, 5000),
        })),
      );
      if (!items.length) return null;
      const map: Record<string, string> = {};
      const ids: string[] = [];
      for (let i = 0; i < items.length; i += 80) {
        const r = await aiTranslate({ data: { versionId, target, items: items.slice(i, i + 80) } });
        ids.push(r.requestId);
        for (const x of r.items) map[x.id] = x.text;
      }
      const blocks = sources
        .filter((b) => blockStrings(b.type, b.payload).some((s) => `${b.key}|${s.path}` in map))
        .map((b) => {
          const own = Object.fromEntries(
            Object.entries(map)
              .filter(([id]) => id.startsWith(`${b.key}|`))
              .map(([id, v]) => [id.slice(b.key.length + 1), v]),
          );
          return {
            after: b.key,
            block: { ...b, key: newKey(), lang: target, payload: applyStrings(b.payload, own) },
          };
        });
      return { ids, blocks };
    },
    onSuccess: (r) => (setAdded(null), setCopies(r ?? { ids: [], blocks: [] })),
  });

  const checking = useMutation({
    mutationFn: () =>
      aiLearnerCheck({
        data: { versionId, lessonTitle: title.slice(0, 300), text: lessonText(lesson) },
      }),
  });
  const altText = useMutation({
    mutationFn: (b: Block<"image">) =>
      aiAltText({ data: { mediaId: b.payload.media_id!, context: title.slice(0, 1000) } }),
    onSuccess: (r, b) => setAlts((a) => ({ ...a, [b.key]: r })),
  });

  const insertDraft = () => {
    if (!draft) return;
    setBlocks((bs) => [...bs, draft.block]);
    void recordAiOutcome(draft.requestId, "accepted").catch(() => {});
    setDraft(null);
  };
  const addCopies = () => {
    if (!copies) return;
    setBlocks((bs) =>
      bs.flatMap((b) => [b, ...copies.blocks.filter((c) => c.after === b.key).map((c) => c.block)]),
    );
    for (const id of copies.ids) void recordAiOutcome(id, "accepted").catch(() => {});
    setAdded(copies.blocks.length);
    setCopies(null);
  };
  const imageBlocks = lesson.blocks.filter(
    (b): b is Block<"image"> =>
      b.type === "image" &&
      !!(b.payload as PayloadMap["image"]).media_id &&
      !(b.payload as PayloadMap["image"]).alt.trim() &&
      !(b.payload as PayloadMap["image"]).decorative,
  );

  return (
    <AiPanel title={t("ai.cs.title")} id={`lesson-ai-${lesson.key}`}>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor="lai-type" className="field-label">
            {t("ai.cs.type")}
          </label>
          <select
            id="lai-type"
            className="field-input"
            value={type}
            onChange={(e) => setType(e.target.value as AiBlockType)}
          >
            {AI_BLOCK_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(k(`block.${x}`))}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lai-lang" className="field-label">
            {t("ai.cs.lang")}
          </label>
          <select
            id="lai-lang"
            className="field-input"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            <option value="ar">{t("ps.ar")}</option>
            <option value="en">{t("ps.en")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="lai-outcome" className="field-label">
            {t("ai.cs.outcome")}
          </label>
          <select
            id="lai-outcome"
            className="field-input"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">{t("ai.cs.noOutcome")}</option>
            {outcomes.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="lai-instruction" className="field-label">
          {t("ai.cs.instruction")}
        </label>
        <textarea
          id="lai-instruction"
          dir="auto"
          rows={2}
          maxLength={1000}
          className="field-input"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={drafting.isPending || !!draft}
        onClick={() => drafting.mutate()}
      >
        {drafting.isPending ? t("ai.working") : t("ai.cs.draft")}
      </button>
      {draft && (
        <div className="ai-suggestion space-y-2" role="region" aria-label={t("ai.cs.preview")}>
          <p className="text-xs font-medium text-muted-foreground">{t("ai.cs.preview")}</p>
          <div lang={draft.block.lang ?? undefined} dir={draft.block.lang === "ar" ? "rtl" : "ltr"}>
            <PreviewBlock block={draft.block} media={media} />
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" onClick={insertDraft}>
              {t("ai.insert")}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                void recordAiOutcome(draft.requestId, "discarded").catch(() => {});
                setDraft(null);
              }}
            >
              {t("ai.discard")}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div>
          <label htmlFor="lai-target" className="field-label">
            {t("ai.cs.translateTo")}
          </label>
          <select
            id="lai-target"
            className="field-input"
            value={target}
            onChange={(e) => setTarget(e.target.value as Lang)}
          >
            <option value="ar">{t("ps.ar")}</option>
            <option value="en">{t("ps.en")}</option>
          </select>
        </div>
        <button
          type="button"
          className="chip-btn"
          disabled={translating.isPending || !!copies}
          onClick={() => translating.mutate()}
        >
          {translating.isPending ? t("ai.working") : t("ai.arch.translate")}
        </button>
        <button
          type="button"
          className="chip-btn"
          disabled={checking.isPending}
          onClick={() => checking.mutate()}
        >
          {checking.isPending ? t("ai.working") : t("ai.cs.check")}
        </button>
      </div>
      {copies &&
        (copies.blocks.length ? (
          <div
            className="ai-suggestion space-y-2"
            role="region"
            aria-label={t("ai.arch.translated")}
          >
            {copies.blocks.map((c) => (
              <div key={c.block.key} lang={target} dir={target === "ar" ? "rtl" : "ltr"}>
                <PreviewBlock block={c.block} media={media} />
              </div>
            ))}
            <div className="flex gap-3">
              <button type="button" className="btn-primary" onClick={addCopies}>
                {t("ai.cs.translateGo")}
              </button>
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  for (const id of copies.ids)
                    void recordAiOutcome(id, "discarded").catch(() => {});
                  setCopies(null);
                }}
              >
                {t("ai.discard")}
              </button>
            </div>
          </div>
        ) : (
          <p role="status" className="text-sm">
            {t("ai.cs.nothingToTranslate")}
          </p>
        ))}
      {added !== null && (
        <p role="status" className="text-sm">
          {added} {t("ai.cs.translated")}
        </p>
      )}
      {checking.data && (
        <div role="status">
          {checking.data.points.length ? (
            <ul className="space-y-2 text-sm">
              {checking.data.points.map((p, i) => (
                <li key={i} className="ai-suggestion" dir="auto">
                  <q>{p.quote}</q>
                  <p>{p.issue}</p>
                  <p className="text-muted-foreground">{p.suggestion}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">{t("ai.cs.clear")}</p>
          )}
        </div>
      )}

      {imageBlocks.length > 0 && (
        <ul className="space-y-2 border-t pt-3 text-sm">
          {imageBlocks.map((b, i) => {
            const s = alts[b.key];
            const m = media.find((x) => x.id === b.payload.media_id);
            return (
              <li key={b.key} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    {t("block.image")} {i + 1}: {m?.title ?? "—"}
                  </span>
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={altText.isPending || !m?.source_url}
                    onClick={() => altText.mutate(b)}
                  >
                    {altText.isPending && altText.variables?.key === b.key
                      ? t("ai.working")
                      : t("ai.cs.altText")}
                  </button>
                </div>
                {s && (
                  <div className="ai-suggestion space-y-1">
                    <p lang="ar" dir="rtl">
                      {s.alt_ar}
                    </p>
                    <p lang="en" dir="ltr">
                      {s.alt_en}
                    </p>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        const alt = b.lang === "en" ? s.alt_en : s.alt_ar;
                        setBlocks((bs) =>
                          bs.map((x) =>
                            x.key === b.key ? { ...x, payload: { ...b.payload, alt } } : x,
                          ),
                        );
                        void recordAiOutcome(s.requestId, "accepted").catch(() => {});
                        setAlts(({ [b.key]: _, ...rest }) => rest);
                      }}
                    >
                      {t("ai.insert")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AiError error={drafting.error ?? translating.error ?? checking.error ?? altText.error} />
    </AiPanel>
  );
}
