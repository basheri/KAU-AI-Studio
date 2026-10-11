import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { myProjectsQuery, type MyProject } from "@/features/projects/api";
import {
  addComment,
  artifactsQuery,
  assignReviewer,
  createArtifact,
  createException,
  decideException,
  decideReview,
  editArtifact,
  exceptionsQuery,
  membersQuery,
  requestReview,
  stagesQuery,
  versionReviewQuery,
  versionsQuery,
  type Stage,
  type Version,
} from "./api";
import {
  ARTIFACT_KINDS,
  canDecideException,
  decisionProblem,
  editOutcome,
  selfDecisionBlocked,
  type ArtifactKind,
  type DecisionKind,
} from "./rules";
import { diffLines } from "./diff";
import { ReviewAi } from "@/features/ai/ReviewAi";

const k = (s: string) => s as MessageKey;

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries();
}

function ErrorNote({ show }: { show: boolean }) {
  const { t } = useLocale();
  return show ? (
    <p role="alert" className="text-sm text-destructive">
      {t("rv.failed")}
    </p>
  ) : null;
}

function StateBadge({ state }: { state: Version["state"] }) {
  const { t } = useLocale();
  return (
    <span className="state-badge" data-state={state}>
      {t(k(`state.${state}`))}
    </span>
  );
}

export function ReviewWorkspace({ userId }: { userId: string }) {
  const { t } = useLocale();
  const projects = useQuery(myProjectsQuery(userId));
  const [projectId, setProjectId] = useState<string>("");
  const project = projects.data?.find((p) => p.id === projectId) ?? projects.data?.[0];

  if (projects.isLoading) return <p className="text-muted-foreground">…</p>;
  if (!project)
    return <p className="surface-card p-5 text-sm text-muted-foreground">{t("rv.noProjects")}</p>;

  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <label htmlFor="rv-project" className="field-label">
          {t("rv.pickProject")}
        </label>
        <select
          id="rv-project"
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
      <ProjectReviews key={project.id} project={project} userId={userId} />
    </div>
  );
}

function ProjectReviews({ project, userId }: { project: MyProject; userId: string }) {
  const { t, locale } = useLocale();
  const stages = useQuery(stagesQuery(project.id));
  const artifacts = useQuery(artifactsQuery(project.id));
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const selected = artifacts.data?.find((a) => a.id === artifactId) ?? artifacts.data?.[0] ?? null;
  const canContribute = project.role !== "observer";

  return (
    <>
      <section className="surface-card p-5" aria-labelledby="rv-stages">
        <h2 id="rv-stages" className="mb-3 font-semibold">
          {t("rv.workflow")}
        </h2>
        <ol className="flex flex-wrap gap-2">
          {stages.data?.map((s) => (
            <li
              key={s.id}
              className="stage-pill"
              aria-current={selected?.current_stage_id === s.id ? "step" : undefined}
            >
              <span className="font-medium">
                {s.position}. {locale === "ar" ? s.name_ar : s.name_en}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("rv.approvers")}: {s.approver_roles.map((r) => t(k(`role.${r}`))).join("، ")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="surface-card p-5" aria-labelledby="rv-artifacts">
            <h2 id="rv-artifacts" className="mb-3 font-semibold">
              {t("rv.artifacts")}
            </h2>
            {artifacts.data?.length ? (
              <ul className="space-y-2">
                {artifacts.data.map((a) => {
                  const latest = [...a.artifact_versions].sort(
                    (x, y) => y.version_number - x.version_number,
                  )[0];
                  return (
                    <li key={a.id}>
                      <button
                        className={
                          selected?.id === a.id ? "list-item list-item-active" : "list-item"
                        }
                        aria-pressed={selected?.id === a.id}
                        onClick={() => setArtifactId(a.id)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{a.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {t(k(`kind.${a.kind}`))} · v{latest?.version_number}
                          </span>
                        </span>
                        {latest && <StateBadge state={latest.state} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("rv.noArtifacts")}</p>
            )}
          </section>
          {canContribute ? (
            <NewArtifact projectId={project.id} onCreated={setArtifactId} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("rv.observerNote")}</p>
          )}
        </div>

        {selected && stages.data && (
          <ArtifactDetail
            key={selected.id}
            project={project}
            userId={userId}
            artifactId={selected.id}
            stages={stages.data}
            currentStageId={selected.current_stage_id}
          />
        )}
      </div>
    </>
  );
}

function NewArtifact({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (id: string) => void;
}) {
  const { t } = useLocale();
  const refresh = useInvalidateAll();
  const [kind, setKind] = useState<ArtifactKind>("program_brief");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const m = useMutation({
    mutationFn: () => createArtifact(projectId, kind, title, content),
    onSuccess: (id) => {
      setTitle("");
      setContent("");
      onCreated(id);
      refresh();
    },
  });
  return (
    <section className="surface-card p-5" aria-labelledby="rv-new">
      <h2 id="rv-new" className="mb-3 font-semibold">
        {t("rv.newArtifact")}
      </h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) m.mutate();
        }}
      >
        <div>
          <label htmlFor="na-kind" className="field-label">
            {t("rv.kind")}
          </label>
          <select
            id="na-kind"
            className="field-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ArtifactKind)}
          >
            {ARTIFACT_KINDS.map((x) => (
              <option key={x} value={x}>
                {t(k(`kind.${x}`))}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="na-title" className="field-label">
            {t("rv.titleField")}
          </label>
          <input
            id="na-title"
            className="field-input"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="na-content" className="field-label">
            {t("rv.content")}
          </label>
          <textarea
            id="na-content"
            className="field-input"
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <ErrorNote show={m.isError} />
        <button className="btn-primary" disabled={m.isPending || !title.trim()}>
          {t("rv.create")}
        </button>
      </form>
    </section>
  );
}

function ArtifactDetail({
  project,
  userId,
  artifactId,
  stages,
  currentStageId,
}: {
  project: MyProject;
  userId: string;
  artifactId: string;
  stages: Stage[];
  currentStageId: string | null;
}) {
  const { t, locale } = useLocale();
  const versions = useQuery(versionsQuery(artifactId));
  const members = useQuery(membersQuery(project.id));
  const [versionId, setVersionId] = useState<string | null>(null);
  const version = versions.data?.find((v) => v.id === versionId) ?? versions.data?.[0];
  const stageName = (id: string | null) => {
    const s = stages.find((x) => x.id === id);
    return s ? (locale === "ar" ? s.name_ar : s.name_en) : "—";
  };
  const emailOf = (id: string) =>
    members.data?.find((m) => m.user_id === id)?.email ?? id.slice(0, 8);

  if (!versions.data || !version) return <p className="text-muted-foreground">…</p>;

  return (
    <div className="min-w-0 space-y-6">
      <section className="surface-card p-5" aria-labelledby="rv-versions">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="rv-versions" className="font-semibold">
            {t("rv.versions")}
          </h2>
          <span className="text-sm text-muted-foreground">
            {t("rv.stage")}: {stageName(currentStageId)}
          </span>
        </div>
        <div role="radiogroup" aria-labelledby="rv-versions" className="flex flex-wrap gap-2">
          {versions.data.map((v) => {
            const parent = versions.data.find((p) => p.id === v.parent_version_id);
            return (
              <button
                key={v.id}
                role="radio"
                aria-checked={v.id === version.id}
                className={v.id === version.id ? "chip-btn chip-btn-active" : "chip-btn"}
                onClick={() => setVersionId(v.id)}
              >
                v{v.version_number}
                {parent ? ` (${t("rv.parent")} v${parent.version_number})` : ""}{" "}
                <StateBadge state={v.state} />
              </button>
            );
          })}
        </div>
      </section>

      <VersionEditor
        key={version.id}
        version={version}
        canContribute={project.role !== "observer"}
        onSaved={setVersionId}
      />
      <ReviewPanel
        key={`r-${version.id}`}
        project={project}
        userId={userId}
        artifactId={artifactId}
        version={version}
        stages={stages}
        stageName={stageName}
        emailOf={emailOf}
        members={members.data ?? []}
      />
      <CompareVersions versions={versions.data} />
    </div>
  );
}

function VersionEditor({
  version,
  canContribute,
  onSaved,
}: {
  version: Version;
  canContribute: boolean;
  onSaved: (id: string) => void;
}) {
  const { t } = useLocale();
  const refresh = useInvalidateAll();
  const outcome = editOutcome(version.state);
  const [content, setContent] = useState(version.content);
  const [summary, setSummary] = useState("");
  const m = useMutation({
    mutationFn: () => editArtifact(version.id, content, summary),
    onSuccess: (id) => {
      setSummary("");
      onSaved(id);
      refresh();
    },
  });
  const editable = canContribute && outcome !== "blocked";
  return (
    <section className="surface-card p-5" aria-labelledby="rv-editor">
      <h2 id="rv-editor" className="mb-3 font-semibold">
        {t("rv.version")} {version.version_number} <StateBadge state={version.state} />
      </h2>
      {version.change_summary && (
        <p className="mb-3 text-sm text-muted-foreground">{version.change_summary}</p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <label htmlFor="ve-content" className="sr-only">
          {t("rv.content")}
        </label>
        <textarea
          id="ve-content"
          dir="auto"
          className="field-input font-mono"
          rows={10}
          value={content}
          readOnly={!editable}
          onChange={(e) => setContent(e.target.value)}
        />
        {editable && (
          <>
            {outcome === "child" && (
              <p className="text-sm text-muted-foreground" role="note">
                {t("rv.lockedNote")}
              </p>
            )}
            <div>
              <label htmlFor="ve-summary" className="field-label">
                {t("rv.summary")}
              </label>
              <input
                id="ve-summary"
                className="field-input"
                maxLength={1000}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            <ErrorNote show={m.isError} />
            <button
              className="btn-primary"
              disabled={m.isPending || (outcome === "child" && content === version.content)}
            >
              {outcome === "child" ? t("rv.proposeChild") : t("rv.saveDraft")}
            </button>
          </>
        )}
        {!editable && <p className="text-sm text-muted-foreground">{t("rv.readOnly")}</p>}
      </form>
    </section>
  );
}

type Member = { user_id: string; email: string; role: string };

function MemberChecks({
  id,
  members,
  value,
  onChange,
  exclude,
}: {
  id: string;
  members: Member[];
  value: string[];
  onChange: (v: string[]) => void;
  exclude?: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {members
        .filter((m) => m.user_id !== exclude)
        .map((m) => (
          <label key={m.user_id} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id={`${id}-${m.user_id}`}
              checked={value.includes(m.user_id)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, m.user_id] : value.filter((x) => x !== m.user_id),
                )
              }
            />
            {m.email}
          </label>
        ))}
    </div>
  );
}

function ReviewPanel({
  project,
  userId,
  artifactId,
  version,
  stages,
  stageName,
  emailOf,
  members,
}: {
  project: MyProject;
  userId: string;
  artifactId: string;
  version: Version;
  stages: Stage[];
  stageName: (id: string | null) => string;
  emailOf: (id: string) => string;
  members: Member[];
}) {
  const { t } = useLocale();
  const refresh = useInvalidateAll();
  const review = useQuery(versionReviewQuery(version.id));
  const exceptions = useQuery(exceptionsQuery(project.id));
  const canContribute = project.role !== "observer";
  const open = review.data?.requests.find((r) => r.status === "open");
  const openStage = stages.find((s) => s.id === open?.stage_id);
  const roleCanDecide = !!openStage && openStage.approver_roles.includes(project.role);
  const selfBlocked =
    !!open &&
    !!openStage &&
    selfDecisionBlocked({
      stageKey: openStage.stage_key,
      userId,
      requestedBy: open.requested_by,
      versionCreatedBy: version.created_by,
    });
  const canDecide = roleCanDecide && !selfBlocked;

  // Request review
  const [note, setNote] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const req = useMutation({
    mutationFn: () => requestReview(version.id, note, assignees),
    onSuccess: refresh,
  });

  // Assign
  const [assignee, setAssignee] = useState("");
  const assign = useMutation({
    mutationFn: () => assignReviewer(open!.id, assignee),
    onSuccess: () => {
      setAssignee("");
      refresh();
    },
  });

  // Decide
  const [decision, setDecision] = useState<DecisionKind>("approve");
  const [comment, setComment] = useState("");
  const [exceptionId, setExceptionId] = useState("");
  const [tried, setTried] = useState(false);
  const problem = decisionProblem(decision, comment, exceptionId || null);
  const decide = useMutation({
    mutationFn: () => decideReview(open!.id, decision, comment, exceptionId || null),
    onSuccess: () => {
      setComment("");
      setTried(false);
      refresh();
    },
  });
  function submitDecision(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!problem) decide.mutate();
  }

  // New exception
  const [exTitle, setExTitle] = useState("");
  const [exJust, setExJust] = useState("");
  const addEx = useMutation({
    mutationFn: () => createException(project.id, artifactId, exTitle, exJust),
    onSuccess: () => {
      setExTitle("");
      setExJust("");
      refresh();
    },
  });
  const projectExceptions = (exceptions.data ?? []).filter(
    (x) => !x.artifact_id || x.artifact_id === artifactId,
  );
  const approvedExceptions = projectExceptions.filter((x) => x.status === "approved");
  const exRef = (id: string | null) => exceptions.data?.find((x) => x.id === id)?.reference;

  return (
    <>
      {version.state === "draft" && canContribute && (
        <section className="surface-card p-5" aria-labelledby="rv-request">
          <h2 id="rv-request" className="mb-3 font-semibold">
            {t("rv.requestReview")}
          </h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              req.mutate();
            }}
          >
            <div>
              <label htmlFor="rq-note" className="field-label">
                {t("rv.note")}
              </label>
              <input
                id="rq-note"
                className="field-input"
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <fieldset>
              <legend className="field-label">{t("rv.assignees")}</legend>
              <MemberChecks id="rq-a" members={members} value={assignees} onChange={setAssignees} />
            </fieldset>
            <ErrorNote show={req.isError} />
            <button className="btn-primary" disabled={req.isPending}>
              {t("rv.requestReview")}
            </button>
          </form>
        </section>
      )}

      {open && (
        <section className="surface-card p-5" aria-labelledby="rv-open">
          <h2 id="rv-open" className="mb-1 font-semibold">
            {t("rv.openReview")}: {stageName(open.stage_id)}
          </h2>
          {open.note && <p className="mb-2 text-sm">{open.note}</p>}
          <p className="mb-3 text-sm text-muted-foreground">
            {t("rv.assigned")}:{" "}
            {open.review_assignments.length
              ? open.review_assignments.map((a) => emailOf(a.assignee_id)).join("، ")
              : t("rv.none")}
          </p>
          {canContribute && (open.requested_by === userId || project.role === "program_owner") && (
            <form
              className="mb-4 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (assignee) assign.mutate();
              }}
            >
              <div className="min-w-48 flex-1">
                <label htmlFor="as-user" className="field-label">
                  {t("rv.assign")}
                </label>
                <select
                  id="as-user"
                  className="field-input"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.email}
                    </option>
                  ))}
                </select>
              </div>
              <button className="chip-btn" disabled={!assignee || assign.isPending}>
                {t("rv.assign")}
              </button>
              <ErrorNote show={assign.isError} />
            </form>
          )}

          {canDecide ? (
            <form className="space-y-3" onSubmit={submitDecision} noValidate>
              <fieldset>
                <legend className="field-label">{t("rv.decide")}</legend>
                <div className="flex flex-wrap gap-4">
                  {(["approve", "request_changes", "approve_exception"] as const).map((d) => (
                    <label key={d} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="decision"
                        value={d}
                        checked={decision === d}
                        onChange={() => setDecision(d)}
                      />
                      {t(k(`rv.decision.${d}`))}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="dc-comment" className="field-label">
                  {t("rv.comment")}
                </label>
                <textarea
                  id="dc-comment"
                  className="field-input"
                  rows={3}
                  value={comment}
                  aria-invalid={tried && problem === "comment"}
                  aria-describedby="dc-err"
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="dc-exc" className="field-label">
                  {t("rv.exception")}
                </label>
                <select
                  id="dc-exc"
                  className="field-input"
                  value={exceptionId}
                  aria-invalid={tried && problem === "exception"}
                  onChange={(e) => setExceptionId(e.target.value)}
                >
                  <option value="">{t("rv.none")}</option>
                  {approvedExceptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.reference} — {x.title}
                    </option>
                  ))}
                </select>
              </div>
              <p id="dc-err" role="alert" className="text-sm text-destructive">
                {tried && problem === "comment"
                  ? t("rv.commentRequired")
                  : tried && problem === "exception"
                    ? t("rv.exceptionRequired")
                    : ""}
              </p>
              <ErrorNote show={decide.isError} />
              <button className="btn-primary" disabled={decide.isPending}>
                {t("rv.decide")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {roleCanDecide && selfBlocked ? t("rv.selfDecision") : t("rv.cannotDecide")}
            </p>
          )}

          {canContribute && (
            <details className="mt-4">
              <summary className="btn-link cursor-pointer">{t("rv.newException")}</summary>
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (exTitle.trim() && exJust.trim()) addEx.mutate();
                }}
              >
                <div>
                  <label htmlFor="ex-title" className="field-label">
                    {t("rv.titleField")}
                  </label>
                  <input
                    id="ex-title"
                    className="field-input"
                    maxLength={200}
                    value={exTitle}
                    onChange={(e) => setExTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="ex-just" className="field-label">
                    {t("rv.justification")}
                  </label>
                  <textarea
                    id="ex-just"
                    className="field-input"
                    rows={2}
                    value={exJust}
                    onChange={(e) => setExJust(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("rv.exceptionPending")}</p>
                <ErrorNote show={addEx.isError} />
                <button
                  className="chip-btn"
                  disabled={addEx.isPending || !exTitle.trim() || !exJust.trim()}
                >
                  {t("rv.addException")}
                </button>
              </form>
            </details>
          )}
        </section>
      )}

      <section className="surface-card p-5" aria-labelledby="rv-decisions">
        <h2 id="rv-decisions" className="mb-3 font-semibold">
          {t("rv.decisions")}
        </h2>
        {review.data?.decisions.length ? (
          <ol className="space-y-3">
            {review.data.decisions.map((d) => (
              <li key={d.id} className="border-s-2 border-secondary ps-3 text-sm">
                <p className="font-medium">
                  {t(k(`rv.decision.${d.decision}`))} · {stageName(d.stage_id)} · v
                  {version.version_number}
                </p>
                <p className="text-muted-foreground">
                  {emailOf(d.actor_id)} ({t(k(`role.${d.actor_role}`))}) ·{" "}
                  <time dateTime={d.decided_at}>{new Date(d.decided_at).toLocaleString()}</time>
                  {d.exception_id && <> · {exRef(d.exception_id)}</>}
                </p>
                {d.comment && <p className="mt-1">{d.comment}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("rv.noDecisions")}</p>
        )}
      </section>

      {canContribute && (
        <section className="surface-card p-5" aria-label={t("ai.label")}>
          <ReviewAi versionId={version.id} parentVersionId={version.parent_version_id} />
        </section>
      )}

      <ExceptionsPanel
        exceptions={projectExceptions}
        project={project}
        userId={userId}
        emailOf={emailOf}
        onChange={refresh}
      />

      <CommentThread
        versionId={version.id}
        canContribute={canContribute}
        emailOf={emailOf}
        members={members}
        userId={userId}
        comments={review.data?.comments ?? []}
        mentions={review.data?.mentions ?? []}
      />
    </>
  );
}

type DocumentedException = NonNullable<
  Awaited<ReturnType<NonNullable<ReturnType<typeof exceptionsQuery>["queryFn"]>>>
>[number];

function ExceptionsPanel({
  exceptions,
  project,
  userId,
  emailOf,
  onChange,
}: {
  exceptions: DocumentedException[];
  project: MyProject;
  userId: string;
  emailOf: (id: string) => string;
  onChange: () => void;
}) {
  const { t } = useLocale();
  return (
    <section className="surface-card p-5" aria-labelledby="rv-exceptions">
      <h2 id="rv-exceptions" className="mb-3 font-semibold">
        {t("rv.exceptions")}
      </h2>
      {exceptions.length ? (
        <ul className="space-y-3">
          {exceptions.map((x) => (
            <ExceptionItem
              key={x.id}
              exception={x}
              canDecide={canDecideException(x, project.role, userId)}
              emailOf={emailOf}
              onChange={onChange}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rv.noExceptions")}</p>
      )}
    </section>
  );
}

function ExceptionItem({
  exception: x,
  canDecide,
  emailOf,
  onChange,
}: {
  exception: DocumentedException;
  canDecide: boolean;
  emailOf: (id: string) => string;
  onChange: () => void;
}) {
  const { t } = useLocale();
  const [comment, setComment] = useState("");
  const [needComment, setNeedComment] = useState(false);
  const decide = useMutation({
    mutationFn: (approve: boolean) => decideException(x.id, approve, comment),
    onSuccess: () => {
      setComment("");
      onChange();
    },
  });
  const reject = () => {
    setNeedComment(!comment.trim());
    if (comment.trim()) decide.mutate(false);
  };
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">
          {x.reference} — {x.title}
        </p>
        <span
          className="state-badge"
          data-state={
            x.status === "approved"
              ? "approved"
              : x.status === "rejected"
                ? "changes_requested"
                : "in_review"
          }
        >
          {t(k(`rv.exStatus.${x.status}`))}
        </span>
      </div>
      <p className="mt-1">{x.justification}</p>
      <p className="mt-1 text-muted-foreground">
        {emailOf(x.created_by)}
        {x.decided_by && (
          <>
            {" "}
            · {t(k(`rv.exStatus.${x.status}`))}: {emailOf(x.decided_by)}
          </>
        )}
      </p>
      {x.decision_comment && <p className="mt-1">{x.decision_comment}</p>}
      {canDecide && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor={`exd-${x.id}`} className="field-label">
              {t("rv.exComment")}
            </label>
            <input
              id={`exd-${x.id}`}
              className="field-input"
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={decide.isPending}
            onClick={() => decide.mutate(true)}
          >
            {t("rv.exApprove")}
          </button>
          <button type="button" className="chip-btn" disabled={decide.isPending} onClick={reject}>
            {t("rv.exReject")}
          </button>
        </div>
      )}
      {needComment && (
        <p role="alert" className="mt-1 text-destructive">
          {t("rv.exCommentRequired")}
        </p>
      )}
      <ErrorNote show={decide.isError} />
    </li>
  );
}

type Comment = {
  id: string;
  parent_id: string | null;
  body: string;
  author_id: string;
  created_at: string;
};

function CommentThread({
  versionId,
  canContribute,
  emailOf,
  members,
  userId,
  comments,
  mentions,
}: {
  versionId: string;
  canContribute: boolean;
  emailOf: (id: string) => string;
  members: Member[];
  userId: string;
  comments: Comment[];
  mentions: { comment_id: string; user_id: string }[];
}) {
  const { t } = useLocale();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const roots = comments.filter((c) => !c.parent_id);
  const renderComment = (c: Comment) => {
    const ms = mentions.filter((m) => m.comment_id === c.id);
    return (
      <article className="text-sm" aria-label={emailOf(c.author_id)}>
        <p className="text-muted-foreground">
          {emailOf(c.author_id)} ·{" "}
          <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time>
        </p>
        <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
        {ms.length > 0 && (
          <p className="mt-1 text-xs text-secondary">
            {ms.map((m) => `@${emailOf(m.user_id)}`).join(" ")}
          </p>
        )}
      </article>
    );
  };
  return (
    <section className="surface-card p-5" aria-labelledby="rv-thread">
      <h2 id="rv-thread" className="mb-3 font-semibold">
        {t("rv.thread")}
      </h2>
      {roots.length ? (
        <ul className="space-y-4">
          {roots.map((c) => (
            <li key={c.id}>
              {renderComment(c)}
              <ul className="ms-4 mt-2 space-y-2 border-s ps-3">
                {comments
                  .filter((r) => r.parent_id === c.id)
                  .map((r) => (
                    <li key={r.id}>{renderComment(r)}</li>
                  ))}
              </ul>
              {canContribute &&
                (replyTo === c.id ? (
                  <CommentForm
                    versionId={versionId}
                    parentId={c.id}
                    members={members}
                    userId={userId}
                    onDone={() => setReplyTo(null)}
                  />
                ) : (
                  <button className="btn-link mt-1" onClick={() => setReplyTo(c.id)}>
                    {t("rv.reply")}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rv.noComments")}</p>
      )}
      {canContribute && (
        <div className="mt-4 border-t pt-4">
          <CommentForm versionId={versionId} parentId={null} members={members} userId={userId} />
        </div>
      )}
    </section>
  );
}

function CommentForm({
  versionId,
  parentId,
  members,
  userId,
  onDone,
}: {
  versionId: string;
  parentId: string | null;
  members: Member[];
  userId: string;
  onDone?: () => void;
}) {
  const { t } = useLocale();
  const refresh = useInvalidateAll();
  const [body, setBody] = useState("");
  const [ms, setMs] = useState<string[]>([]);
  const id = parentId ? `cf-${parentId}` : "cf-root";
  const m = useMutation({
    mutationFn: () => addComment(versionId, body, parentId, ms),
    onSuccess: () => {
      setBody("");
      setMs([]);
      refresh();
      onDone?.();
    },
  });
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) m.mutate();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {parentId ? t("rv.reply") : t("rv.comment")}
      </label>
      <textarea
        id={id}
        className="field-input"
        rows={2}
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? t("rv.reply") : t("rv.comment")}
      />
      <fieldset>
        <legend className="text-xs text-muted-foreground">{t("rv.mention")}</legend>
        <MemberChecks
          id={`${id}-m`}
          members={members}
          value={ms}
          onChange={setMs}
          exclude={userId}
        />
      </fieldset>
      <ErrorNote show={m.isError} />
      <div className="flex gap-2">
        <button className="chip-btn" disabled={m.isPending || !body.trim()}>
          {parentId ? t("rv.reply") : t("rv.post")}
        </button>
        {onDone && (
          <button type="button" className="btn-link" onClick={onDone}>
            {t("rv.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

function CompareVersions({ versions }: { versions: Version[] }) {
  const { t } = useLocale();
  const latest = versions[0]?.id ?? "";
  const previous = versions[1]?.id ?? latest;
  const [from, setFrom] = useState(previous);
  const [to, setTo] = useState(latest);
  useEffect(() => {
    setTo(latest);
    setFrom(previous);
  }, [latest, previous]);
  const a = versions.find((v) => v.id === from) ?? versions[0];
  const b = versions.find((v) => v.id === to) ?? versions[0];
  const lines = useMemo(
    () => diffLines(a?.content ?? "", b?.content ?? ""),
    [a?.content, b?.content],
  );
  if (versions.length < 2) return null;
  const changed = lines.some((l) => l.type !== "same");
  return (
    <section className="surface-card p-5" aria-labelledby="rv-compare">
      <h2 id="rv-compare" className="mb-3 font-semibold">
        {t("rv.compare")}
      </h2>
      <div className="mb-3 flex flex-wrap gap-3">
        {(
          [
            ["cmp-from", "rv.from", from, setFrom],
            ["cmp-to", "rv.to", to, setTo],
          ] as const
        ).map(([id, label, val, set]) => (
          <div key={id}>
            <label htmlFor={id} className="field-label">
              {t(label)}
            </label>
            <select
              id={id}
              className="field-input"
              value={val}
              onChange={(e) => set(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number} — {t(k(`state.${v.state}`))}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {changed ? (
        <pre className="diff-view" dir="auto">
          {lines.map((l, i) => (
            <div key={i} className="diff-line" data-type={l.type}>
              <span
                className="diff-mark"
                aria-label={
                  l.type === "added"
                    ? t("rv.added")
                    : l.type === "removed"
                      ? t("rv.removed")
                      : undefined
                }
              >
                {l.type === "added" ? "+" : l.type === "removed" ? "−" : " "}
              </span>
              {l.type === "removed" ? (
                <del>{l.text}</del>
              ) : l.type === "added" ? (
                <ins>{l.text}</ins>
              ) : (
                l.text
              )}
            </div>
          ))}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rv.noChanges")}</p>
      )}
    </section>
  );
}
