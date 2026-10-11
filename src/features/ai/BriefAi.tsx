import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { aiCheckBriefConsistency, aiDraftBrief, aiTranslateBrief } from "./ai.functions";
import { AiError, AiPanel } from "./AiParts";

/** AI tools for a draft brief. Writes happen on the server and only fill empty text. */
export function BriefAiTools({
  versionId,
  dirty,
  onChanged,
}: {
  versionId: string;
  dirty: boolean;
  onChanged: () => void;
}) {
  const { t } = useLocale();
  const [idea, setIdea] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const [filled, setFilled] = useState<string[] | null>(null);
  const draft = useMutation({
    mutationFn: () => aiDraftBrief({ data: { versionId, idea: idea.trim() } }),
    onSuccess: (r) => (setFilled(r.filled), onChanged()),
  });
  const translate = useMutation({
    mutationFn: () => aiTranslateBrief({ data: { versionId } }),
    onSuccess: (r) => (setFilled(r.filled), onChanged()),
  });
  const check = useMutation({ mutationFn: () => aiCheckBriefConsistency({ data: { versionId } }) });
  const busy = draft.isPending || translate.isPending || check.isPending;
  const runDraft = () => {
    const short = idea.trim().length < 10;
    setTooShort(short);
    if (!short) draft.mutate();
  };

  return (
    <AiPanel title={t("ai.brief.title")} id="brief-ai">
      {dirty && <p className="text-xs text-muted-foreground">{t("ps.unsaved")}</p>}
      <div>
        <label htmlFor="ai-idea" className="field-label">
          {t("ai.brief.idea")}
        </label>
        <textarea
          id="ai-idea"
          dir="auto"
          rows={3}
          maxLength={4000}
          className="field-input"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />
      </div>
      {tooShort && (
        <p role="alert" className="text-sm text-destructive">
          {t("ai.brief.ideaShort")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy || dirty} onClick={runDraft}>
          {draft.isPending ? t("ai.working") : t("ai.brief.draft")}
        </button>
        <button
          type="button"
          className="chip-btn"
          disabled={busy || dirty}
          onClick={() => translate.mutate()}
        >
          {translate.isPending ? t("ai.working") : t("ai.brief.translate")}
        </button>
        <button type="button" className="chip-btn" disabled={busy} onClick={() => check.mutate()}>
          {check.isPending ? t("ai.working") : t("ai.brief.check")}
        </button>
      </div>
      {filled && (
        <p role="status" className="text-sm">
          {filled.length
            ? `${t("ai.brief.filled")} ${filled.map((k) => t(`bf.${k}` as MessageKey)).join("، ")}`
            : t("ai.brief.none")}
        </p>
      )}
      {check.data && (
        <div role="status" className="space-y-2">
          {check.data.issues.length ? (
            <ul className="space-y-2 text-sm">
              {check.data.issues.map((i, n) => (
                <li key={n} className="ai-suggestion">
                  <span className="font-medium">{t(`bf.${i.field}` as MessageKey)}</span> ·{" "}
                  {t(`ai.brief.issue.${i.severity}` as MessageKey)}
                  <p lang="ar" dir="rtl">
                    {i.note_ar}
                  </p>
                  <p lang="en" dir="ltr">
                    {i.note_en}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">{t("ai.brief.consistent")}</p>
          )}
        </div>
      )}
      <AiError error={draft.error ?? translate.error ?? check.error} />
    </AiPanel>
  );
}
