import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { editOutcome } from "@/features/reviews/rules";
import {
  architectureQuery,
  saveArchitecture,
  type StructuredArtifact,
} from "@/features/intake/api";
import { VersionChips } from "@/features/intake/BriefEditor";
import {
  MAPPING_RULES,
  checkAlignment,
  type ArchElement,
  type ArchMapping,
  type ElementType,
} from "./alignment";

const k = (s: string) => s as MessageKey;
const newKey = () => `n-${crypto.randomUUID()}`;
const display = (e: ArchElement) => e.code || e.label_en || e.label_ar || "—";

export function ArchitectureEditor({
  artifact,
  canContribute,
}: {
  artifact: StructuredArtifact;
  canContribute: boolean;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [versionId, setVersionId] = useState(artifact.versions[0]!.id);
  useEffect(() => setVersionId(artifact.versions[0]!.id), [artifact.versions]);
  const version = artifact.versions.find((v) => v.id === versionId) ?? artifact.versions[0]!;
  const arch = useQuery(architectureQuery(version.id));
  const [elements, setElements] = useState<ArchElement[]>([]);
  const [mappings, setMappings] = useState<ArchMapping[]>([]);
  const [summary, setSummary] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (arch.data) {
      setElements(arch.data.elements);
      setMappings(arch.data.mappings);
    }
  }, [arch.data]);

  const defects = useMemo(() => checkAlignment(elements, mappings), [elements, mappings]);
  const outcome = editOutcome(version.state);
  const editable = canContribute && outcome !== "blocked";
  const dirty =
    !!arch.data &&
    (JSON.stringify(elements) !== JSON.stringify(arch.data.elements) ||
      JSON.stringify(mappings) !== JSON.stringify(arch.data.mappings));
  const missingLabel = elements.some((e) => !e.label_ar.trim() && !e.label_en.trim());

  const save = useMutation({
    mutationFn: () => saveArchitecture(version.id, elements, mappings, summary),
    onSuccess: async (id) => {
      setSummary("");
      setTried(false);
      await qc.invalidateQueries();
      setVersionId(id);
    },
  });

  if (arch.isLoading)
    return (
      <p role="status" className="text-muted-foreground">
        …
      </p>
    );
  if (arch.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("rv.failed")}
      </p>
    );

  const of = (type: ElementType, parent?: string) =>
    elements.filter((e) => e.type === type && (parent === undefined || e.parent_key === parent));
  const add = (type: ElementType, parent_key: string | null = null) =>
    setElements((xs) => [
      ...xs,
      { key: newKey(), type, parent_key, code: "", label_ar: "", label_en: "" },
    ]);
  const update = (key: string, patch: Partial<ArchElement>) =>
    setElements((xs) => xs.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  const remove = (key: string) => {
    const gone = new Set([key, ...elements.filter((e) => e.parent_key === key).map((e) => e.key)]);
    setElements((xs) => xs.filter((e) => !gone.has(e.key)));
    setMappings((ms) => ms.filter((m) => !gone.has(m.from) && !gone.has(m.to)));
  };
  const toggle = (from: string, to: string, on: boolean) =>
    setMappings((ms) =>
      on ? [...ms, { from, to }] : ms.filter((m) => !(m.from === from && m.to === to)),
    );
  const targetsFor = (e: ArchElement) => {
    const types = MAPPING_RULES.filter(([f]) => f === e.type).map(([, to]) => to);
    return elements.filter(
      (x) =>
        types.includes(x.type) &&
        (e.type === "program_outcome" ||
          e.type === "source_evidence" ||
          x.parent_key === e.parent_key),
    );
  };

  const row = (e: ArchElement) => (
    <li key={e.key} className="rounded-md border p-3">
      <div className="grid gap-2 md:grid-cols-[6rem_1fr_1fr_auto]">
        <div>
          <label htmlFor={`c-${e.key}`} className="text-xs text-muted-foreground">
            {t("ps.code")}
          </label>
          <input
            id={`c-${e.key}`}
            className="field-input"
            dir="ltr"
            maxLength={40}
            readOnly={!editable}
            value={e.code}
            onChange={(ev) => update(e.key, { code: ev.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`a-${e.key}`} className="text-xs text-muted-foreground">
            {t("ps.labelAr")}
          </label>
          <input
            id={`a-${e.key}`}
            className="field-input"
            dir="rtl"
            lang="ar"
            readOnly={!editable}
            value={e.label_ar}
            aria-invalid={tried && !e.label_ar.trim() && !e.label_en.trim()}
            onChange={(ev) => update(e.key, { label_ar: ev.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`e-${e.key}`} className="text-xs text-muted-foreground">
            {t("ps.labelEn")}
          </label>
          <input
            id={`e-${e.key}`}
            className="field-input"
            dir="ltr"
            lang="en"
            readOnly={!editable}
            value={e.label_en}
            aria-invalid={tried && !e.label_ar.trim() && !e.label_en.trim()}
            onChange={(ev) => update(e.key, { label_en: ev.target.value })}
          />
        </div>
        {editable && (
          <button
            type="button"
            className="btn-link self-end"
            onClick={() => remove(e.key)}
            aria-label={`${t("ps.remove")} ${display(e)}`}
          >
            {t("ps.remove")}
          </button>
        )}
      </div>
      {targetsFor(e).length > 0 && (
        <fieldset className="mt-2">
          <legend className="text-xs text-muted-foreground">{t("ps.mapsTo")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {targetsFor(e).map((x) => (
              <label key={x.key} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={mappings.some((m) => m.from === e.key && m.to === x.key)}
                  onChange={(ev) => toggle(e.key, x.key, ev.target.checked)}
                />
                {display(x)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </li>
  );

  const section = (type: ElementType, parent: string | null, level: "h3" | "h4" = "h3") => {
    const H = level;
    const items = of(type, parent ?? undefined).filter((e) =>
      parent === null ? !e.parent_key : true,
    );
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <H className="text-sm font-semibold">{t(k(`el.${type}`))}</H>
          {editable && (
            <button type="button" className="chip-btn" onClick={() => add(type, parent)}>
              {t("ps.add")}
            </button>
          )}
        </div>
        {items.length ? (
          <ul className="space-y-2">{items.map(row)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("rv.none")}</p>
        )}
      </div>
    );
  };

  return (
    <section className="surface-card space-y-5 p-5" aria-labelledby="arch-h">
      <h2 id="arch-h" className="font-semibold">
        {artifact.title}
      </h2>
      <VersionChips artifact={artifact} value={version.id} onChange={setVersionId} />

      {section("program_outcome", null)}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("el.course")}</h3>
          {editable && (
            <button type="button" className="chip-btn" onClick={() => add("course")}>
              {t("ps.add")}
            </button>
          )}
        </div>
        {of("course").length === 0 && (
          <p className="text-sm text-muted-foreground">{t("rv.none")}</p>
        )}
        {of("course").map((c) => (
          <div
            key={c.key}
            className="space-y-3 rounded-lg border-s-4 border-secondary bg-muted/30 p-3"
          >
            <ul>{row(c)}</ul>
            <div className="space-y-3 ps-3">
              {section("course_outcome", c.key, "h4")}
              {section("activity", c.key, "h4")}
              {section("assessment", c.key, "h4")}
            </div>
          </div>
        ))}
      </div>
      {section("source_evidence", null)}

      <div aria-live="polite" className="rounded-md border p-3">
        <h3 className="mb-2 text-sm font-semibold">{t("ps.alignment")}</h3>
        {defects.length === 0 ? (
          <p className="text-sm text-secondary">{t("ps.aligned")}</p>
        ) : (
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {defects.map((d, i) => (
              <li key={i}>
                {t(k(`def.${d.type}`))}: <span className="font-mono">{d.code || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editable && (
        <div className="space-y-3">
          {outcome === "child" && (
            <p className="text-sm text-muted-foreground" role="note">
              {t("rv.lockedNote")}
            </p>
          )}
          <div>
            <label htmlFor="ar-summary" className="field-label">
              {t("rv.summary")}
            </label>
            <input
              id="ar-summary"
              className="field-input"
              maxLength={1000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          {tried && missingLabel && (
            <p role="alert" className="text-sm text-destructive">
              {t("ps.labelRequired")}
            </p>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("rv.failed")}
            </p>
          )}
          <button
            className="btn-primary"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setTried(true);
              if (!missingLabel) save.mutate();
            }}
          >
            {outcome === "child" ? t("rv.proposeChild") : t("rv.saveDraft")}
          </button>
          {dirty && <span className="ms-3 text-sm text-muted-foreground">{t("ps.unsaved")}</span>}
        </div>
      )}
      <Link to="/reviews" className="btn-link">
        {t("ps.goReview")}
      </Link>
    </section>
  );
}
