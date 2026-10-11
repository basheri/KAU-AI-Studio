import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { VISIBLE_NAV_ITEMS } from "@/features/navigation/nav";
import { MyPrograms, MyWork } from "@/features/guidance/MyWork";
import { useSession } from "@/features/session/SessionProvider";

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
  const session = useSession();
  return (
    <ModulePage to="/">
      {session.status === "signed-in" ? (
        <div className="space-y-6">
          <MyWork userId={session.userId} />
          <MyPrograms userId={session.userId} />
          <Sections />
        </div>
      ) : (
        <Sections />
      )}
    </ModulePage>
  );
}

function Sections() {
  const { t } = useLocale();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {VISIBLE_NAV_ITEMS.slice(1).map((item) => (
        <Link key={item.to} to={item.to} className="surface-card surface-card-link p-5">
          <item.icon className="mb-3 size-5 text-primary" aria-hidden />
          <h2 className="font-medium">{t(item.label)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(item.description)}</p>
        </Link>
      ))}
    </div>
  );
}
