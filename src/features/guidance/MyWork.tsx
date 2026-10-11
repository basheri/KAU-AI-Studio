import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, CircleAlert, CircleDot } from "lucide-react";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { myInvitationsQuery, myProjectsQuery, type MyProject } from "@/features/projects/api";
import { friendlyError } from "./errors";
import { journeyQuery, myWorkQuery } from "./api";
import { journeySteps, nextStep, workLink, type StepStatus } from "./journey";

const k = (s: string) => s as MessageKey;

/** Everything waiting for the signed-in person, each item opening the exact place to act. */
export function MyWork({ userId }: { userId: string }) {
  const { t, locale } = useLocale();
  const work = useQuery(myWorkQuery(userId));
  const invitations = useQuery(myInvitationsQuery(userId));
  const pick = (d: string | null) => {
    if (!d) return "";
    const [en, ar] = d.split(" | ");
    return locale === "ar" ? (ar ?? en) : en;
  };
  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby="mw-h">
      <h2 id="mw-h" className="font-semibold">
        {t("mw.title")}
        {work.data && work.data.length > 0 && (
          <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {work.data.length}
          </span>
        )}
      </h2>
      {(invitations.data?.length ?? 0) > 0 && (
        <p className="notice notice-ok">
          {t("mw.invitations")}{" "}
          <Link to="/projects" className="btn-link">
            {t("mw.open")}
          </Link>
        </p>
      )}
      {work.isLoading ? (
        <p role="status">…</p>
      ) : work.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(work.error, t)}
        </p>
      ) : !work.data!.length ? (
        <p className="text-sm text-muted-foreground">{t("mw.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {work.data!.map((w) => {
            const link = workLink(w);
            return (
              <li key={`${w.kind}-${w.ref_id}`} className="list-item">
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">
                    {t(k(`mw.kind.${w.kind}`))} · {w.project_title}
                  </span>
                  <span className="block truncate font-medium" dir="auto">
                    {w.title}
                  </span>
                  {(w.detail || w.due_on) && (
                    <span className="block text-xs text-muted-foreground" dir="auto">
                      {pick(w.detail)}
                      {w.due_on && ` · ${t("mw.due")} ${w.due_on}`}
                    </span>
                  )}
                </span>
                <Link to={link.to} search={link.search} className="btn-primary shrink-0">
                  {t("mw.open")}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const ICON: Record<StepStatus, typeof Circle> = {
  done: CheckCircle2,
  current: CircleDot,
  attention: CircleAlert,
  todo: Circle,
};

export function ProgramJourney({ project }: { project: MyProject }) {
  const { t } = useLocale();
  const j = useQuery(journeyQuery(project.id));
  if (j.isLoading) return <p role="status">…</p>;
  if (j.isError || !j.data)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("jr.loadFailed")}
      </p>
    );
  const steps = journeySteps(j.data);
  const next = nextStep(j.data, project.id);
  return (
    <article className="surface-card space-y-3 p-5" aria-label={project.title}>
      <h3 className="font-semibold">{project.title}</h3>
      <ol className="journey" aria-label={t("jr.steps")}>
        {steps.map((s) => {
          const Icon = ICON[s.status];
          return (
            <li key={s.id} className="journey-step" data-status={s.status}>
              <Icon className="size-4 shrink-0" aria-hidden />
              <span>
                {t(k(`jr.step.${s.id}`))}
                <span className="sr-only"> — {t(k(`jr.status.${s.status}`))}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-sm">
          <span className="text-muted-foreground">{t("jr.next")}: </span>
          <span className="font-medium">
            {t(next.key)}
            {next.count ? ` (${next.count})` : ""}
          </span>
        </p>
        {project.role !== "observer" || next.to === "/reviews" ? (
          <Link to={next.to} search={next.search} className="btn-primary">
            {t("jr.go")}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function MyPrograms({ userId }: { userId: string }) {
  const { t } = useLocale();
  const projects = useQuery(myProjectsQuery(userId));
  if (!projects.data?.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="jr-h">
      <h2 id="jr-h" className="font-semibold">
        {t("jr.title")}
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {projects.data.map((p) => (
          <ProgramJourney key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}

/** Count shown next to the home link in the menu. */
export function MyWorkCount({ userId }: { userId: string }) {
  const { t } = useLocale();
  const work = useQuery(myWorkQuery(userId));
  const n = work.data?.length ?? 0;
  if (!n) return null;
  return (
    <span className="ms-auto rounded-full bg-primary px-2 text-xs text-primary-foreground">
      {n}
      <span className="sr-only"> {t("mw.badge")}</span>
    </span>
  );
}
