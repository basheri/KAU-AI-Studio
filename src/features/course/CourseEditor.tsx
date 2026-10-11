import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import type { MediaRecord } from "./api";
import { BLOCK_TYPES, emptyPayload, type BlockType, type Lang } from "./blocks";
import { BlockFields } from "./BlockFields";
import { LearnerPreview } from "./LearnerPreview";
import {
  contentDefects,
  duplicateBlock,
  moveItem,
  newKey,
  type Block,
  type CourseTree,
  type Defect,
  type LessonNode,
  type ModuleNode,
} from "./tree";

const k = (s: string) => s as MessageKey;
const dirOf = (l: Lang | null) => (l === "ar" ? "rtl" : l === "en" ? "ltr" : undefined);

type Titled = { title_ar: string; title_en: string; lang: Lang | null };

function TitleFields({
  idBase,
  value,
  onChange,
  readOnly,
  legend,
}: {
  idBase: string;
  value: Titled;
  onChange: (v: Titled) => void;
  readOnly: boolean;
  legend: string;
}) {
  const { t } = useLocale();
  return (
    <fieldset className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <legend className="sr-only">{legend}</legend>
      <div>
        <label htmlFor={`${idBase}-ar`} className="field-label">
          {legend} · {t("ps.ar")}
        </label>
        <input
          id={`${idBase}-ar`}
          className="field-input"
          lang="ar"
          dir="rtl"
          value={value.title_ar}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...value, title_ar: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-en`} className="field-label">
          {legend} · {t("ps.en")}
        </label>
        <input
          id={`${idBase}-en`}
          className="field-input"
          lang="en"
          dir="ltr"
          value={value.title_en}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...value, title_en: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-lang`} className="field-label">
          {t("cs.lang")}
        </label>
        <select
          id={`${idBase}-lang`}
          className="field-input"
          value={value.lang ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange({ ...value, lang: (e.target.value || null) as Lang | null })}
        >
          <option value="">{t("cs.langNone")}</option>
          <option value="ar">{t("ps.ar")}</option>
          <option value="en">{t("ps.en")}</option>
        </select>
      </div>
    </fieldset>
  );
}

function ItemActions({
  label,
  index,
  count,
  onMove,
  onDelete,
  onDuplicate,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <button
        type="button"
        className="btn-link"
        disabled={index === 0}
        aria-label={`${t("cs.moveUp")}: ${label}`}
        onClick={() => onMove(-1)}
      >
        {t("cs.moveUp")}
      </button>
      <button
        type="button"
        className="btn-link"
        disabled={index === count - 1}
        aria-label={`${t("cs.moveDown")}: ${label}`}
        onClick={() => onMove(1)}
      >
        {t("cs.moveDown")}
      </button>
      {onDuplicate && (
        <button
          type="button"
          className="btn-link"
          aria-label={`${t("cs.duplicate")}: ${label}`}
          onClick={onDuplicate}
        >
          {t("cs.duplicate")}
        </button>
      )}
      <button
        type="button"
        className="btn-link text-destructive"
        aria-label={`${t("cs.delete")}: ${label}`}
        onClick={onDelete}
      >
        {t("cs.delete")}
      </button>
    </div>
  );
}

export function CourseEditor({
  tree,
  onChange,
  readOnly,
  media,
  outcomes,
}: {
  tree: CourseTree;
  onChange: (t: CourseTree) => void;
  readOnly: boolean;
  media: MediaRecord[];
  outcomes: { code: string; label: string }[];
}) {
  const { t } = useLocale();
  const [mode, setMode] = useState<"author" | "preview">("author");
  const [sel, setSel] = useState<{ m: string; l: string } | null>(null);
  const [newType, setNewType] = useState<BlockType>("rich_text");
  const [pendingDelete, setPendingDelete] = useState<(() => void) | null>(null);

  const ctx = useMemo(
    () => ({
      outcomeCodes: new Set(outcomes.map((o) => o.code)),
      media: new Map(media.map((m) => [m.id, m])),
    }),
    [outcomes, media],
  );
  const defects = useMemo(() => contentDefects(tree, ctx), [tree, ctx]);

  const firstLesson = tree.modules.find((m) => m.lessons.length);
  const selModule = tree.modules.find((m) => m.key === sel?.m) ?? firstLesson;
  const selLesson = selModule?.lessons.find((l) => l.key === sel?.l) ?? selModule?.lessons[0];

  const setModules = (modules: ModuleNode[]) => onChange({ ...tree, modules });
  const updModule = (key: string, fn: (m: ModuleNode) => ModuleNode) =>
    setModules(tree.modules.map((m) => (m.key === key ? fn(m) : m)));
  const updLesson = (mk: string, lk: string, fn: (l: LessonNode) => LessonNode) =>
    updModule(mk, (m) => ({ ...m, lessons: m.lessons.map((l) => (l.key === lk ? fn(l) : l)) }));
  const label = (n: Titled) =>
    (n.lang === "ar" ? n.title_ar || n.title_en : n.title_en || n.title_ar) || "—";
  const where = (d: Defect) => {
    const m = tree.modules.find((x) => x.key === d.module);
    const l = m?.lessons.find((x) => x.key === d.lesson);
    const bi = l?.blocks.findIndex((x) => x.key === d.block) ?? -1;
    return (
      [
        m && label(m),
        l && label(l),
        bi >= 0 && l ? `${t(k(`block.${l.blocks[bi]?.type}`))} ${bi + 1}` : null,
      ]
        .filter(Boolean)
        .join(" › ") || t("cs.courseTitle")
    );
  };

  const addModule = () => {
    const lesson: LessonNode = {
      key: newKey(),
      title_ar: "",
      title_en: "",
      lang: tree.lang,
      blocks: [],
    };
    const m: ModuleNode = {
      key: newKey(),
      title_ar: "",
      title_en: "",
      lang: tree.lang,
      lessons: [lesson],
    };
    setModules([...tree.modules, m]);
    setSel({ m: m.key, l: lesson.key });
  };
  const addLesson = (mk: string) => {
    const mod = tree.modules.find((m) => m.key === mk)!;
    const l: LessonNode = { key: newKey(), title_ar: "", title_en: "", lang: mod.lang, blocks: [] };
    updModule(mk, (m) => ({ ...m, lessons: [...m.lessons, l] }));
    setSel({ m: mk, l: l.key });
  };
  const addBlock = () => {
    if (!selModule || !selLesson) return;
    const b: Block = {
      key: newKey(),
      type: newType,
      lang: selLesson.lang,
      payload: emptyPayload(newType),
    };
    updLesson(selModule.key, selLesson.key, (l) => ({ ...l, blocks: [...l.blocks, b] }));
  };

  const critical = defects.filter((d) => d.severity === "critical");
  return (
    <div className="space-y-5">
      <div role="group" aria-label={t("cs.mode")} className="flex flex-wrap gap-2">
        {(["author", "preview"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? "chip-btn chip-btn-active" : "chip-btn"}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {t(m === "author" ? "cs.author" : "cs.preview")}
          </button>
        ))}
      </div>

      {mode === "preview" ? (
        <div className="surface-card p-5">
          <LearnerPreview tree={tree} media={media} />
        </div>
      ) : (
        <>
          <section className="surface-card space-y-4 p-5" aria-labelledby="ce-course">
            <h3 id="ce-course" className="font-semibold">
              {t("cs.courseTitle")}
            </h3>
            <TitleFields
              idBase="ce-course"
              legend={t("cs.courseTitle")}
              value={tree}
              readOnly={readOnly}
              onChange={(v) => onChange({ ...tree, ...v })}
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <section className="surface-card space-y-3 p-5" aria-labelledby="ce-outline">
              <h3 id="ce-outline" className="font-semibold">
                {t("cs.modules")}
              </h3>
              {!tree.modules.length && (
                <p className="text-sm text-muted-foreground">{t("cs.noLesson")}</p>
              )}
              <ol className="space-y-4">
                {tree.modules.map((m, mi) => (
                  <li key={m.key} className="space-y-2 rounded-md border border-border p-3">
                    <TitleFields
                      idBase={`ce-m-${m.key}`}
                      legend={`${t("cs.module")} ${mi + 1}`}
                      value={m}
                      readOnly={readOnly}
                      onChange={(v) => updModule(m.key, (x) => ({ ...x, ...v }))}
                    />
                    {!readOnly && (
                      <ItemActions
                        label={`${t("cs.module")} ${mi + 1}`}
                        index={mi}
                        count={tree.modules.length}
                        onMove={(d) => setModules(moveItem(tree.modules, mi, d))}
                        onDelete={() =>
                          setPendingDelete(
                            () => () => setModules(tree.modules.filter((x) => x.key !== m.key)),
                          )
                        }
                      />
                    )}
                    <ol className="space-y-1 ps-2">
                      {m.lessons.map((l, li) => (
                        <li key={l.key} className="space-y-1">
                          <button
                            type="button"
                            className={
                              selLesson?.key === l.key ? "list-item list-item-active" : "list-item"
                            }
                            aria-pressed={selLesson?.key === l.key}
                            onClick={() => setSel({ m: m.key, l: l.key })}
                            lang={l.lang ?? undefined}
                            dir={dirOf(l.lang)}
                          >
                            <span className="block min-w-0 truncate">
                              {t("cs.lesson")} {li + 1}: {label(l)}
                            </span>
                          </button>
                          {!readOnly && (
                            <ItemActions
                              label={`${t("cs.lesson")} ${mi + 1}.${li + 1}`}
                              index={li}
                              count={m.lessons.length}
                              onMove={(d) =>
                                updModule(m.key, (x) => ({
                                  ...x,
                                  lessons: moveItem(x.lessons, li, d),
                                }))
                              }
                              onDelete={() =>
                                setPendingDelete(
                                  () => () =>
                                    updModule(m.key, (x) => ({
                                      ...x,
                                      lessons: x.lessons.filter((y) => y.key !== l.key),
                                    })),
                                )
                              }
                            />
                          )}
                        </li>
                      ))}
                    </ol>
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn-link text-sm"
                        onClick={() => addLesson(m.key)}
                      >
                        {t("cs.addLesson")}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              {!readOnly && (
                <button type="button" className="btn-primary" onClick={addModule}>
                  {t("cs.addModule")}
                </button>
              )}
            </section>

            <section className="surface-card min-w-0 space-y-4 p-5" aria-labelledby="ce-blocks">
              <h3 id="ce-blocks" className="font-semibold">
                {t("cs.blocks")}
              </h3>
              {selModule && selLesson ? (
                <>
                  <TitleFields
                    idBase={`ce-l-${selLesson.key}`}
                    legend={t("cs.lesson")}
                    value={selLesson}
                    readOnly={readOnly}
                    onChange={(v) =>
                      updLesson(selModule.key, selLesson.key, (x) => ({ ...x, ...v }))
                    }
                  />
                  {!selLesson.blocks.length && (
                    <p className="text-sm text-muted-foreground">{t("cs.noBlocks")}</p>
                  )}
                  <ol className="space-y-4">
                    {selLesson.blocks.map((b, bi) => {
                      const name = `${t(k(`block.${b.type}`))} ${bi + 1}`;
                      const setBlocks = (fn: (bs: Block[]) => Block[]) =>
                        updLesson(selModule.key, selLesson.key, (x) => ({
                          ...x,
                          blocks: fn(x.blocks),
                        }));
                      const issues = defects.filter((d) => d.block === b.key);
                      return (
                        <li key={b.key}>
                          <article
                            className="space-y-3 rounded-md border border-border p-4"
                            aria-label={name}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-medium">{name}</h4>
                              <div className="w-36">
                                <label htmlFor={`b-${b.key}-lang`} className="sr-only">
                                  {t("cs.lang")}: {name}
                                </label>
                                <select
                                  id={`b-${b.key}-lang`}
                                  className="field-input"
                                  value={b.lang ?? ""}
                                  disabled={readOnly}
                                  onChange={(e) =>
                                    setBlocks((bs) =>
                                      bs.map((x) =>
                                        x.key === b.key
                                          ? { ...x, lang: (e.target.value || null) as Lang | null }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  <option value="">{t("cs.langNone")}</option>
                                  <option value="ar">{t("ps.ar")}</option>
                                  <option value="en">{t("ps.en")}</option>
                                </select>
                              </div>
                            </div>
                            <BlockFields
                              block={b}
                              readOnly={readOnly}
                              media={media}
                              outcomes={outcomes}
                              onChange={(payload) =>
                                setBlocks((bs) =>
                                  bs.map((x) => (x.key === b.key ? { ...x, payload } : x)),
                                )
                              }
                            />
                            {issues.length > 0 && (
                              <ul className="notice notice-warn space-y-1">
                                {issues.map((d, i) => (
                                  <li key={i}>
                                    {d.severity === "critical" ? t("cs.critical") : t("cs.warning")}
                                    : {t(k(`defect.${d.code}`))}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {!readOnly && (
                              <ItemActions
                                label={name}
                                index={bi}
                                count={selLesson.blocks.length}
                                onMove={(d) => setBlocks((bs) => moveItem(bs, bi, d))}
                                onDuplicate={() =>
                                  setBlocks((bs) => [
                                    ...bs.slice(0, bi + 1),
                                    duplicateBlock(b),
                                    ...bs.slice(bi + 1),
                                  ])
                                }
                                onDelete={() =>
                                  setPendingDelete(
                                    () => () =>
                                      setBlocks((bs) => bs.filter((x) => x.key !== b.key)),
                                  )
                                }
                              />
                            )}
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                  {!readOnly && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-56">
                        <label htmlFor="ce-new-type" className="field-label">
                          {t("cs.blockType")}
                        </label>
                        <select
                          id="ce-new-type"
                          className="field-input"
                          value={newType}
                          onChange={(e) => setNewType(e.target.value as BlockType)}
                        >
                          {BLOCK_TYPES.map((bt) => (
                            <option key={bt} value={bt}>
                              {t(k(`block.${bt}`))}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="btn-primary" onClick={addBlock}>
                        {t("cs.addBlock")}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("cs.noLesson")}</p>
              )}
            </section>
          </div>
        </>
      )}

      <section className="surface-card p-5" aria-labelledby="ce-valid">
        <h3 id="ce-valid" className="mb-2 font-semibold">
          {t("cs.validation")}
        </h3>
        <div aria-live="polite">
          {critical.length === 0 ? <p className="notice notice-ok">{t("cs.valid")}</p> : null}
          {defects.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {defects.map((d, i) => (
                <li key={i} data-severity={d.severity}>
                  <strong>{d.severity === "critical" ? t("cs.critical") : t("cs.warning")}:</strong>{" "}
                  {t(k(`defect.${d.code}`))}{" "}
                  <span className="text-muted-foreground">({where(d)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cs.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cs.confirmDeleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cs.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pendingDelete?.();
                setPendingDelete(null);
              }}
            >
              {t("cs.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
