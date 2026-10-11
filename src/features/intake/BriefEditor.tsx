import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { editOutcome } from "@/features/reviews/rules";
import type { StructuredArtifact } from "./api";
import { briefQuery, confirmAssumptions, createArchitecture, updateBrief } from "./api";
import { BRIEF_FIELDS, PROGRAM_CATEGORIES, type BriefFields, type ProgramCategory } from "./brief";
import { AiBadge } from "@/features/ai/AiParts";
import { BriefAiTools } from "@/features/ai/BriefAi";
import { acceptBriefField, recordAiOutcome } from "@/features/ai/api";
import { briefAiPending, fieldAiBadges } from "@/features/ai/gate";

const k = (s: string) => s as MessageKey;

export function VersionChips({
  artifact,
  value,
  onChange,
}: {
  artifact: StructuredArtifact;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div role="radiogroup" aria-label={t("rv.versions")} className="flex flex-wrap gap-2">
      {artifact.versions.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={v.id === value}
          className={v.id === value ? "chip-btn chip-btn-active" : "chip-btn"}
          onClick={() => onChange(v.id)}
        >
          v{v.version_number}{" "}
          <span className="state-badge" data-state={v.state}>
            {t(k(`state.${v.state}`))}
          </span>
        </button>
      ))}
    </div>
  );
}

export function BriefEditor({
  artifact,
  canContribute,
  onArchitecture,
  onVersion,
}: {
  artifact: StructuredArtifact;
  canContribute: boolean;
  onArchitecture: (versionId: string) => void;
  onVersion?: (id: string) => void;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [versionId, setVersionId] = useState(artifact.versions[0]!.id);
  useEffect(() => setVersionId(artifact.versions[0]!.id), [artifact.versions]);
  const version = artifact.versions.find((v) => v.id === versionId) ?? artifact.versions[0]!;
  const brief = useQuery(briefQuery(version.id));
  const [fields, setFields] = useState<BriefFields | null>(null);
  const [category, setCategory] = useState<ProgramCategory>("academic_program");
  const [summary, setSummary] = useState("");
  useEffect(() => {
    if (brief.data) {
      setFields(brief.data.fields);
      setCategory(brief.data.category);
    }
  }, [brief.data]);

  const refresh = async (id?: string) => {
    await qc.invalidateQueries();
    if (id) {
      setVersionId(id);
      onVersion?.(id);
    }
  };
  const save = useMutation({
    mutationFn: () => updateBrief(version.id, fields!, category, summary),
    onSuccess: (id) => {
      setSummary("");
      void refresh(id);
    },
  });
  const confirm = useMutation({
    mutationFn: () => confirmAssumptions(version.id),
    onSuccess: () => void refresh(),
  });
  const accept = useMutation({
    mutationFn: async (key: string) => {
      await acceptBriefField(version.id, key);
      const ref = brief.data?.fields[key as keyof BriefFields]?.source_ref ?? "";
      if (ref.startsWith("ai_request:"))
        void recordAiOutcome(ref.slice(11), "accepted").catch(() => {});
    },
    onSuccess: () => void refresh(),
  });
  const arch = useMutation({
    mutationFn: () => createArchitecture(version.id),
    onSuccess: (id) => {
      void refresh();
      onArchitecture(id);
    },
  });

  if (brief.isLoading || !fields)
    return (
      <p className="text-muted-foreground" role="status">
        …
      </p>
    );
  if (brief.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("rv.failed")}
      </p>
    );
  const b = brief.data!;
  const outcome = editOutcome(version.state);
  const editable = canContribute && outcome !== "blocked";
  const dirty = JSON.stringify(fields) !== JSON.stringify(b.fields) || category !== b.category;
  const assumptionsEmpty = !fields.assumptions.ar.trim() && !fields.assumptions.en.trim();
  const sf = b.source_files as {
    file_name: string;
    extraction_status: string;
    extraction_method?: string;
  } | null;
  const snap = b.program_source_snapshots as {
    source_label: string;
    snapshot: { raw_text?: string };
  } | null;

  const pending = briefAiPending(b.fields);
  const isDraft = version.state === "draft";
  const setField = (key: (typeof BRIEF_FIELDS)[number], lang: "ar" | "en", value: string) =>
    setFields((f) => (f ? { ...f, [key]: { ...f[key], [lang]: value } } : f));

  return (
    <section className="surface-card space-y-4 p-5" aria-labelledby="brief-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="brief-h" className="font-semibold">
          {artifact.title}
        </h2>
        <span className="text-sm text-muted-foreground">{t(k(`mode.${b.intake_mode}`))}</span>
      </div>
      <VersionChips artifact={artifact} value={version.id} onChange={setVersionId} />

      {sf && (
        <p className="text-sm" role="status">
          <span className="font-medium">{t("ps.extraction")}:</span> {sf.file_name} —{" "}
          {t(k(`ext.${sf.extraction_status}`))}
          {sf.extraction_method === "ai" && (
            <>
              {" "}
              <AiBadge kind="draft" />
            </>
          )}
        </p>
      )}
      {snap && (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {t("ps.snapshot")}: {snap.source_label}
          </summary>
          <pre dir="auto" className="mt-2 whitespace-pre-wrap font-mono text-xs">
            {snap.snapshot.raw_text}
          </pre>
        </details>
      )}

      <div
        className={b.assumptions_confirmed_at ? "notice notice-ok" : "notice notice-warn"}
        role="status"
      >
        {b.assumptions_confirmed_at ? t("ps.confirmed") : t("ps.notConfirmed")}
      </div>

      <div>
        <label htmlFor="bf-cat" className="field-label">
          {t("bf.category")}
        </label>
        <select
          id="bf-cat"
          className="field-input"
          disabled={!editable}
          value={category}
          onChange={(e) => setCategory(e.target.value as ProgramCategory)}
        >
          {PROGRAM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(k(`cat.${c}`))}
            </option>
          ))}
        </select>
      </div>

      {canContribute && isDraft && (
        <BriefAiTools versionId={version.id} dirty={dirty} onChanged={() => void refresh()} />
      )}
      {pending.length > 0 && (
        <p className="notice notice-warn" role="status">
          {t("ai.brief.pending")} {pending.map((p) => t(k(`bf.${p}`))).join("، ")}
        </p>
      )}

      {BRIEF_FIELDS.filter((f) => f !== "category").map((key) => {
        const f = fields[key];
        const ai = fieldAiBadges(b.fields[key]);
        return (
          <fieldset key={key} className="rounded-md border p-3">
            <legend className="flex items-center gap-2 px-1 text-sm font-medium">
              {t(k(`bf.${key}`))}
              <span
                className="prov-badge"
                data-prov={f.provenance ?? "none"}
                title={f.source_ref ?? undefined}
              >
                {t(k(`prov.${f.provenance ?? "none"}`))}
              </span>
              {ai.field && <AiBadge kind={ai.field} />}
              {canContribute && isDraft && pending.includes(key) && (
                <button
                  type="button"
                  className="btn-link"
                  disabled={dirty || accept.isPending}
                  onClick={() => accept.mutate(key)}
                >
                  {t("ai.accept")}
                </button>
              )}
            </legend>
            <div className="grid gap-2 md:grid-cols-2">
              {(["ar", "en"] as const).map((lang) => (
                <div key={lang}>
                  <label
                    htmlFor={`bf-${key}-${lang}`}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    {t(lang === "ar" ? "ps.ar" : "ps.en")}
                    {ai[lang] && <AiBadge kind={ai[lang]!} />}
                  </label>
                  <textarea
                    id={`bf-${key}-${lang}`}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                    lang={lang}
                    rows={key === "title" ? 1 : 2}
                    className="field-input"
                    readOnly={!editable}
                    value={f[lang]}
                    onChange={(e) => setField(key, lang, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        );
      })}

      {editable && (
        <div className="space-y-3">
          {outcome === "child" && (
            <p className="text-sm text-muted-foreground" role="note">
              {t("rv.lockedNote")}
            </p>
          )}
          <div>
            <label htmlFor="bf-summary" className="field-label">
              {t("rv.summary")}
            </label>
            <input
              id="bf-summary"
              className="field-input"
              maxLength={1000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("rv.failed")}
            </p>
          )}
          <button
            className="btn-primary"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {outcome === "child" ? t("rv.proposeChild") : t("rv.saveDraft")}
          </button>
          {dirty && <span className="ms-3 text-sm text-muted-foreground">{t("ps.unsaved")}</span>}
        </div>
      )}

      {canContribute && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {!b.assumptions_confirmed_at &&
            (version.state === "draft" ? (
              <button
                className="chip-btn"
                disabled={dirty || assumptionsEmpty || confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {t("ps.confirm")}
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">{t("ps.confirmNeedsDraft")}</span>
            ))}
          <button
            className="chip-btn"
            disabled={!b.assumptions_confirmed_at || arch.isPending}
            onClick={() => arch.mutate()}
          >
            {t("ps.createArch")}
          </button>
          <Link to="/reviews" className="btn-link">
            {t("ps.goReview")}
          </Link>
          {(confirm.isError || arch.isError || accept.isError) && (
            <p role="alert" className="w-full text-sm text-destructive">
              {t("rv.failed")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
