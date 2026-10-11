import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { errText } from "./api";
import { useAiEnabled } from "./useAiEnabled";

export function AiError({ error }: { error: unknown }) {
  const { t } = useLocale();
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {errText(error) || t("rv.failed")}
    </p>
  );
}

export type AiBadgeKind = "draft" | "accepted" | "translation" | "translationAccepted";

export function AiBadge({ kind }: { kind: AiBadgeKind }) {
  const { t } = useLocale();
  return (
    <span className="ai-badge" data-kind={kind}>
      <Sparkles className="size-3" aria-hidden />
      {t(`ai.badge.${kind}` as MessageKey)}
    </span>
  );
}

/** Frame for AI tools: hidden entirely when AI is off, with the standing reminder that drafts need review. */
export function AiPanel({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id: string;
}) {
  const { t } = useLocale();
  const { enabled, loading } = useAiEnabled();
  if (loading) return null;
  return (
    <section className="ai-panel space-y-3" aria-labelledby={id}>
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" aria-hidden />
        {title}
      </h3>
      {enabled ? (
        <>
          <p className="text-xs text-muted-foreground">{t("ai.notice")}</p>
          {children}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("ai.off")}</p>
      )}
    </section>
  );
}
