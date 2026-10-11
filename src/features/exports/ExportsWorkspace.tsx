import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, ShieldCheck } from "lucide-react";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { myProjectsQuery, type MyProject } from "@/features/projects/api";
import { friendlyError } from "@/features/guidance/errors";
import type { Focus } from "@/features/navigation/focus";
import {
  courseElementsQuery,
  downloadBase64,
  exportablesQuery,
  exportHistoryQuery,
  exportOptionsQuery,
  findExport,
  sha256Hex,
  type ExportableVersion,
  type ExportOptions,
} from "./api";
import { exportArchitectureDocument, exportScormPackage } from "./exports.functions";

const k = (s: string) => s as MessageKey;
type Lang = "ar" | "en";
type FileResult = { fileName: string; mime: string; base64: string };

export function ExportsWorkspace({ userId, focus = {} }: { userId: string; focus?: Focus }) {
  const { t } = useLocale();
  const projects = useQuery(myProjectsQuery(userId));
  const [projectId, setProjectId] = useState(focus.project ?? "");
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
        <label htmlFor="ex-project" className="field-label">
          {t("rv.pickProject")}
        </label>
        <select
          id="ex-project"
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
      <ProjectExports key={project.id} project={project} />
    </div>
  );
}

function ProjectExports({ project }: { project: MyProject }) {
  const { t, locale } = useLocale();
  const [lang, setLang] = useState<Lang>(locale);
  const items = useQuery(exportablesQuery(project.id));
  const archs = (items.data ?? []).filter((v) => v.kind === "program_architecture");
  const courses = (items.data ?? []).filter((v) => v.kind === "course_content");
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("ex.intro")}</p>
      <fieldset>
        <legend className="field-label">{t("ex.lang")}</legend>
        <div role="radiogroup" className="flex gap-2">
          {(["ar", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              className={lang === l ? "chip-btn chip-btn-active" : "chip-btn"}
              onClick={() => setLang(l)}
            >
              {t(l === "ar" ? "ps.ar" : "ps.en")}
            </button>
          ))}
        </div>
      </fieldset>
      {items.isError && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(items.error, t)}
        </p>
      )}
      <section className="surface-card space-y-3 p-5" aria-labelledby="ex-prog">
        <h2 id="ex-prog" className="font-semibold">
          {t("ex.programDocs")}
        </h2>
        {items.isLoading ? (
          <p role="status">…</p>
        ) : archs.length ? (
          <ul className="space-y-3">
            {archs.map((v) => (
              <VersionRow key={v.versionId} v={v} project={project} lang={lang} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("ex.none")}</p>
        )}
      </section>
      <section className="surface-card space-y-3 p-5" aria-labelledby="ex-lms">
        <h2 id="ex-lms" className="font-semibold">
          {t("ex.coursePackages")}
        </h2>
        {items.isLoading ? (
          <p role="status">…</p>
        ) : courses.length ? (
          <ul className="space-y-3">
            {courses.map((v) => (
              <VersionRow key={v.versionId} v={v} project={project} lang={lang} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("ex.none")}</p>
        )}
      </section>
      <History projectId={project.id} />
      <Verify />
    </div>
  );
}

function ModeLine({ o }: { o: ExportOptions }) {
  const { t } = useLocale();
  if (o.official)
    return (
      <p className="notice notice-ok text-sm" role="status">
        {t("ex.mode.official")}
      </p>
    );
  if (o.preview)
    return (
      <p className="notice notice-warn text-sm" role="status">
        {t("ex.mode.preview")}
      </p>
    );
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {friendlyError({ message: o.preview_problem ?? o.official_problem ?? "" }, t)}
    </p>
  );
}

function VersionRow({
  v,
  project,
  lang,
}: {
  v: ExportableVersion;
  project: MyProject;
  lang: Lang;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const isArch = v.kind === "program_architecture";
  const options = useQuery(
    exportOptionsQuery(v.versionId, isArch ? "course_spec_docx" : "scorm12"),
  );
  const courses = useQuery({ ...courseElementsQuery(v.versionId), enabled: isArch });
  const [done, setDone] = useState("");
  const o = options.data;
  const official = !!o?.official;
  const allowed = !!o && (o.official || o.preview);
  const run = useMutation({
    mutationFn: async (job: { key: string; go: () => Promise<FileResult> }) => {
      const r = await job.go();
      downloadBase64(r.base64, r.fileName, r.mime);
      return job.key;
    },
    onSuccess: (key) => {
      setDone(key);
      void qc.invalidateQueries({ queryKey: ["export-history", project.id] });
    },
  });
  const base = { versionId: v.versionId, lang, official };
  const button = (key: string, labelText: string, go: () => Promise<FileResult>) => (
    <button
      key={key}
      type="button"
      className={official ? "btn-primary" : "chip-btn"}
      disabled={!allowed || run.isPending}
      onClick={() => run.mutate({ key, go })}
    >
      <FileDown aria-hidden className="me-1 inline size-4" />
      {run.isPending && run.variables?.key === key ? t("ex.working") : labelText}
      {!official && allowed ? ` · ${t("ex.previewLabel")}` : ""}
    </button>
  );

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{v.title}</span>
        <span className="text-sm text-muted-foreground">v{v.versionNumber}</span>
        <span className="state-badge" data-state={v.state}>
          {t(k(`state.${v.state}`))}
        </span>
      </div>
      {o && <ModeLine o={o} />}
      <div className="flex flex-wrap gap-2">
        {isArch ? (
          <>
            {button("summary", t("ex.summary"), () =>
              exportArchitectureDocument({ data: { ...base, format: "program_summary_docx" } }),
            )}
            {(courses.data ?? []).map((c) =>
              button(
                c.id,
                `${t("ex.spec")}: ${c.code || (lang === "ar" ? c.label_ar : c.label_en)}`,
                () =>
                  exportArchitectureDocument({
                    data: { ...base, format: "course_spec_docx", courseKey: c.id },
                  }),
              ),
            )}
          </>
        ) : (
          button("scorm", t("ex.scorm"), () => exportScormPackage({ data: base }))
        )}
      </div>
      {run.isError && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(run.error, t)}
        </p>
      )}
      {done && !run.isPending && !run.isError && (
        <p role="status" className="text-sm text-secondary">
          {t("ex.downloaded")}
        </p>
      )}
    </li>
  );
}

function History({ projectId }: { projectId: string }) {
  const { t } = useLocale();
  const h = useQuery(exportHistoryQuery(projectId));
  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby="ex-hist">
      <h2 id="ex-hist" className="font-semibold">
        {t("ex.history")}
      </h2>
      {h.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(h.error, t)}
        </p>
      ) : !h.data?.length ? (
        <p className="text-sm text-muted-foreground">{t("rv.none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-muted-foreground">
                <th className="p-2 text-start">{t("ex.h.date")}</th>
                <th className="p-2 text-start">{t("ex.h.kind")}</th>
                <th className="p-2 text-start">{t("ex.h.file")}</th>
                <th className="p-2 text-start">{t("ex.h.state")}</th>
                <th className="p-2 text-start">{t("ex.h.hash")}</th>
              </tr>
            </thead>
            <tbody>
              {h.data.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2" dir="ltr">
                    {r.created_at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="p-2">
                    {t(k(`ex.fmt.${r.format}`))} ·{" "}
                    {r.official ? t("ex.official") : t("ex.previewLabel")}
                  </td>
                  <td className="p-2 break-all" dir="ltr">
                    {r.file_name}
                  </td>
                  <td className="p-2">{t(k(`state.${r.version_state}`))}</td>
                  <td className="p-2 font-mono text-xs" dir="ltr" title={r.sha256}>
                    {r.sha256.slice(0, 12)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Verify() {
  const { t } = useLocale();
  const check = useMutation({
    mutationFn: async (file: File) => findExport(await sha256Hex(await file.arrayBuffer())),
  });
  const r = check.data;
  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby="ex-verify">
      <h2 id="ex-verify" className="flex items-center gap-2 font-semibold">
        <ShieldCheck aria-hidden className="size-5" />
        {t("ex.verify")}
      </h2>
      <label htmlFor="ex-file" className="field-label">
        {t("ex.verifyHint")}
      </label>
      <input
        id="ex-file"
        type="file"
        className="field-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) check.mutate(f);
        }}
      />
      {check.isPending && <p role="status">…</p>}
      {check.isError && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(check.error, t)}
        </p>
      )}
      {check.isSuccess &&
        (r ? (
          <p role="status" className="notice notice-ok text-sm">
            {t("ex.verify.match")} {t(k(`ex.fmt.${r.format}`))} ·{" "}
            {r.official ? t("ex.official") : t("ex.previewLabel")} ·{" "}
            <span dir="ltr">{r.created_at.slice(0, 10)}</span> ·{" "}
            <span dir="ltr">{r.file_name}</span>
          </p>
        ) : (
          <p role="status" className="notice notice-warn text-sm">
            {t("ex.verify.none")}
          </p>
        ))}
    </section>
  );
}
