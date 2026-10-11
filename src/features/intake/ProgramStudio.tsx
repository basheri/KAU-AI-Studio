import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { myProjectsQuery, type MyProject } from "@/features/projects/api";
import { ArchitectureEditor } from "@/features/architecture/ArchitectureEditor";
import { structuredArtifactsQuery, type StructuredArtifact } from "./api";
import { BriefEditor } from "./BriefEditor";
import { IntakeForm } from "./IntakeForm";

const k = (s: string) => s as MessageKey;

export function ProgramStudio({ userId }: { userId: string }) {
  const { t } = useLocale();
  const projects = useQuery(myProjectsQuery(userId));
  const [projectId, setProjectId] = useState("");
  const project = projects.data?.find((p) => p.id === projectId) ?? projects.data?.[0];
  if (projects.isLoading)
    return (
      <p role="status" className="text-muted-foreground">
        …
      </p>
    );
  if (projects.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("rv.failed")}
      </p>
    );
  if (!project)
    return <p className="surface-card p-5 text-sm text-muted-foreground">{t("rv.noProjects")}</p>;
  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <label htmlFor="ps-project" className="field-label">
          {t("rv.pickProject")}
        </label>
        <select
          id="ps-project"
          className="field-input"
          value={project.id}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.data!.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <ProjectStudio key={project.id} project={project} />
    </div>
  );
}

function ArtifactList({
  items,
  selected,
  onSelect,
  empty,
}: {
  items: StructuredArtifact[];
  selected: string | null;
  onSelect: (id: string) => void;
  empty: MessageKey;
}) {
  const { t } = useLocale();
  if (!items.length) return <p className="text-sm text-muted-foreground">{t(empty)}</p>;
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id}>
          <button
            className={selected === a.id ? "list-item list-item-active" : "list-item"}
            aria-pressed={selected === a.id}
            onClick={() => onSelect(a.id)}
          >
            <span className="block min-w-0 truncate font-medium">{a.title}</span>
            <span className="state-badge" data-state={a.versions[0]?.state}>
              v{a.versions[0]?.version_number} · {t(k(`state.${a.versions[0]?.state}`))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ProjectStudio({ project }: { project: MyProject }) {
  const { t } = useLocale();
  const items = useQuery(structuredArtifactsQuery(project.id));
  const [selected, setSelected] = useState<{ id: string } | { versionId: string } | null>(null);
  const canContribute = project.role !== "observer";
  const all = items.data ?? [];
  const briefs = all.filter((a) => a.kind === "program_brief");
  const archs = all.filter((a) => a.kind === "program_architecture");
  const current = selected
    ? all.find((a) =>
        "id" in selected
          ? a.id === selected.id
          : a.versions.some((v) => v.id === selected.versionId),
      )
    : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="surface-card p-5" aria-labelledby="ps-briefs">
          <h2 id="ps-briefs" className="mb-3 font-semibold">
            {t("ps.briefs")}
          </h2>
          {items.isLoading ? (
            <p role="status">…</p>
          ) : items.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("rv.failed")}
            </p>
          ) : (
            <ArtifactList
              items={briefs}
              selected={current?.id ?? null}
              onSelect={(id) => setSelected({ id })}
              empty="ps.noBriefs"
            />
          )}
        </section>
        <section className="surface-card p-5" aria-labelledby="ps-archs">
          <h2 id="ps-archs" className="mb-3 font-semibold">
            {t("ps.architectures")}
          </h2>
          <ArtifactList
            items={archs}
            selected={current?.id ?? null}
            onSelect={(id) => setSelected({ id })}
            empty="ps.noArchitectures"
          />
        </section>
        {canContribute ? (
          <section className="surface-card p-5">
            <IntakeForm
              projectId={project.id}
              onCreated={(versionId) => setSelected({ versionId })}
            />
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">{t("rv.observerNote")}</p>
        )}
      </div>
      <div className="min-w-0">
        {current?.kind === "program_brief" ? (
          <BriefEditor
            key={current.id}
            artifact={current}
            canContribute={canContribute}
            onArchitecture={(versionId) => setSelected({ versionId })}
          />
        ) : current?.kind === "program_architecture" ? (
          <ArchitectureEditor key={current.id} artifact={current} canContribute={canContribute} />
        ) : (
          <p className="surface-card p-5 text-sm text-muted-foreground">{t("ps.selectHint")}</p>
        )}
      </div>
    </div>
  );
}
