import type { ReactNode } from "react";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import type { MediaRecord } from "./api";
import type { Lang, PayloadMap } from "./blocks";
import type { Block } from "./tree";

const dirOf = (l: Lang | null) => (l === "ar" ? "rtl" : l === "en" ? "ltr" : undefined);

function Text({
  id,
  label,
  value,
  onChange,
  lang,
  multiline,
  readOnly,
  hint,
}: {
  id: string;
  label: MessageKey;
  value: string;
  onChange: (v: string) => void;
  lang: Lang | null;
  multiline?: boolean;
  readOnly?: boolean;
  hint?: MessageKey;
}) {
  const { t } = useLocale();
  const common = {
    id,
    className: "field-input",
    value,
    readOnly,
    lang: lang ?? undefined,
    dir: dirOf(lang),
    "aria-describedby": hint ? `${id}-hint` : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="field-label">
        {t(label)}
      </label>
      {multiline ? <textarea rows={4} {...common} /> : <input {...common} />}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {t(hint)}
        </p>
      )}
    </div>
  );
}

function SmallBtn({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="btn-link text-sm" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function BlockFields({
  block,
  onChange,
  readOnly,
  media,
  outcomes,
}: {
  block: Block;
  onChange: (payload: Block["payload"]) => void;
  readOnly: boolean;
  media: MediaRecord[];
  outcomes: { code: string; label: string }[];
}) {
  const { t } = useLocale();
  const id = (s: string) => `b-${block.key}-${s}`;
  const L = block.lang;
  const p = block.payload as never as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => onChange({ ...p, ...patch } as never);
  const T = (
    key: string,
    label: MessageKey,
    extra: { multiline?: boolean; hint?: MessageKey } = {},
  ) => (
    <Text
      id={id(key)}
      label={label}
      value={String(p[key] ?? "")}
      onChange={(v) => set({ [key]: v })}
      lang={L}
      readOnly={readOnly}
      {...extra}
    />
  );

  switch (block.type) {
    case "rich_text":
      return T("text", "cs.text", { multiline: true, hint: "cs.textHint" });
    case "image":
    case "audio":
    case "video": {
      const options = media.filter((m) => m.kind === block.type);
      const chosen = media.find((m) => m.id === p["media_id"]);
      return (
        <div className="space-y-3">
          <div>
            <label htmlFor={id("media")} className="field-label">
              {t("cs.media")}
            </label>
            <select
              id={id("media")}
              className="field-input"
              value={(p["media_id"] as string) ?? ""}
              disabled={readOnly}
              onChange={(e) => set({ media_id: e.target.value || null })}
            >
              <option value="">{t("cs.mediaNone")}</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            {chosen && (!chosen.source_url || !chosen.rights_note.trim()) && (
              <p className="notice notice-warn mt-2">{t("cs.mediaIncomplete")}</p>
            )}
          </div>
          {block.type === "image" && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(p["decorative"])}
                  disabled={readOnly}
                  onChange={(e) => set({ decorative: e.target.checked })}
                />
                {t("cs.decorative")}
              </label>
              {T("alt", "cs.alt")}
              {T("caption", "cs.caption")}
            </>
          )}
          {block.type === "audio" && T("transcript", "cs.transcript", { multiline: true })}
          {block.type === "video" && (
            <>
              {T("captions_url", "cs.captionsUrl")}
              {T("transcript", "cs.transcript", { multiline: true })}
            </>
          )}
        </div>
      );
    }
    case "embed":
      return (
        <div className="space-y-3">
          {T("url", "cs.embedUrl")}
          {T("title", "cs.embedTitle")}
        </div>
      );
    case "knowledge_check": {
      const k = p as never as PayloadMap["knowledge_check"];
      return (
        <div className="space-y-3">
          {T("question", "cs.question", { multiline: true })}
          <fieldset className="space-y-2">
            <legend className="field-label">{t("cs.correct")}</legend>
            {k.choices.map((c, i) => (
              <div key={i} className="flex items-end gap-2">
                <input
                  type="radio"
                  name={id("correct")}
                  aria-label={`${t("cs.correct")} ${i + 1}`}
                  checked={k.correct_index === i}
                  disabled={readOnly}
                  onChange={() => set({ correct_index: i })}
                  className="mb-3"
                />
                <Text
                  id={id(`choice-${i}`)}
                  label="cs.choice"
                  value={c}
                  lang={L}
                  readOnly={readOnly}
                  onChange={(v) => set({ choices: k.choices.map((x, j) => (j === i ? v : x)) })}
                />
                {!readOnly && k.choices.length > 2 && (
                  <SmallBtn
                    onClick={() =>
                      set({
                        choices: k.choices.filter((_, j) => j !== i),
                        correct_index:
                          k.correct_index === null || k.correct_index === i
                            ? null
                            : k.correct_index > i
                              ? k.correct_index - 1
                              : k.correct_index,
                      })
                    }
                  >
                    {t("cs.remove")}
                  </SmallBtn>
                )}
              </div>
            ))}
            {!readOnly && k.choices.length < 10 && (
              <SmallBtn onClick={() => set({ choices: [...k.choices, ""] })}>
                {t("cs.addChoice")}
              </SmallBtn>
            )}
          </fieldset>
          <div className="flex flex-col gap-3 sm:flex-row">
            {T("feedback_correct", "cs.feedbackCorrect")}
            {T("feedback_incorrect", "cs.feedbackIncorrect")}
          </div>
          <div>
            <label htmlFor={id("outcome")} className="field-label">
              {t("cs.outcome")}
            </label>
            <select
              id={id("outcome")}
              className="field-input"
              value={k.outcome_code}
              disabled={readOnly}
              onChange={(e) => set({ outcome_code: e.target.value })}
            >
              <option value="">—</option>
              {outcomes.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }
    case "scenario": {
      const s = p as never as PayloadMap["scenario"];
      const upd = (i: number, patch: Partial<PayloadMap["scenario"]["branches"][number]>) =>
        set({ branches: s.branches.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
      return (
        <div className="space-y-3">
          {T("prompt", "cs.prompt", { multiline: true })}
          {s.branches.map((b, i) => (
            <fieldset
              key={i}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end"
            >
              <legend className="px-1 text-xs text-muted-foreground">
                {t("cs.branch")} {i + 1}
              </legend>
              <Text
                id={id(`br-${i}-c`)}
                label="cs.choice"
                value={b.choice}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { choice: v })}
              />
              <Text
                id={id(`br-${i}-f`)}
                label="cs.feedback"
                value={b.feedback}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { feedback: v })}
              />
              {!readOnly && (
                <SmallBtn onClick={() => set({ branches: s.branches.filter((_, j) => j !== i) })}>
                  {t("cs.remove")}
                </SmallBtn>
              )}
            </fieldset>
          ))}
          {!readOnly && (
            <SmallBtn
              onClick={() => set({ branches: [...s.branches, { choice: "", feedback: "" }] })}
            >
              {t("cs.addBranch")}
            </SmallBtn>
          )}
        </div>
      );
    }
    case "rubric": {
      const r = p as never as PayloadMap["rubric"];
      const crit = (i: number, c: PayloadMap["rubric"]["criteria"][number]) =>
        set({ criteria: r.criteria.map((x, j) => (j === i ? c : x)) });
      return (
        <div className="space-y-3">
          {r.criteria.map((c, i) => (
            <fieldset key={i} className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-xs text-muted-foreground">
                {t("cs.criterion")} {i + 1}
              </legend>
              <Text
                id={id(`cr-${i}`)}
                label="cs.criterion"
                value={c.name}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => crit(i, { ...c, name: v })}
              />
              {c.levels.map((lv, k) => {
                const lvl = (patch: Partial<typeof lv>) =>
                  crit(i, {
                    ...c,
                    levels: c.levels.map((x, j) => (j === k ? { ...x, ...patch } : x)),
                  });
                return (
                  <div key={k} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Text
                      id={id(`cr-${i}-${k}-l`)}
                      label="cs.level"
                      value={lv.label}
                      lang={L}
                      readOnly={readOnly}
                      onChange={(v) => lvl({ label: v })}
                    />
                    <div className="w-24">
                      <label htmlFor={id(`cr-${i}-${k}-p`)} className="field-label">
                        {t("cs.points")}
                      </label>
                      <input
                        id={id(`cr-${i}-${k}-p`)}
                        type="number"
                        className="field-input"
                        value={lv.points}
                        readOnly={readOnly}
                        onChange={(e) =>
                          lvl({
                            points: Number.isFinite(e.target.valueAsNumber)
                              ? e.target.valueAsNumber
                              : 0,
                          })
                        }
                      />
                    </div>
                    <Text
                      id={id(`cr-${i}-${k}-d`)}
                      label="cs.description"
                      value={lv.description}
                      lang={L}
                      readOnly={readOnly}
                      onChange={(v) => lvl({ description: v })}
                    />
                    {!readOnly && (
                      <SmallBtn
                        onClick={() =>
                          crit(i, { ...c, levels: c.levels.filter((_, j) => j !== k) })
                        }
                      >
                        {t("cs.remove")}
                      </SmallBtn>
                    )}
                  </div>
                );
              })}
              {!readOnly && (
                <div className="flex flex-wrap gap-3">
                  <SmallBtn
                    onClick={() =>
                      crit(i, {
                        ...c,
                        levels: [...c.levels, { label: "", points: 0, description: "" }],
                      })
                    }
                  >
                    {t("cs.addLevel")}
                  </SmallBtn>
                  <SmallBtn onClick={() => set({ criteria: r.criteria.filter((_, j) => j !== i) })}>
                    {t("cs.remove")}
                  </SmallBtn>
                </div>
              )}
            </fieldset>
          ))}
          {!readOnly && (
            <SmallBtn
              onClick={() =>
                set({
                  criteria: [
                    ...r.criteria,
                    { name: "", levels: [{ label: "", points: 1, description: "" }] },
                  ],
                })
              }
            >
              {t("cs.addCriterion")}
            </SmallBtn>
          )}
        </div>
      );
    }
    case "glossary": {
      const g = p as never as PayloadMap["glossary"];
      const upd = (i: number, patch: Partial<PayloadMap["glossary"]["terms"][number]>) =>
        set({ terms: g.terms.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
      return (
        <div className="space-y-3">
          {g.terms.map((x, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Text
                id={id(`g-${i}-t`)}
                label="cs.term"
                value={x.term}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { term: v })}
              />
              <Text
                id={id(`g-${i}-d`)}
                label="cs.definition"
                value={x.definition}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { definition: v })}
              />
              {!readOnly && (
                <SmallBtn onClick={() => set({ terms: g.terms.filter((_, j) => j !== i) })}>
                  {t("cs.remove")}
                </SmallBtn>
              )}
            </div>
          ))}
          {!readOnly && (
            <SmallBtn onClick={() => set({ terms: [...g.terms, { term: "", definition: "" }] })}>
              {t("cs.addTerm")}
            </SmallBtn>
          )}
        </div>
      );
    }
    case "references": {
      const r = p as never as PayloadMap["references"];
      const upd = (i: number, patch: Partial<PayloadMap["references"]["items"][number]>) =>
        set({ items: r.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
      return (
        <div className="space-y-3">
          {r.items.map((x, i) => (
            <fieldset
              key={i}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              <legend className="px-1 text-xs text-muted-foreground">{i + 1}</legend>
              <Text
                id={id(`r-${i}-a`)}
                label="cs.author_"
                value={x.author}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { author: v })}
              />
              <Text
                id={id(`r-${i}-t`)}
                label="cs.refTitle"
                value={x.title}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { title: v })}
              />
              <Text
                id={id(`r-${i}-y`)}
                label="cs.year"
                value={x.year}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { year: v })}
              />
              <Text
                id={id(`r-${i}-p`)}
                label="cs.publisher"
                value={x.publisher}
                lang={L}
                readOnly={readOnly}
                onChange={(v) => upd(i, { publisher: v })}
              />
              <Text
                id={id(`r-${i}-u`)}
                label="cs.url"
                value={x.url}
                lang="en"
                readOnly={readOnly}
                onChange={(v) => upd(i, { url: v })}
              />
              {!readOnly && (
                <SmallBtn onClick={() => set({ items: r.items.filter((_, j) => j !== i) })}>
                  {t("cs.remove")}
                </SmallBtn>
              )}
            </fieldset>
          ))}
          {!readOnly && (
            <SmallBtn
              onClick={() =>
                set({
                  items: [...r.items, { author: "", title: "", year: "", publisher: "", url: "" }],
                })
              }
            >
              {t("cs.addReference")}
            </SmallBtn>
          )}
        </div>
      );
    }
  }
}
