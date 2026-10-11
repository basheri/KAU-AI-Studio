import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { navItem, type NavItem } from "@/features/navigation/nav";

export function ModulePage({ to, children }: { to: NavItem["to"]; children?: ReactNode }) {
  const { t } = useLocale();
  const item = navItem(to);
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-start gap-4">
        <div className="module-icon">
          <item.icon className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(item.label)}</h1>
          <p className="mt-1 text-muted-foreground">{t(item.description)}</p>
        </div>
      </div>
      {children ?? (
        <section className="surface-card flex flex-col items-center py-16 text-center">
          <Inbox className="mb-3 size-8 text-primary" aria-hidden />
          <h2 className="font-semibold">{t("empty.title")}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
        </section>
      )}
    </div>
  );
}
