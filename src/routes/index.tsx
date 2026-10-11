import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { NAV_ITEMS } from "@/features/navigation/nav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — KAU AI Program Studio" },
      {
        name: "description",
        content: "Private program design workspace for King Abdulaziz University.",
      },
      { property: "og:title", content: "Dashboard — KAU AI Program Studio" },
      {
        property: "og:description",
        content: "Private program design workspace for King Abdulaziz University.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useLocale();
  return (
    <ModulePage to="/">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NAV_ITEMS.slice(1).map((item) => (
          <Link key={item.to} to={item.to} className="surface-card surface-card-link p-5">
            <item.icon className="mb-3 size-5 text-primary" aria-hidden />
            <h2 className="font-medium">{t(item.label)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(item.description)}</p>
          </Link>
        ))}
      </div>
    </ModulePage>
  );
}
