import { useMutation } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { aiSummarizeChanges, aiSummarizeThread } from "./ai.functions";
import { AiError, AiPanel } from "./AiParts";

type Summary = { summary_ar: string; summary_en: string; points: { ar: string; en: string }[] };

function SummaryView({ s }: { s: Summary }) {
  const { t, locale } = useLocale();
  const pick = (x: { ar: string; en: string }) => (locale === "ar" ? x.ar || x.en : x.en || x.ar);
  return (
    <div className="ai-suggestion space-y-2" role="status">
      <p>{pick({ ar: s.summary_ar, en: s.summary_en })}</p>
      {s.points.length > 0 && (
        <ul className="list-disc space-y-1 ps-5">
          {s.points.map((p, i) => (
            <li key={i}>{pick(p)}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("ai.rv.summaryNote")}</p>
    </div>
  );
}

/** Reading aids for reviewers. Summaries are never stored or attached to decisions. */
export function ReviewAi({
  versionId,
  parentVersionId,
}: {
  versionId: string;
  parentVersionId: string | null;
}) {
  const { t } = useLocale();
  const changes = useMutation({
    mutationFn: () =>
      aiSummarizeChanges({ data: { versionId, earlierVersionId: parentVersionId! } }),
  });
  const thread = useMutation({ mutationFn: () => aiSummarizeThread({ data: { versionId } }) });
  return (
    <AiPanel title={t("ai.label")} id={`rv-ai-${versionId}`}>
      <div className="flex flex-wrap gap-2">
        {parentVersionId && (
          <button
            type="button"
            className="chip-btn"
            disabled={changes.isPending}
            onClick={() => changes.mutate()}
          >
            {changes.isPending ? t("ai.working") : t("ai.rv.changes")}
          </button>
        )}
        <button
          type="button"
          className="chip-btn"
          disabled={thread.isPending}
          onClick={() => thread.mutate()}
        >
          {thread.isPending ? t("ai.working") : t("ai.rv.thread")}
        </button>
      </div>
      {changes.data && <SummaryView s={changes.data} />}
      {thread.data && thread.data.requestId && <SummaryView s={thread.data} />}
      <AiError error={changes.error ?? thread.error} />
    </AiPanel>
  );
}
