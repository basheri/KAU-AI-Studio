import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { myProjectsQuery, type MyProject } from "@/features/projects/api";
import { structuredArtifactsQuery, type StructuredArtifact } from "@/features/intake/api";
import {
  alignedArchitecturesQuery,
  courseQuery,
  createCourseContent,
  mediaQuery,
  registerMedia,
  saveCourseContent,
  type CourseData,
} from "./api";
import { CourseEditor } from "./CourseEditor";
import type { CourseTree } from "./tree";

const k = (s: string) => s as MessageKey;
const errText = (e: unknown) =>
  e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";

export function CourseStudio({ userId }: { userId: string }) {
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
        <label htmlFor="cs-project" className="field-label">
          {t("rv.pickProject")}
        </label>
        <select
          id="cs-project"
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
      <ProjectCourses key={project.id} project={project} />
    </div>
  );
}

function CreateCourse({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (v: string) => void;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const archs = useQuery(alignedArchitecturesQuery(projectId));
  const [arch, setArch] = useState("");
  const [course, setCourse] = useState("");
  const a = archs.data?.find((x) => x.versionId === arch) ?? archs.data?.[0];
  const c = a?.courses.find((x) => x.id === course) ?? a?.courses[0];
  const create = useMutation({
    mutationFn: () => createCourseContent(a!.versionId, c!.id),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["structured-artifacts", projectId] });
      qc.invalidateQueries({ queryKey: ["aligned-architectures", projectId] });
      onCreated(v);
    },
  });
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">{t("cs.newCourse")}</h2>
      {archs.isLoading ? (
        <p role="status">…</p>
      ) : archs.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("rv.failed")}
        </p>
      ) : !a ? (
        <p className="text-sm text-muted-foreground">{t("cs.noAligned")}</p>
      ) : (
        <>
          <div>
            <label htmlFor="cs-arch" className="field-label">
              {t("cs.architecture")}
            </label>
            <select
              id="cs-arch"
              className="field-input"
              value={a.versionId}
              onChange={(e) => (setArch(e.target.value), setCourse(""))}
            >
              {archs.data!.map((x) => (
                <option key={x.versionId} value={x.versionId}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cs-course" className="field-label">
              {t("cs.course")}
            </label>
            <select
              id="cs-course"
              className="field-input"
              value={c?.id ?? ""}
              onChange={(e) => setCourse(e.target.value)}
            >
              {a.courses.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!c || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t("ps.working") : t("cs.create")}
          </button>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errText(create.error) || t("rv.failed")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MediaPanel({ projectId, canContribute }: { projectId: string; canContribute: boolean }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const media = useQuery(mediaQuery(projectId));
  const [form, setForm] = useState({ kind: "image", title: "", source_url: "", rights_note: "" });
  const [invalid, setInvalid] = useState(false);
  const add = useMutation({
    mutationFn: () => registerMedia(projectId, form as never),
    onSuccess: () => {
      setForm({ kind: form.kind, title: "", source_url: "", rights_note: "" });
      qc.invalidateQueries({ queryKey: ["media-assets", projectId] });
    },
  });
  const submit = () => {
    const bad =
      !form.title.trim() ||
      (form.source_url !== "" && !/^https:\/\/[^\s<>"]+$/.test(form.source_url));
    setInvalid(bad);
    if (!bad) add.mutate();
  };
  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby="cs-media">
      <h2 id="cs-media" className="font-semibold">
        {t("cs.media")}
      </h2>
      {media.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("rv.failed")}
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {media.data?.map((m) => (
          <li key={m.id}>
            {t(k(`block.${m.kind}`))}: {m.title}
            {(!m.source_url || !m.rights_note) && (
              <span className="text-destructive"> · {t("cs.mediaIncomplete")}</span>
            )}
          </li>
        ))}
      </ul>
      {canContribute && (
        <div className="space-y-2">
          <div>
            <label htmlFor="md-kind" className="field-label">
              {t("cs.mediaKind")}
            </label>
            <select
              id="md-kind"
              className="field-input"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              {["image", "audio", "video"].map((x) => (
                <option key={x} value={x}>
                  {t(k(`block.${x}`))}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ["title", "cs.mediaTitle"],
              ["source_url", "cs.mediaUrl"],
              ["rights_note", "cs.mediaRights"],
            ] as const
          ).map(([f, l]) => (
            <div key={f}>
              <label htmlFor={`md-${f}`} className="field-label">
                {t(l)}
              </label>
              <input
                id={`md-${f}`}
                className="field-input"
                dir={f === "source_url" ? "ltr" : undefined}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              />
            </div>
          ))}
          <button type="button" className="btn-primary" disabled={add.isPending} onClick={submit}>
            {t("cs.mediaAdd")}
          </button>
          {(invalid || add.isError) && (
            <p role="alert" className="text-sm text-destructive">
              {invalid ? t("cs.mediaInvalid") : errText(add.error) || t("rv.failed")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ProjectCourses({ project }: { project: MyProject }) {
  const { t } = useLocale();
  const items = useQuery(structuredArtifactsQuery(project.id));
  const [sel, setSel] = useState<{ id: string } | { versionId: string } | null>(null);
  const canContribute = project.role !== "observer";
  const courses = (items.data ?? []).filter((a) => a.kind === "course_content");
  const current = sel
    ? courses.find((a) =>
        "id" in sel ? a.id === sel.id : a.versions.some((v) => v.id === sel.versionId),
      )
    : undefined;
  const versionId = current
    ? "versionId" in sel!
      ? sel.versionId
      : current.versions[0]?.id
    : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="surface-card p-5" aria-labelledby="cs-courses">
          <h2 id="cs-courses" className="mb-3 font-semibold">
            {t("cs.courses")}
          </h2>
          {items.isLoading ? (
            <p role="status">…</p>
          ) : items.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("rv.failed")}
            </p>
          ) : !courses.length ? (
            <p className="text-sm text-muted-foreground">{t("cs.noCourses")}</p>
          ) : (
            <ul className="space-y-2">
              {courses.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={current?.id === a.id ? "list-item list-item-active" : "list-item"}
                    aria-pressed={current?.id === a.id}
                    onClick={() => setSel({ id: a.id })}
                  >
                    <span className="block min-w-0 truncate font-medium">{a.title}</span>
                    <span className="state-badge" data-state={a.versions[0]?.state}>
                      v{a.versions[0]?.version_number} · {t(k(`state.${a.versions[0]?.state}`))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {canContribute ? (
          <section className="surface-card p-5">
            <CreateCourse projectId={project.id} onCreated={(v) => setSel({ versionId: v })} />
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">{t("rv.observerNote")}</p>
        )}
        <MediaPanel projectId={project.id} canContribute={canContribute} />
      </div>
      <div className={current ? "order-first min-w-0 lg:order-none" : "min-w-0"}>
        {current && versionId ? (
          <CourseWorkspace
            key={versionId}
            projectId={project.id}
            artifact={current}
            versionId={versionId}
            canContribute={canContribute}
            onVersion={(v) => setSel({ versionId: v })}
          />
        ) : (
          <p className="surface-card p-5 text-sm text-muted-foreground">{t("cs.selectHint")}</p>
        )}
      </div>
    </div>
  );
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function CourseWorkspace({
  projectId,
  artifact,
  versionId,
  canContribute,
  onVersion,
}: {
  projectId: string;
  artifact: StructuredArtifact;
  versionId: string;
  canContribute: boolean;
  onVersion: (v: string) => void;
}) {
  const { t } = useLocale();
  const course = useQuery({ ...courseQuery(versionId), gcTime: 0, staleTime: 0 });
  const media = useQuery(mediaQuery(projectId));
  if (course.isLoading) return <p role="status">…</p>;
  if (course.isError)
    return (
      <div role="alert" className="surface-card space-y-2 p-5 text-sm">
        <p className="text-destructive">{t("cs.loadFailed")}</p>
        <button type="button" className="btn-link" onClick={() => course.refetch()}>
          {t("cs.retryLoad")}
        </button>
      </div>
    );
  return (
    <LoadedWorkspace
      data={course.data!}
      artifact={artifact}
      versionId={versionId}
      canContribute={canContribute}
      media={media.data ?? []}
      onVersion={onVersion}
      projectId={projectId}
    />
  );
}

function LoadedWorkspace({
  data,
  artifact,
  versionId,
  canContribute,
  media,
  onVersion,
  projectId,
}: {
  data: CourseData;
  artifact: StructuredArtifact;
  versionId: string;
  canContribute: boolean;
  media: Awaited<ReturnType<NonNullable<ReturnType<typeof mediaQuery>["queryFn"]>>>;
  onVersion: (v: string) => void;
  projectId: string;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const version = artifact.versions.find((v) => v.id === versionId);
  const isDraft = version?.state === "draft";
  const editable = canContribute && isDraft;
  const [tree, setTree] = useState<CourseTree>(data.tree);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const latest = useRef(tree);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = useCallback(async () => {
    if (!dirty.current) return;
    clearTimeout(timer.current);
    const snapshot = latest.current;
    setState("saving");
    try {
      await saveCourseContent(versionId, snapshot);
      if (latest.current === snapshot) {
        dirty.current = false;
        setState("saved");
      } else setState("dirty");
      setError("");
      qc.invalidateQueries({ queryKey: ["structured-artifacts", projectId] });
    } catch (e) {
      setState("error");
      setError(errText(e));
    }
  }, [versionId, qc, projectId]);

  const onChange = (next: CourseTree) => {
    setTree(next);
    latest.current = next;
    dirty.current = true;
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
  };

  // Unsaved-change protection: warn on page unload and flush on leaving this version.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (dirty.current) void saveCourseContent(versionId, latest.current).catch(() => {});
      clearTimeout(timer.current);
    };
  }, [versionId]);

  const revise = useMutation({
    mutationFn: () => saveCourseContent(versionId, tree, "Revision"),
    onSuccess: (child) => {
      qc.invalidateQueries({ queryKey: ["structured-artifacts", projectId] });
      onVersion(child);
    },
  });

  const statusText: Record<SaveState, MessageKey | null> = {
    idle: null,
    dirty: "cs.unsaved",
    saving: "cs.saving",
    saved: "cs.saved",
    error: "cs.saveFailed",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{artifact.title}</h2>
          <label htmlFor="cs-version" className="sr-only">
            {t("cs.version")}
          </label>
          <select
            id="cs-version"
            className="field-input mt-1 w-auto"
            value={versionId}
            onChange={(e) => onVersion(e.target.value)}
          >
            {artifact.versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_number} · {t(k(`state.${v.state}`))}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {statusText[state] ? t(statusText[state]!) : ""}
          </p>
          {state === "error" && (
            <button type="button" className="btn-link" onClick={save}>
              {t("cs.retry")}
            </button>
          )}
          <Link to="/reviews" className="btn-link">
            {t("cs.goReview")}
          </Link>
        </div>
      </div>
      {state === "error" && error && (
        <p role="alert" className="notice notice-warn">
          {error}
        </p>
      )}
      {!isDraft && (
        <div className="notice notice-warn flex flex-wrap items-center justify-between gap-2">
          <span>{t("cs.locked")}</span>
          {canContribute && version?.state !== "superseded" && version?.state !== "archived" && (
            <button
              type="button"
              className="btn-primary"
              disabled={revise.isPending}
              onClick={() => revise.mutate()}
            >
              {t("cs.revise")}
            </button>
          )}
        </div>
      )}
      {revise.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errText(revise.error) || t("rv.failed")}
        </p>
      )}
      <CourseEditor
        tree={tree}
        onChange={onChange}
        readOnly={!editable}
        media={media}
        outcomes={data.outcomes}
        aiVersionId={versionId}
      />
    </div>
  );
}
