import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Languages, LogOut, Menu, X, UserRound } from "lucide-react";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { NAV_ITEMS } from "@/features/navigation/nav";
import type { Session } from "@/features/session/session";

export function AppShell({
  session,
  onSignOut,
  children,
}: {
  session: Session;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const { t, locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const other = locale === "ar" ? "en" : "ar";

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <a href="#main" className="skip-link">
        {t("skip")}
      </a>

      <aside data-open={open} className={`app-sidebar ${""}`}>
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="brand-mark" aria-hidden />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{t("app.name")}</p>
            <p className="text-xs text-sidebar-foreground/70">{t("app.university")}</p>
          </div>
        </div>
        <nav aria-label={t("nav.label")} className="space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: item.to === "/" }}
              className="nav-link"
              activeProps={{ className: "nav-link-active", "aria-current": "page" }}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              <span>{t(item.label)}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {open && (
        <button
          aria-label={t("menu.close")}
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-8">
          <button
            className="icon-btn lg:hidden"
            aria-label={open ? t("menu.close") : t("menu.open")}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="hidden rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground sm:inline">
            {t("status.private")}
          </span>
          <div className="ms-auto flex min-w-0 items-center gap-2">
            <button
              className="chip-btn"
              aria-label={other === "en" ? "English" : "العربية"}
              title={other === "en" ? t("lang.switchLabel") : undefined}
              onClick={() => setLocale(other)}
              lang={other}
            >
              <Languages className="size-4" aria-hidden />
              {other === "en" ? "English" : "العربية"}
            </button>
            <div
              data-testid="session-status"
              data-status={session.status}
              className="hidden min-w-0 items-center gap-2 rounded-md sm:flex border border-border px-3 py-1.5 text-sm text-muted-foreground"
              title={session.status === "signed-in" ? session.email : undefined}
            >
              <UserRound className="size-4" aria-hidden />
              {session.status === "signed-in" ? (
                <bdi dir="ltr" className="block max-w-16 truncate sm:max-w-40">
                  {session.email}
                </bdi>
              ) : session.status === "signed-out" ? (
                t("session.signedOut")
              ) : (
                "…"
              )}
            </div>
            {session.status === "signed-in" && onSignOut && (
              <button className="chip-btn" onClick={onSignOut}>
                <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
                <span className="sr-only sm:not-sr-only">{t("auth.signOut")}</span>
              </button>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
