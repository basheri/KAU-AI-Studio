import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { aiCourseSpec, type SpecResult, type SpecStep } from "@/features/ai/ai.functions";
import { AiError, AiPanel } from "@/features/ai/AiParts";
import { recordAiOutcome } from "@/features/ai/api";
import { translateMissing, type Translation } from "@/features/ai/translate";
import type { ArchElement, ArchMapping } from "./alignment";
import {
  assessmentWeightTotal,
  lastIndexWhere,
  outcomeIssues,
  specProblem,
  type Bi,
  type CourseSpec,
  type SpecTopic,
} from "./spec";

const k = (s: string) => s as MessageKey;
const newKey = () => `n-${crypto.randomUUID()}`;
const STEPS: SpecStep[] = [
  "description",
  "objectives",
  "outcomes",
  "topics",
  "assessments",
  "references",
];
const TEXT_FIELDS = [
  ["description", "spec.descriptionAr", "spec.descriptionEn", 4],
  ["prerequisites", "spec.prereqAr", "spec.prereqEn", 1],
  ["teaching", "spec.teachingAr", "spec.teachingEn", 2],
] as const;

type Pending = { step: SpecStep; requestId: string; result: SpecResult };

export function CourseSpecPanel({
  versionId,
  course,
  elements,
  editable,
  setElements,
  setMappings,
}: {
  versionId: string;
  course: ArchElement;
  elements: ArchElement[];
  editable: boolean;
  setElements: Dispatch<SetStateAction<ArchElement[]>>;
  setMappings: Dispatch<SetStateAction<ArchMapping[]>>;
}) {
  const { t, locale } = useLocale();
  const spec: CourseSpec = course.details?.spec ?? {};
  const clos = elements.filter((e) => e.type === "course_outcome" && e.parent_key === course.key);
  const assessments = elements.filter(
    (e) => e.type === "assessment" && e.parent_key === course.key,
  );
  const plos = elements.filter((e) => e.type === "program_outcome");
  const [pending, setPending] = useState<Pending | null>(null);
  const [translations, setTranslations] = useState<{ items: Translation[]; ids: string[] } | null>(
    null,
  );
  const label = (e: ArchElement) =>
    locale === "ar" ? e.label_ar || e.label_en : e.label_en || e.label_ar;
  const toCodeLabel = (e: ArchElement) => ({ code: e.code, ar: e.label_ar, en: e.label_en });

  const setSpec = (patch: Record<string, unknown>) => {
    const next = { ...spec, ...patch } as Record<string, unknown>;
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    setElements((xs) =>
      xs.map((e) =>
        e.key === course.key ? { ...e, details: { ...e.details, spec: next as CourseSpec } } : e,
      ),
    );
  };
  const setWeight = (key: string, weight: number) =>
    setElements((xs) =>
      xs.map((e) => (e.key === key ? { ...e, details: { ...e.details, weight } } : e)),
    );

  const generate = useMutation({
    mutationFn: (step: SpecStep) =>
      aiCourseSpec({
        data: {
          versionId,
          step,
          course: { ...toCodeLabel(course), credit_hours: spec.credit_hours ?? null },
          programOutcomes: plos.map(toCodeLabel),
          courseOutcomes: clos.map(toCodeLabel),
          assessments: assessments.map(toCodeLabel),
          spec: {
            description_ar: spec.description_ar ?? "",
            description_en: spec.description_en ?? "",
          },
          weeks: null,
        },
      }),
    onSuccess: (r) => setPending({ step: r.step, requestId: r.requestId, result: r.result }),
  });
  const translate = useMutation({
    mutationFn: () => {
      const entries = [
        ...TEXT_FIELDS.map(([f]) => ({
          id: f,
          ar: (spec[`${f}_ar` as keyof CourseSpec] as string) ?? "",
          en: (spec[`${f}_en` as keyof CourseSpec] as string) ?? "",
        })),
        ...(spec.objectives ?? []).map((o, i) => ({ id: `objective:${i}`, ...o })),
        ...(spec.topics ?? []).map((o, i) => ({ id: `topic:${i}`, ar: o.ar, en: o.en })),
      ];
      return translateMissing(versionId, entries);
    },
    onSuccess: (r) => setTranslations({ items: r.translations, ids: r.requestIds }),
  });

  const done = (outcome: "accepted" | "discarded") => {
    void recordAiOutcome(pending?.requestId, outcome).catch(() => {});
    setPending(null);
  };

  const insert = () => {
    if (!pending) return;
    const r = pending.result as Record<string, unknown>;
    if (pending.step === "description") setSpec(r as Partial<CourseSpec>);
    if (pending.step === "objectives")
      setSpec({ objectives: [...(spec.objectives ?? []), ...(r["objectives"] as Bi[])] });
    if (pending.step === "topics")
      setSpec({ topics: [...(spec.topics ?? []), ...(r["topics"] as SpecTopic[])] });
    if (pending.step === "references")
      setSpec({
        references: [
          ...(spec.references ?? []),
          ...(r["references"] as { citation: string }[]).map((x) => ({
            citation: x.citation.trim(),
            verified: false,
          })),
        ],
      });
    if (pending.step === "outcomes" || pending.step === "assessments") {
      const isOutcome = pending.step === "outcomes";
      const items = r[isOutcome ? "outcomes" : "assessments"] as {
        code: string;
        ar: string;
        en: string;
        weight?: number;
        program_outcomes?: string[];
        outcomes?: string[];
      }[];
      const taken = new Set((isOutcome ? clos : assessments).map((e) => e.code));
      const added: ArchElement[] = [];
      const maps: ArchMapping[] = [];
      for (const it of items) {
        if (!it.code.trim() || taken.has(it.code)) continue;
        const key = newKey();
        added.push({
          key,
          type: isOutcome ? "course_outcome" : "assessment",
          parent_key: course.key,
          code: it.code.trim().slice(0, 40),
          label_ar: it.ar,
          label_en: it.en,
          ...(isOutcome ? {} : { details: { weight: Number(it.weight) || 0 } }),
        });
        const sources = isOutcome
          ? plos.filter((p) => it.program_outcomes?.includes(p.code))
          : clos.filter((c) => it.outcomes?.includes(c.code));
        for (const s of sources) maps.push({ from: s.key, to: key });
        if (isOutcome) for (const s of sources) maps.push({ from: s.key, to: course.key });
      }
      setElements((xs) => {
        const idx = lastIndexWhere(xs, (e) => e.key === course.key || e.parent_key === course.key);
        return [...xs.slice(0, idx + 1), ...added, ...xs.slice(idx + 1)];
      });
      setMappings((ms) => {
        const seen = new Set(ms.map((m) => `${m.from}>${m.to}`));
        return [...ms, ...maps.filter((m) => !seen.has(`${m.from}>${m.to}`))];
      });
    }
    done("accepted");
  };

  const applyTranslations = () => {
    if (!translations) return;
    const next: CourseSpec = {
      ...spec,
      objectives: [...(spec.objectives ?? [])],
      topics: [...(spec.topics ?? [])],
    };
    for (const tr of translations.items) {
      const [kind, idx] = tr.id.split(":");
      if (kind === "objective" && next.objectives![Number(idx)])
        next.objectives![Number(idx)] = { ...next.objectives![Number(idx)]!, [tr.lang]: tr.text };
      else if (kind === "topic" && next.topics![Number(idx)])
        next.topics![Number(idx)] = { ...next.topics![Number(idx)]!, [tr.lang]: tr.text };
      else if (TEXT_FIELDS.some(([f]) => f === kind))
        (next as Record<string, unknown>)[`${kind}_${tr.lang}`] = tr.text;
    }
    setSpec(next as Record<string, unknown>);
    for (const id of translations.ids) void recordAiOutcome(id, "accepted").catch(() => {});
    setTranslations(null);
  };

  const problem = specProblem(spec);
  const totalWeight = assessmentWeightTotal(assessments);
  const id = (s: string) => `sp-${course.key}-${s}`;

  return (
    <details className="rounded-md border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {t("spec.title")} · {course.code || label(course)}
        {(spec.references ?? []).some((r) => !r.verified) && (
          <span className="ms-2 text-xs font-normal text-destructive">{t("spec.unverified")}</span>
        )}
      </summary>
      <div className="mt-3 space-y-4">
        {editable && (
          <AiPanel title={t("ai.label")} id={id("ai")}>
            <div className="flex flex-wrap gap-2">
              {STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip-btn"
                  disabled={generate.isPending || !!pending}
                  onClick={() => generate.mutate(s)}
                >
                  {generate.isPending && generate.variables === s
                    ? t("ai.working")
                    : t(k(`spec.gen.${s}`))}
                </button>
              ))}
              <button
                type="button"
                className="chip-btn"
                disabled={translate.isPending || !!translations}
                onClick={() => translate.mutate()}
              >
                {translate.isPending ? t("ai.working") : t("ai.arch.translate")}
              </button>
            </div>
            {pending && (
              <SpecSuggestion
                pending={pending}
                onInsert={insert}
                onDiscard={() => done("discarded")}
              />
            )}
            {translations && (
              <div className="ai-suggestion space-y-2">
                <p className="text-sm font-medium">{t("ai.arch.translated")}</p>
                <ul className="space-y-1 text-sm">
                  {translations.items.map((x) => (
                    <li
                      key={`${x.id}-${x.lang}`}
                      lang={x.lang}
                      dir={x.lang === "ar" ? "rtl" : "ltr"}
                    >
                      {x.text}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-3">
                  <button type="button" className="btn-primary" onClick={applyTranslations}>
                    {t("ai.insertAll")}
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      for (const rid of translations.ids)
                        void recordAiOutcome(rid, "discarded").catch(() => {});
                      setTranslations(null);
                    }}
                  >
                    {t("ai.discard")}
                  </button>
                </div>
              </div>
            )}
            <AiError error={generate.error ?? translate.error} />
            {pending?.step === "references" && (
              <p className="text-xs text-muted-foreground">{t("spec.refNote")}</p>
            )}
          </AiPanel>
        )}

        <div className="grid gap-3 md:grid-cols-[10rem_1fr]">
          <div>
            <label htmlFor={id("ch")} className="field-label">
              {t("spec.creditHours")}
            </label>
            <input
              id={id("ch")}
              type="number"
              min={0}
              max={30}
              className="field-input"
              readOnly={!editable}
              value={spec.credit_hours ?? ""}
              onChange={(e) =>
                setSpec(
                  e.target.value === ""
                    ? { credit_hours: undefined }
                    : { credit_hours: Number(e.target.value) },
                )
              }
            />
          </div>
        </div>
        {TEXT_FIELDS.map(([f, ar, en, rows]) => (
          <div key={f} className="grid gap-2 md:grid-cols-2">
            {(
              [
                ["ar", ar],
                ["en", en],
              ] as const
            ).map(([lang, l]) => (
              <div key={lang}>
                <label htmlFor={id(`${f}-${lang}`)} className="field-label">
                  {t(l)}
                </label>
                <textarea
                  id={id(`${f}-${lang}`)}
                  rows={rows}
                  lang={lang}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  className="field-input"
                  readOnly={!editable}
                  value={(spec[`${f}_${lang}` as keyof CourseSpec] as string) ?? ""}
                  onChange={(e) => setSpec({ [`${f}_${lang}`]: e.target.value })}
                />
              </div>
            ))}
          </div>
        ))}

        <BiList
          title={t("spec.objectives")}
          idBase={id("obj")}
          items={spec.objectives ?? []}
          editable={editable}
          onChange={(objectives) => setSpec({ objectives })}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t("spec.topics")}</legend>
          {(spec.topics ?? []).map((tp, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_1fr_6rem_auto]"
            >
              {(["ar", "en"] as const).map((lang) => (
                <input
                  key={lang}
                  aria-label={`${t("spec.topics")} ${i + 1} ${t(k(`spec.${lang}`))}`}
                  className="field-input"
                  lang={lang}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  readOnly={!editable}
                  value={tp[lang]}
                  onChange={(e) =>
                    setSpec({
                      topics: (spec.topics ?? []).map((x, j) =>
                        j === i ? { ...x, [lang]: e.target.value } : x,
                      ),
                    })
                  }
                />
              ))}
              <input
                aria-label={`${t("spec.weeks")} ${i + 1}`}
                type="number"
                min={0}
                max={30}
                className="field-input"
                readOnly={!editable}
                value={tp.weeks ?? ""}
                onChange={(e) =>
                  setSpec({
                    topics: (spec.topics ?? []).map((x, j) =>
                      j === i
                        ? { ...x, weeks: e.target.value === "" ? 0 : Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
              {editable && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setSpec({ topics: (spec.topics ?? []).filter((_, j) => j !== i) })}
                >
                  {t("spec.remove")}
                </button>
              )}
              {clos.length > 0 && (
                <div className="flex flex-wrap gap-x-3 text-xs md:col-span-4">
                  <span className="text-muted-foreground">{t("spec.covers")}:</span>
                  {clos.map((c) => (
                    <label key={c.key} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        disabled={!editable}
                        checked={(tp.outcomes ?? []).includes(c.code)}
                        onChange={(e) =>
                          setSpec({
                            topics: (spec.topics ?? []).map((x, j) =>
                              j !== i
                                ? x
                                : {
                                    ...x,
                                    outcomes: e.target.checked
                                      ? [...(x.outcomes ?? []), c.code]
                                      : (x.outcomes ?? []).filter((o) => o !== c.code),
                                  },
                            ),
                          })
                        }
                      />
                      {c.code}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          {editable && (
            <button
              type="button"
              className="chip-btn"
              onClick={() =>
                setSpec({
                  topics: [...(spec.topics ?? []), { ar: "", en: "", weeks: 1, outcomes: [] }],
                })
              }
            >
              {t("spec.add")}
            </button>
          )}
        </fieldset>

        {assessments.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t("el.assessment")}</legend>
            {assessments.map((a) => (
              <div key={a.key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-24 font-mono">{a.code || "—"}</span>
                <span className="flex-1">{label(a)}</span>
                <label className="inline-flex items-center gap-1">
                  {t("spec.weight")}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="field-input w-24"
                    readOnly={!editable}
                    value={a.details?.weight ?? ""}
                    onChange={(e) => setWeight(a.key, Number(e.target.value) || 0)}
                  />
                </label>
              </div>
            ))}
            <p
              className={
                totalWeight === 100 ? "text-sm text-secondary" : "text-sm text-destructive"
              }
            >
              {t("spec.weightTotal")}: {totalWeight}%
            </p>
          </fieldset>
        )}

        {clos.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{t("oq.title")}</p>
            <ul className="list-disc ps-5">
              {clos.flatMap((c) =>
                outcomeIssues(c.label_en, c.label_ar).map((iss, n) => (
                  <li key={`${c.key}-${n}`}>
                    <span className="font-mono">{c.code || "—"}</span>:{" "}
                    {iss.kind === "vague" ? `${t("oq.vague")} ${iss.word}` : t(k(`oq.${iss.kind}`))}
                  </li>
                )),
              )}
            </ul>
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t("spec.references")}</legend>
          {(spec.references ?? []).map((r, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-center">
              <input
                aria-label={`${t("spec.citation")} ${i + 1}`}
                className="field-input"
                dir="auto"
                readOnly={!editable}
                value={r.citation}
                onChange={(e) =>
                  setSpec({
                    references: (spec.references ?? []).map((x, j) =>
                      j === i ? { ...x, citation: e.target.value } : x,
                    ),
                  })
                }
              />
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={r.verified}
                  onChange={(e) =>
                    setSpec({
                      references: (spec.references ?? []).map((x, j) =>
                        j === i ? { ...x, verified: e.target.checked } : x,
                      ),
                    })
                  }
                />
                {t("spec.verified")}
              </label>
              {editable && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() =>
                    setSpec({ references: (spec.references ?? []).filter((_, j) => j !== i) })
                  }
                >
                  {t("spec.remove")}
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              type="button"
              className="chip-btn"
              onClick={() =>
                setSpec({
                  references: [...(spec.references ?? []), { citation: "", verified: false }],
                })
              }
            >
              {t("spec.add")}
            </button>
          )}
        </fieldset>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {t("spec.problem")} {problem}
          </p>
        )}
      </div>
    </details>
  );
}

function BiList({
  title,
  idBase,
  items,
  editable,
  onChange,
}: {
  title: string;
  idBase: string;
  items: Bi[];
  editable: boolean;
  onChange: (items: Bi[]) => void;
}) {
  const { t } = useLocale();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      {items.map((o, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          {(["ar", "en"] as const).map((lang) => (
            <input
              key={lang}
              id={`${idBase}-${i}-${lang}`}
              aria-label={`${title} ${i + 1} ${t(k(`spec.${lang}`))}`}
              className="field-input"
              lang={lang}
              dir={lang === "ar" ? "rtl" : "ltr"}
              readOnly={!editable}
              value={o[lang]}
              onChange={(e) =>
                onChange(items.map((x, j) => (j === i ? { ...x, [lang]: e.target.value } : x)))
              }
            />
          ))}
          {editable && (
            <button
              type="button"
              className="btn-link"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              {t("spec.remove")}
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button
          type="button"
          className="chip-btn"
          onClick={() => onChange([...items, { ar: "", en: "" }])}
        >
          {t("spec.add")}
        </button>
      )}
    </fieldset>
  );
}

function SpecSuggestion({
  pending,
  onInsert,
  onDiscard,
}: {
  pending: Pending;
  onInsert: () => void;
  onDiscard: () => void;
}) {
  const { t } = useLocale();
  const r = pending.result as Record<string, unknown>;
  const pair = (ar: string, en: string, extra?: string) => (
    <>
      <p lang="ar" dir="rtl">
        {ar}
      </p>
      <p lang="en" dir="ltr">
        {en}
        {extra && <span className="text-muted-foreground"> · {extra}</span>}
      </p>
    </>
  );
  const list = (key: string) => (r[key] as Record<string, unknown>[] | undefined) ?? [];
  return (
    <div className="ai-suggestion space-y-2" role="region" aria-label={t("ai.cs.preview")}>
      {pending.step === "description" &&
        pair(String(r["description_ar"] ?? ""), String(r["description_en"] ?? ""))}
      {pending.step === "objectives" && (
        <ol className="list-decimal space-y-1 ps-5">
          {list("objectives").map((o, i) => (
            <li key={i}>{pair(String(o["ar"]), String(o["en"]))}</li>
          ))}
        </ol>
      )}
      {pending.step === "outcomes" && (
        <ul className="space-y-2">
          {list("outcomes").map((o, i) => (
            <li key={i}>
              <span className="font-mono">{String(o["code"])}</span> ·{" "}
              {t(k(`ai.domain.${String(o["domain"])}`))}
              {pair(
                String(o["ar"]),
                String(o["en"]),
                `${t("spec.outcomeFor")} ${((o["program_outcomes"] as string[]) ?? []).join(", ") || "—"}`,
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.step === "topics" && (
        <ul className="space-y-2">
          {list("topics").map((o, i) => (
            <li key={i}>
              {pair(
                String(o["ar"]),
                String(o["en"]),
                `${String(o["weeks"])} ${t("spec.weeks")} · ${((o["outcomes"] as string[]) ?? []).join(", ")}`,
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.step === "assessments" && (
        <ul className="space-y-2">
          {list("assessments").map((o, i) => (
            <li key={i}>
              <span className="font-mono">{String(o["code"])}</span> · {String(o["weight"])}%
              {pair(
                String(o["ar"]),
                String(o["en"]),
                ((o["outcomes"] as string[]) ?? []).join(", "),
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.step === "references" && (
        <ul className="space-y-2">
          {list("references").map((o, i) => (
            <li key={i}>
              <p dir="auto" className="font-medium">
                {String(o["citation"])}
              </p>
              {pair(String(o["why_ar"]), String(o["why_en"]))}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        <button type="button" className="btn-primary" onClick={onInsert}>
          {t("ai.insertAll")}
        </button>
        <button type="button" className="btn-link" onClick={onDiscard}>
          {t("ai.discard")}
        </button>
      </div>
    </div>
  );
}
