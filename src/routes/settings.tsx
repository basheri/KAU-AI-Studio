import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ModulePage } from "@/components/shell/ModulePage";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { LOCALES } from "@/features/i18n/locale";
import { getSystemStatus } from "@/features/system/status.functions";
import { AiStatusCard, AiUsagePanel, GlossaryPanel } from "@/features/ai/AiSettings";
import { useSession } from "@/features/session/SessionProvider";

const statusQuery = queryOptions({ queryKey: ["system-status"], queryFn: () => getSystemStatus() });

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — KAU AI Program Studio" },
      { name: "description", content: "Workspace preferences and system status." },
      { property: "og:title", content: "Settings — KAU AI Program Studio" },
      { property: "og:description", content: "Workspace preferences and system status." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, locale, setLocale } = useLocale();
  const { data } = useQuery(statusQuery);
  const session = useSession();
  return (
    <ModulePage to="/settings">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="mb-3 font-semibold">{t("settings.language")}</h2>
          <div role="radiogroup" aria-label={t("settings.language")} className="flex gap-2">
            {LOCALES.map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={locale === l}
                onClick={() => setLocale(l)}
                lang={l}
                className={locale === l ? "chip-btn chip-btn-active" : "chip-btn"}
              >
                {l === "ar" ? "العربية" : "English"}
              </button>
            ))}
          </div>
        </section>
        <section className="surface-card p-5">
          <h2 className="mb-3 font-semibold">{t("settings.status")}</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("settings.integrations")}</dt>
              <dd>{data ? t("settings.disabled") : "…"}</dd>
            </div>
          </dl>
        </section>
        <AiStatusCard />
        {session.status === "signed-in" && (
          <>
            <GlossaryPanel userId={session.userId} />
            <AiUsagePanel userId={session.userId} />
          </>
        )}
      </div>
    </ModulePage>
  );
}
