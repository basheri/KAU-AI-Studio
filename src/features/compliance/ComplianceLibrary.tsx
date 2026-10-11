import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import type { MessageKey } from "@/features/i18n/locale";
import { myProjectsQuery, type MyProject } from "@/features/projects/api";
import { structuredArtifactsQuery } from "@/features/intake/api";
import { exceptionsQuery, membersQuery } from "@/features/reviews/api";
import { RuleDraftAi } from "@/features/ai/ComplianceAi";
import { friendlyError } from "@/features/guidance/errors";
import type { Focus } from "@/features/navigation/focus";
import { BRIEF_FIELDS } from "@/features/intake/brief";
import { BLOCK_TYPES } from "@/features/course/blocks";
import { ELEMENT_TYPES } from "@/features/architecture/alignment";
import {
  assignFinding,
  commentFinding,
  findingEventsQuery,
  findingsQuery,
  reviseRule,
  reviseSource,
  rulesQuery,
  rulesetsQuery,
  runCompliance,
  runsQuery,
  saveRule,
  saveRuleset,
  saveSource,
  setRuleStatus,
  sourcesQuery,
  transitionFinding,
  transitionSource,
  type EvidenceRow,
  type FindingRow,
  type RuleRow,
  type RunContext,
  type RunRow,
  type SourceRow,
} from "./api";
import {
  APPLICABILITY,
  CHECK_SPECS,
  CHECK_TYPES,
  CLOSED_FINDING,
  SEVERITIES,
  canApproveCompliance,
  canEditCompliance,
  canRunCompliance,
  closureNeeds,
  findingActions,
  isValidCode,
  validateRuleDraft,
  validateSourceDraft,
  type Applicability,
  type ApplicabilityDim,
  type CheckSpecType,
  type FindingStatus,
  type RuleProblem,
  type SourceProblem,
  type SourceStatus,
} from "./rules";

const k = (s: string) => s as MessageKey;
const errText = (e: unknown) =>
  e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
type Tab = "sources" | "rules" | "run" | "findings";
const TABS: Tab[] = ["sources", "rules", "run", "findings"];

function usePick() {
  const { locale } = useLocale();
  return (ar: string | null | undefined, en: string | null | undefined) =>
    (locale === "ar" ? ar || en : en || ar) || "—";
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
    </div>
  );
}

function Problems({ items, prefix = "cl.problem." }: { items: string[]; prefix?: string }) {
  const { t } = useLocale();
  if (!items.length) return null;
  return (
    <ul role="alert" className="list-disc space-y-1 ps-5 text-sm text-destructive">
      {items.map((p) => (
        <li key={p}>{t(k(prefix + p))}</li>
      ))}
    </ul>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  const { t } = useLocale();
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {friendlyError(error, t)}
    </p>
  );
}

export function ComplianceLibrary({ userId, focus = {} }: { userId: string; focus?: Focus }) {
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
        <label htmlFor="cl-project" className="field-label">
          {t("rv.pickProject")}
        </label>
        <select
          id="cl-project"
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
      <ProjectCompliance
        key={project.id}
        project={project}
        userId={userId}
        focus={project.id === focus.project ? focus : {}}
      />
    </div>
  );
}

export function ProjectCompliance({
  project,
  userId,
  focus = {},
}: {
  project: MyProject;
  userId: string;
  focus?: Focus;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>(focus.tab ?? "sources");
  return (
    <div className="space-y-4">
      <p className="notice notice-ok">{t("cl.demoNote")}</p>
      {!canEditCompliance(project.role) && (
        <p className="text-sm text-muted-foreground">{t("cl.roleNote")}</p>
      )}
      <div role="group" aria-label={t("cl.tabs")} className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            className={tab === x ? "chip-btn chip-btn-active" : "chip-btn"}
            aria-pressed={tab === x}
            onClick={() => setTab(x)}
          >
            {t(k(`cl.tab.${x}`))}
          </button>
        ))}
      </div>
      {tab === "sources" && <SourcesPanel project={project} />}
      {tab === "rules" && <RulesPanel project={project} />}
      {tab === "run" && <RunPanel project={project} />}
      {tab === "findings" && (
        <FindingsPanel project={project} userId={userId} initial={focus.item} />
      )}
    </div>
  );
}

/* ---------------- Sources ---------------- */

const SOURCE_TEXT = [
  ["title_ar", "cl.titleAr"],
  ["title_en", "cl.titleEn"],
  ["issuing_authority", "cl.authority"],
  ["document_type", "cl.docType"],
  ["official_identifier", "cl.identifier"],
  ["official_version", "cl.officialVersion"],
  ["source_url", "cl.sourceUrl"],
  ["checksum", "cl.checksum"],
] as const;
const SOURCE_DATES = [
  ["effective_on", "cl.effectiveOn"],
  ["expires_on", "cl.expiresOn"],
] as const;
type SourceForm = Record<
  (typeof SOURCE_TEXT)[number][0] | (typeof SOURCE_DATES)[number][0] | "evidence_notes",
  string
>;
const emptySource = (): SourceForm => ({
  title_ar: "",
  title_en: "",
  issuing_authority: "",
  document_type: "",
  official_identifier: "",
  official_version: "",
  source_url: "",
  checksum: "",
  effective_on: "",
  expires_on: "",
  evidence_notes: "",
});
const sourceToForm = (s: SourceRow): SourceForm => ({
  title_ar: s.title_ar ?? "",
  title_en: s.title_en ?? "",
  issuing_authority: s.issuing_authority ?? "",
  document_type: s.document_type ?? "",
  official_identifier: s.official_identifier ?? "",
  official_version: s.official_version ?? "",
  source_url: s.source_url ?? "",
  checksum: s.checksum ?? "",
  effective_on: s.effective_on ?? "",
  expires_on: s.expires_on ?? "",
  evidence_notes: s.evidence_notes ?? "",
});

function SourcesPanel({ project }: { project: MyProject }) {
  const { t } = useLocale();
  const pick = usePick();
  const sources = useQuery(sourcesQuery(project.id));
  const [editing, setEditing] = useState<SourceRow | "new" | null>(null);
  const canEdit = canEditCompliance(project.role);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section className="surface-card min-w-0 p-5" aria-labelledby="cl-sources">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="cl-sources" className="font-semibold">
            {t("cl.sources")}
          </h2>
          {canEdit && editing === null && (
            <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
              {t("cl.newSource")}
            </button>
          )}
        </div>
        {sources.isLoading ? (
          <p role="status">…</p>
        ) : sources.isError ? (
          <ErrorLine error={sources.error} />
        ) : !sources.data!.length ? (
          <p className="text-sm text-muted-foreground">{t("cl.noSources")}</p>
        ) : (
          <ul className="space-y-3">
            {sources.data!.map((s) => (
              <SourceItem
                key={s.id!}
                source={s}
                project={project}
                title={pick(s.title_ar, s.title_en)}
                onEdit={() => setEditing(s)}
              />
            ))}
          </ul>
        )}
      </section>
      {editing !== null && (
        <SourceEditor
          key={editing === "new" ? "new" : editing.id!}
          projectId={project.id}
          source={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SourceItem({
  source: s,
  project,
  title,
  onEdit,
}: {
  source: SourceRow;
  project: MyProject;
  title: string;
  onEdit: () => void;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [needComment, setNeedComment] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["compliance-sources", project.id] });
  const move = useMutation({
    mutationFn: (to: SourceStatus) => transitionSource(s.id!, to, comment.trim() || null),
    onSuccess: () => (setComment(""), refresh()),
  });
  const revise = useMutation({ mutationFn: () => reviseSource(s.id!), onSuccess: refresh });
  const editor = canEditCompliance(project.role);
  const approver = canApproveCompliance(project.role);
  const act = (to: SourceStatus, requiresComment = false) => {
    if (requiresComment && !comment.trim()) return setNeedComment(true);
    setNeedComment(false);
    move.mutate(to);
  };
  const status = (s.effective_status ?? s.status) as SourceStatus;
  const needsDecision =
    (s.status === "under_review" && approver) || (s.status === "active" && approver);
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">
            <span dir="ltr">{s.official_identifier}</span>
            {s.official_version ? ` · ${s.official_version}` : ""} · {s.issuing_authority} ·{" "}
            {t("cl.version")} {s.version_number}
          </p>
          <p className="text-xs text-muted-foreground">
            {s.effective_on && `${t("cl.effectiveOn")} ${s.effective_on}`}
            {s.expires_on && ` · ${t("cl.expiresOn")} ${s.expires_on}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="state-badge" data-state={status === "active" ? "approved" : status}>
            {t(k(`cl.src.${status}`))}
          </span>
          <span className="text-xs text-muted-foreground">
            {s.authorizes_rules ? t("cl.authorizes") : t("cl.notAuthorizes")}
          </span>
        </div>
      </div>
      {s.decision_comment && <p className="mt-1 text-sm">“{s.decision_comment}”</p>}
      {(editor || approver) && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {needsDecision && (
            <div className="min-w-48 flex-1">
              <label htmlFor={`sc-${s.id}`} className="field-label">
                {t("cl.comment")}
              </label>
              <input
                id={`sc-${s.id}`}
                className="field-input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}
          {s.status === "draft" && editor && (
            <>
              <button type="button" className="btn-link" onClick={onEdit}>
                {t("cl.edit")}
              </button>
              <button type="button" className="btn-primary" onClick={() => act("under_review")}>
                {t("cl.submit")}
              </button>
            </>
          )}
          {s.status === "under_review" && (
            <>
              {approver && (
                <button type="button" className="btn-primary" onClick={() => act("active")}>
                  {t("cl.approve")}
                </button>
              )}
              {approver && (
                <button type="button" className="btn-link" onClick={() => act("rejected", true)}>
                  {t("cl.reject")}
                </button>
              )}
              {editor && (
                <button type="button" className="btn-link" onClick={() => act("draft")}>
                  {t("cl.toDraft")}
                </button>
              )}
            </>
          )}
          {s.status === "active" && approver && (
            <button type="button" className="btn-link" onClick={() => act("superseded", true)}>
              {t("cl.withdraw")}
            </button>
          )}
          {s.status !== "draft" && s.status !== "under_review" && editor && (
            <button type="button" className="btn-link" onClick={() => revise.mutate()}>
              {t("cl.revise")}
            </button>
          )}
        </div>
      )}
      {needComment && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {t("cl.commentRequired")}
        </p>
      )}
      <ErrorLine error={move.error ?? revise.error} />
      {editor && <RuleDraftAi project={project} source={s} />}
    </li>
  );
}

function SourceEditor({
  projectId,
  source,
  onDone,
}: {
  projectId: string;
  source: SourceRow | null;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [form, setForm] = useState<SourceForm>(source ? sourceToForm(source) : emptySource());
  const [problems, setProblems] = useState<SourceProblem[]>([]);
  const save = useMutation({
    mutationFn: () => saveSource(projectId, source?.id ?? null, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-sources", projectId] });
      onDone();
    },
  });
  const submit = () => {
    const p = validateSourceDraft(form);
    setProblems(p);
    if (!p.length) save.mutate();
  };
  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby="cl-source-form">
      <h2 id="cl-source-form" className="font-semibold">
        {source ? t("cl.editSource") : t("cl.newSource")}
      </h2>
      {SOURCE_TEXT.map(([f, l]) => (
        <Field key={f} id={`sf-${f}`} label={t(l)}>
          <input
            id={`sf-${f}`}
            className="field-input"
            dir={f === "source_url" || f === "checksum" || f === "title_en" ? "ltr" : undefined}
            value={form[f]}
            onChange={(e) => setForm({ ...form, [f]: e.target.value })}
          />
        </Field>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        {SOURCE_DATES.map(([f, l]) => (
          <Field key={f} id={`sf-${f}`} label={t(l)}>
            <input
              id={`sf-${f}`}
              type="date"
              className="field-input"
              value={form[f]}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <Field id="sf-notes" label={t("cl.notes")}>
        <textarea
          id="sf-notes"
          className="field-input"
          rows={2}
          value={form.evidence_notes}
          onChange={(e) => setForm({ ...form, evidence_notes: e.target.value })}
        />
      </Field>
      <Problems items={problems} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? t("ps.working") : t("cl.saveSource")}
        </button>
        <button type="button" className="btn-link" onClick={onDone}>
          {t("cl.cancel")}
        </button>
      </div>
      <ErrorLine error={save.error} />
    </section>
  );
}

/* ---------------- Rules ---------------- */

function RulesPanel({ project }: { project: MyProject }) {
  const { t } = useLocale();
  const pick = usePick();
  const qc = useQueryClient();
  const rulesets = useQuery(rulesetsQuery(project.id));
  const rules = useQuery(rulesQuery(project.id));
  const sources = useQuery(sourcesQuery(project.id));
  const [rsId, setRsId] = useState("");
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const [rsForm, setRsForm] = useState({ code: "", title_ar: "", title_en: "" });
  const [rsInvalid, setRsInvalid] = useState(false);
  const canEdit = canEditCompliance(project.role);
  const rs = rulesets.data?.find((x) => x.id === rsId) ?? rulesets.data?.[0];
  const createRs = useMutation({
    mutationFn: () => saveRuleset(project.id, rsForm.code.trim(), rsForm.title_ar, rsForm.title_en),
    onSuccess: (id) => {
      setRsForm({ code: "", title_ar: "", title_en: "" });
      setRsId(id ?? "");
      qc.invalidateQueries({ queryKey: ["compliance-rulesets", project.id] });
    },
  });
  const submitRs = () => {
    const bad = !isValidCode(rsForm.code) || (!rsForm.title_ar.trim() && !rsForm.title_en.trim());
    setRsInvalid(bad);
    if (!bad) createRs.mutate();
  };
  const list = (rules.data ?? []).filter((r) => r.ruleset_id === rs?.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0 space-y-6">
        <section className="surface-card space-y-3 p-5" aria-labelledby="cl-rulesets">
          <h2 id="cl-rulesets" className="font-semibold">
            {t("cl.rulesets")}
          </h2>
          {rulesets.isError && <ErrorLine error={rulesets.error} />}
          {rulesets.data && !rulesets.data.length && (
            <p className="text-sm text-muted-foreground">{t("cl.noRulesets")}</p>
          )}
          {rs && (
            <Field id="cl-rs" label={t("cl.ruleset")}>
              <select
                id="cl-rs"
                className="field-input"
                value={rs.id}
                onChange={(e) => (setRsId(e.target.value), setEditing(null))}
              >
                {rulesets.data!.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {pick(x.title_ar, x.title_en)} · {t("cl.revision")} {x.revision}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {canEdit && (
            <details>
              <summary className="btn-link cursor-pointer">{t("cl.newRuleset")}</summary>
              <div className="mt-2 space-y-2">
                <Field id="rs-code" label={t("cl.code")}>
                  <input
                    id="rs-code"
                    dir="ltr"
                    className="field-input"
                    value={rsForm.code}
                    onChange={(e) => setRsForm({ ...rsForm, code: e.target.value })}
                  />
                </Field>
                <Field id="rs-ar" label={t("cl.titleAr")}>
                  <input
                    id="rs-ar"
                    className="field-input"
                    value={rsForm.title_ar}
                    onChange={(e) => setRsForm({ ...rsForm, title_ar: e.target.value })}
                  />
                </Field>
                <Field id="rs-en" label={t("cl.titleEn")}>
                  <input
                    id="rs-en"
                    dir="ltr"
                    className="field-input"
                    value={rsForm.title_en}
                    onChange={(e) => setRsForm({ ...rsForm, title_en: e.target.value })}
                  />
                </Field>
                {rsInvalid && <Problems items={["rule_code", "title"]} />}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={createRs.isPending}
                  onClick={submitRs}
                >
                  {t("cl.createRuleset")}
                </button>
                <ErrorLine error={createRs.error} />
              </div>
            </details>
          )}
        </section>
        {rs && (
          <section className="surface-card p-5" aria-labelledby="cl-rules">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="cl-rules" className="font-semibold">
                {t("cl.rules")}
              </h2>
              {canEdit && editing === null && (
                <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
                  {t("cl.newRule")}
                </button>
              )}
            </div>
            {rules.isLoading ? (
              <p role="status">…</p>
            ) : rules.isError ? (
              <ErrorLine error={rules.error} />
            ) : !list.length ? (
              <p className="text-sm text-muted-foreground">{t("cl.noRules")}</p>
            ) : (
              <ul className="space-y-3">
                {list.map((r) => (
                  <RuleItem key={r.id} rule={r} project={project} onEdit={() => setEditing(r)} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      {rs && editing !== null && (
        <RuleEditor
          key={editing === "new" ? "new" : editing.id}
          projectId={project.id}
          rulesetId={rs.id}
          rule={editing === "new" ? null : editing}
          sources={sources.data ?? []}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RuleItem({
  rule: r,
  project,
  onEdit,
}: {
  rule: RuleRow;
  project: MyProject;
  onEdit: () => void;
}) {
  const { t } = useLocale();
  const pick = usePick();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [needComment, setNeedComment] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["compliance-rules", project.id] });
    qc.invalidateQueries({ queryKey: ["compliance-rulesets", project.id] });
  };
  const status = useMutation({
    mutationFn: (to: "active" | "retired") => setRuleStatus(r.id, to, comment.trim() || null),
    onSuccess: () => (setComment(""), refresh()),
  });
  const revise = useMutation({ mutationFn: () => reviseRule(r.id), onSuccess: refresh });
  const editor = canEditCompliance(project.role);
  const approver = canApproveCompliance(project.role);
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            <span dir="ltr">{r.rule_code}</span> · {t("cl.version")} {r.version_number}
          </p>
          <p className="text-sm">{pick(r.statement_ar, r.statement_en)}</p>
          <p className="text-xs text-muted-foreground">
            {t(k(`cl.check.${r.check_type}`))}
            {r.check_spec && typeof r.check_spec === "object" && "type" in r.check_spec
              ? ` · ${t(k(`cl.spec.${(r.check_spec as { type: string }).type}`))}`
              : ""}{" "}
            · {r.compliance_rule_evidence.length} {t("cl.evidenceCount")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="state-badge"
            data-state={r.severity === "blocker" ? "changes_requested" : undefined}
          >
            {t(k(`cl.sev.${r.severity}`))}
          </span>
          <span className="state-badge" data-state={r.status === "active" ? "approved" : r.status}>
            {t(k(`cl.rule.${r.status}`))}
          </span>
        </div>
      </div>
      {(editor || approver) && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {r.status === "active" && approver && (
            <div className="min-w-48 flex-1">
              <label htmlFor={`rc-${r.id}`} className="field-label">
                {t("cl.comment")}
              </label>
              <input
                id={`rc-${r.id}`}
                className="field-input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}
          {r.status === "draft" && editor && (
            <button type="button" className="btn-link" onClick={onEdit}>
              {t("cl.edit")}
            </button>
          )}
          {r.status === "draft" && approver && (
            <button type="button" className="btn-primary" onClick={() => status.mutate("active")}>
              {t("cl.activate")}
            </button>
          )}
          {r.status === "active" && approver && (
            <button
              type="button"
              className="btn-link"
              onClick={() =>
                comment.trim()
                  ? (setNeedComment(false), status.mutate("retired"))
                  : setNeedComment(true)
              }
            >
              {t("cl.retire")}
            </button>
          )}
          {r.status !== "draft" && editor && (
            <button type="button" className="btn-link" onClick={() => revise.mutate()}>
              {t("cl.revise")}
            </button>
          )}
        </div>
      )}
      {needComment && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {t("cl.commentRequired")}
        </p>
      )}
      <ErrorLine error={status.error ?? revise.error} />
    </li>
  );
}

type SpecForm = {
  type: CheckSpecType | "";
  field: string;
  element_type: string;
  min: string;
  block_type: string;
};
const specFrom = (s: unknown): SpecForm => {
  const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
  return {
    type: (o["type"] as CheckSpecType) ?? "",
    field: String(o["field"] ?? BRIEF_FIELDS[0]),
    element_type: String(o["element_type"] ?? ELEMENT_TYPES[0]),
    min: String(o["min"] ?? "1"),
    block_type: String(o["block_type"] ?? BLOCK_TYPES[0]),
  };
};
const specOut = (s: SpecForm) => {
  if (!s.type) return null;
  if (s.type === "brief_field_present" || s.type === "brief_field_bilingual")
    return { type: s.type, field: s.field };
  if (s.type === "architecture_min_elements")
    return { type: s.type, element_type: s.element_type, min: Number(s.min) };
  if (s.type === "course_block_present") return { type: s.type, block_type: s.block_type };
  return { type: s.type };
};

function RuleEditor({
  projectId,
  rulesetId,
  rule,
  sources,
  onDone,
}: {
  projectId: string;
  rulesetId: string;
  rule: RuleRow | null;
  sources: SourceRow[];
  onDone: () => void;
}) {
  const { t } = useLocale();
  const pick = usePick();
  const qc = useQueryClient();
  const [f, setF] = useState({
    rule_code: rule?.rule_code ?? "",
    statement_ar: rule?.statement_ar ?? "",
    statement_en: rule?.statement_en ?? "",
    remediation_ar: rule?.remediation_ar ?? "",
    remediation_en: rule?.remediation_en ?? "",
    severity: rule?.severity ?? "warning",
    check_type: rule?.check_type ?? "manual",
    effective_from: rule?.effective_from ?? new Date().toISOString().slice(0, 10),
    effective_to: rule?.effective_to ?? "",
  });
  const [spec, setSpec] = useState<SpecForm>(specFrom(rule?.check_spec));
  const [app, setApp] = useState<Applicability>(rule?.applicability ?? {});
  const [evidence, setEvidence] = useState<EvidenceRow[]>(rule?.compliance_rule_evidence ?? []);
  const [problems, setProblems] = useState<RuleProblem[]>([]);
  const fields = () => ({
    ...f,
    effective_to: f.effective_to || null,
    check_spec: f.check_type === "manual" ? null : specOut(spec),
    applicability: app,
  });
  const save = useMutation({
    mutationFn: () => saveRule(rulesetId, rule?.id ?? null, fields(), evidence),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-rules", projectId] });
      onDone();
    },
  });
  const submit = () => {
    const p = validateRuleDraft({ ...fields(), effective_to: f.effective_to }, !rule);
    setProblems(p);
    if (!p.length) save.mutate();
  };
  const toggle = (d: ApplicabilityDim, v: string) => {
    const cur = app[d] ?? [];
    setApp({ ...app, [d]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const usable = sources.filter((s) => s.status !== "rejected");
  const text = (key: keyof typeof f, label: MessageKey, ltr = false, area = false) => (
    <Field id={`rf-${key}`} label={t(label)}>
      {area ? (
        <textarea
          id={`rf-${key}`}
          className="field-input"
          rows={2}
          dir={ltr ? "ltr" : undefined}
          value={f[key]}
          onChange={(e) => setF({ ...f, [key]: e.target.value })}
        />
      ) : (
        <input
          id={`rf-${key}`}
          className="field-input"
          dir={ltr ? "ltr" : undefined}
          value={f[key]}
          onChange={(e) => setF({ ...f, [key]: e.target.value })}
        />
      )}
    </Field>
  );

  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby="cl-rule-form">
      <h2 id="cl-rule-form" className="font-semibold">
        {rule ? t("cl.editRule") : t("cl.newRule")}
      </h2>
      {rule ? (
        <p className="text-sm" dir="ltr">
          {rule.rule_code}
        </p>
      ) : (
        text("rule_code", "cl.ruleCode", true)
      )}
      {text("statement_ar", "cl.statementAr", false, true)}
      {text("statement_en", "cl.statementEn", true, true)}
      {text("remediation_ar", "cl.remediationAr", false, true)}
      {text("remediation_en", "cl.remediationEn", true, true)}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="rf-severity" label={t("cl.severity")}>
          <select
            id="rf-severity"
            className="field-input"
            value={f.severity}
            onChange={(e) => setF({ ...f, severity: e.target.value as typeof f.severity })}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(k(`cl.sev.${s}`))}
              </option>
            ))}
          </select>
        </Field>
        <Field id="rf-check" label={t("cl.checkType")}>
          <select
            id="rf-check"
            className="field-input"
            value={f.check_type}
            onChange={(e) => setF({ ...f, check_type: e.target.value as typeof f.check_type })}
          >
            {CHECK_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(k(`cl.check.${s}`))}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {f.check_type !== "manual" && (
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t("cl.checkSpec")}</legend>
          <Field id="rf-spec" label={t("cl.checkSpec")}>
            <select
              id="rf-spec"
              className="field-input"
              value={spec.type}
              onChange={(e) => setSpec({ ...spec, type: e.target.value as CheckSpecType | "" })}
            >
              <option value="">{t("cl.specNone")}</option>
              {(Object.keys(CHECK_SPECS) as CheckSpecType[]).map((s) => (
                <option key={s} value={s}>
                  {t(k(`cl.spec.${s}`))}
                </option>
              ))}
            </select>
          </Field>
          {(spec.type === "brief_field_present" || spec.type === "brief_field_bilingual") && (
            <Field id="rf-field" label={t("cl.specField")}>
              <select
                id="rf-field"
                className="field-input"
                value={spec.field}
                onChange={(e) => setSpec({ ...spec, field: e.target.value })}
              >
                {BRIEF_FIELDS.map((x) => (
                  <option key={x} value={x}>
                    {t(k(`bf.${x}`))}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {spec.type === "architecture_min_elements" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="rf-el" label={t("cl.specElement")}>
                <select
                  id="rf-el"
                  className="field-input"
                  value={spec.element_type}
                  onChange={(e) => setSpec({ ...spec, element_type: e.target.value })}
                >
                  {ELEMENT_TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t(k(`el.${x}`))}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="rf-min" label={t("cl.specMin")}>
                <input
                  id="rf-min"
                  type="number"
                  min={1}
                  max={1000}
                  className="field-input"
                  value={spec.min}
                  onChange={(e) => setSpec({ ...spec, min: e.target.value })}
                />
              </Field>
            </div>
          )}
          {spec.type === "course_block_present" && (
            <Field id="rf-block" label={t("cl.specBlock")}>
              <select
                id="rf-block"
                className="field-input"
                value={spec.block_type}
                onChange={(e) => setSpec({ ...spec, block_type: e.target.value })}
              >
                {BLOCK_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(k(`block.${x}`))}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </fieldset>
      )}
      <fieldset className="space-y-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("cl.applicability")}</legend>
        {(Object.keys(APPLICABILITY) as ApplicabilityDim[]).map((d) => (
          <div key={d}>
            <p className="text-sm font-medium">{t(k(`cl.dim.${d}`))}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {APPLICABILITY[d].values.map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={(app[d] ?? []).includes(v)}
                    onChange={() => toggle(d, v)}
                  />
                  {t(k(`cl.val.${v}`))}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="rf-from" label={t("cl.effectiveFrom")}>
          <input
            id="rf-from"
            type="date"
            className="field-input"
            value={f.effective_from}
            onChange={(e) => setF({ ...f, effective_from: e.target.value })}
          />
        </Field>
        <Field id="rf-to" label={t("cl.effectiveTo")}>
          <input
            id="rf-to"
            type="date"
            className="field-input"
            value={f.effective_to}
            onChange={(e) => setF({ ...f, effective_to: e.target.value })}
          />
        </Field>
      </div>
      <fieldset className="space-y-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("cl.evidence")}</legend>
        <p className="text-xs text-muted-foreground">{t("cl.evidenceHint")}</p>
        {evidence.map((e, i) => (
          <div
            key={i}
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_5rem_auto] sm:items-end"
          >
            <Field id={`ev-s-${i}`} label={t("cl.sources")}>
              <select
                id={`ev-s-${i}`}
                className="field-input"
                value={e.source_id}
                onChange={(x) =>
                  setEvidence(
                    evidence.map((y, j) => (j === i ? { ...y, source_id: x.target.value } : y)),
                  )
                }
              >
                {usable.map((s) => (
                  <option key={s.id!} value={s.id!}>
                    {s.official_identifier} · {pick(s.title_ar, s.title_en)} ·{" "}
                    {t(k(`cl.src.${s.effective_status ?? s.status}`))}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`ev-l-${i}`} label={t("cl.locator")}>
              <input
                id={`ev-l-${i}`}
                className="field-input"
                value={e.locator}
                onChange={(x) =>
                  setEvidence(
                    evidence.map((y, j) => (j === i ? { ...y, locator: x.target.value } : y)),
                  )
                }
              />
            </Field>
            <Field id={`ev-p-${i}`} label={t("cl.page")}>
              <input
                id={`ev-p-${i}`}
                className="field-input"
                value={e.page}
                onChange={(x) =>
                  setEvidence(
                    evidence.map((y, j) => (j === i ? { ...y, page: x.target.value } : y)),
                  )
                }
              />
            </Field>
            <button
              type="button"
              className="btn-link"
              onClick={() => setEvidence(evidence.filter((_, j) => j !== i))}
            >
              {t("cs.remove")}
            </button>
          </div>
        ))}
        {usable.length > 0 && (
          <button
            type="button"
            className="btn-link"
            onClick={() =>
              setEvidence([
                ...evidence,
                { source_id: usable[0]!.id!, locator: "", page: "", section: "" },
              ])
            }
          >
            {t("cl.addEvidence")}
          </button>
        )}
      </fieldset>
      <Problems items={problems} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? t("ps.working") : t("cl.saveRule")}
        </button>
        <button type="button" className="btn-link" onClick={onDone}>
          {t("cl.cancel")}
        </button>
      </div>
      <ErrorLine error={save.error} />
    </section>
  );
}

/* ---------------- Run ---------------- */

const RUN_KINDS = ["program_brief", "program_architecture", "course_content"];
type Summary = Partial<
  Record<
    "total" | "pass" | "fail" | "manual" | "not_applicable" | "not_authorized" | "blockers",
    number
  >
>;
type Result = {
  rule_code: string;
  version_number: number;
  severity: string;
  outcome: string;
  observed: string | null;
  expected: string | null;
  path: string | null;
};

function RunPanel({ project }: { project: MyProject }) {
  const { t } = useLocale();
  const pick = usePick();
  const qc = useQueryClient();
  const artifacts = useQuery(structuredArtifactsQuery(project.id));
  const rulesets = useQuery(rulesetsQuery(project.id));
  const runs = useQuery(runsQuery(project.id));
  const targets = (artifacts.data ?? [])
    .filter((a) => RUN_KINDS.includes(a.kind))
    .flatMap((a) =>
      a.versions.map((v) => ({
        id: v.id,
        label: `${a.title} · ${t(k(`cl.val.${a.kind}`))} · v${v.version_number} · ${t(k(`state.${v.state}`))}`,
      })),
    );
  const [target, setTarget] = useState("");
  const [rsId, setRsId] = useState("");
  const [ctx, setCtx] = useState<RunContext>({
    delivery_mode: "online",
    credit_type: "credit_bearing",
    language: "bilingual",
  });
  const [openRun, setOpenRun] = useState<string | null>(null);
  const tg = targets.find((x) => x.id === target) ?? targets[0];
  const rs = rulesets.data?.find((x) => x.id === rsId) ?? rulesets.data?.[0];
  const run = useMutation({
    mutationFn: () => runCompliance(tg!.id, rs!.id, ctx),
    onSuccess: (id) => {
      setOpenRun(id);
      qc.invalidateQueries({ queryKey: ["compliance-runs", project.id] });
      qc.invalidateQueries({ queryKey: ["compliance-findings", project.id] });
    },
  });
  const ctxFields = [
    ["delivery_mode", "cl.deliveryMode", APPLICABILITY.delivery_modes.values],
    ["credit_type", "cl.creditType", APPLICABILITY.credit_types.values],
    ["language", "cl.language", APPLICABILITY.languages.values],
  ] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section className="surface-card space-y-3 p-5" aria-labelledby="cl-run">
        <h2 id="cl-run" className="font-semibold">
          {t("cl.runTitle")}
        </h2>
        {!targets.length ? (
          <p className="text-sm text-muted-foreground">{t("cl.noTargets")}</p>
        ) : !rs ? (
          <p className="text-sm text-muted-foreground">{t("cl.noRulesets")}</p>
        ) : (
          <>
            <Field id="run-target" label={t("cl.target")}>
              <select
                id="run-target"
                className="field-input"
                value={tg!.id}
                onChange={(e) => setTarget(e.target.value)}
              >
                {targets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="run-rs" label={t("cl.ruleset")}>
              <select
                id="run-rs"
                className="field-input"
                value={rs.id}
                onChange={(e) => setRsId(e.target.value)}
              >
                {rulesets.data!.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {pick(x.title_ar, x.title_en)}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("cl.context")}</legend>
              {ctxFields.map(([key, label, values]) => (
                <Field key={key} id={`run-${key}`} label={t(label)}>
                  <select
                    id={`run-${key}`}
                    className="field-input"
                    value={ctx[key]}
                    onChange={(e) => setCtx({ ...ctx, [key]: e.target.value })}
                  >
                    {values.map((v) => (
                      <option key={v} value={v}>
                        {t(k(`cl.val.${v}`))}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </fieldset>
            {canRunCompliance(project.role) && (
              <button
                type="button"
                className="btn-primary"
                disabled={run.isPending}
                onClick={() => run.mutate()}
              >
                {run.isPending ? t("ps.working") : t("cl.run")}
              </button>
            )}
            <ErrorLine error={run.error} />
          </>
        )}
      </section>
      <section className="surface-card min-w-0 space-y-3 p-5" aria-labelledby="cl-runs">
        <h2 id="cl-runs" className="font-semibold">
          {t("cl.runs")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("cl.runFrozen")}</p>
        {runs.isError && <ErrorLine error={runs.error} />}
        {runs.data && !runs.data.length && (
          <p className="text-sm text-muted-foreground">{t("cl.noRuns")}</p>
        )}
        <ul className="space-y-2">
          {runs.data?.map((r) => (
            <RunItem
              key={r.id}
              run={r}
              open={openRun === r.id}
              onToggle={() => setOpenRun(openRun === r.id ? null : r.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function RunItem({ run, open, onToggle }: { run: RunRow; open: boolean; onToggle: () => void }) {
  const { t } = useLocale();
  const s = run.summary as Summary;
  const snap = run.snapshot as {
    target?: { title?: string; version_number?: number };
    results?: Result[];
  };
  return (
    <li className="rounded-md border border-border">
      <button type="button" className="list-item border-0" aria-expanded={open} onClick={onToggle}>
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {snap.target?.title} · v{snap.target?.version_number}
          </span>
          <span className="block text-xs text-muted-foreground" dir="ltr">
            {new Date(run.created_at).toLocaleString()}
          </span>
        </span>
        <span className="state-badge" data-state={s.blockers ? "changes_requested" : "approved"}>
          {s.blockers ?? 0} {t("cl.sum.blockers")}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(["total", "pass", "fail", "manual", "not_applicable", "not_authorized"] as const).map(
              (x) => (
                <div key={x}>
                  <dt className="text-muted-foreground">{t(k(`cl.sum.${x}`))}</dt>
                  <dd className="font-semibold">{s[x] ?? 0}</dd>
                </div>
              ),
            )}
          </dl>
          <h3 className="text-sm font-semibold">{t("cl.results")}</h3>
          <ul className="space-y-1 text-sm">
            {(snap.results ?? []).map((r) => (
              <li key={r.rule_code} className="flex flex-wrap gap-x-3">
                <span dir="ltr" className="font-medium">
                  {r.rule_code} v{r.version_number}
                </span>
                <span>{t(k(`cl.outcome.${r.outcome}`))}</span>
                <span className="text-muted-foreground">{t(k(`cl.sev.${r.severity}`))}</span>
                {r.observed !== null && (
                  <span className="text-muted-foreground" dir="ltr">
                    {r.observed} / {r.expected}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ---------------- Findings ---------------- */

const COLUMNS: { key: string; statuses: FindingStatus[] }[] = [
  { key: "open", statuses: ["open", "acknowledged"] },
  { key: "in_progress", statuses: ["remediation_in_progress"] },
  { key: "closed", statuses: [...CLOSED_FINDING] },
];

function FindingsPanel({
  project,
  userId,
  initial,
}: {
  project: MyProject;
  userId: string;
  initial?: string | undefined;
}) {
  const { t } = useLocale();
  const pick = usePick();
  const findings = useQuery(findingsQuery(project.id));
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const current = findings.data?.find((f) => f.id === sel);
  if (findings.isLoading) return <p role="status">…</p>;
  if (findings.isError) return <ErrorLine error={findings.error} />;
  if (!findings.data!.length)
    return <p className="surface-card p-5 text-sm text-muted-foreground">{t("cl.noFindings")}</p>;
  return (
    <div className="space-y-6">
      <section aria-labelledby="cl-board" className="space-y-3">
        <h2 id="cl-board" className="font-semibold">
          {t("cl.findings")}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((c) => {
            const items = findings.data!.filter((f) => c.statuses.includes(f.status));
            return (
              <div key={c.key} className="surface-card min-w-0 p-3">
                <h3 className="mb-2 text-sm font-semibold">
                  {t(k(`cl.col.${c.key}`))} ({items.length})
                </h3>
                <ul className="space-y-2">
                  {items.map((f) => {
                    const rs = f.rule_snapshot as { statement_ar?: string; statement_en?: string };
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          className={sel === f.id ? "list-item list-item-active" : "list-item"}
                          aria-pressed={sel === f.id}
                          onClick={() => setSel(f.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium" dir="ltr">
                              {f.rule_code}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {pick(rs.statement_ar, rs.statement_en)}
                            </span>
                          </span>
                          <span
                            className="state-badge"
                            data-state={f.severity === "blocker" ? "changes_requested" : undefined}
                          >
                            {t(k(`cl.sev.${f.severity}`))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
      {current ? (
        <FindingDetail key={current.id} finding={current} project={project} userId={userId} />
      ) : (
        <p className="surface-card p-5 text-sm text-muted-foreground">{t("cl.selectFinding")}</p>
      )}
    </div>
  );
}

function FindingDetail({
  finding: f,
  project,
  userId,
}: {
  finding: FindingRow;
  project: MyProject;
  userId: string;
}) {
  const { t } = useLocale();
  const pick = usePick();
  const qc = useQueryClient();
  const events = useQuery(findingEventsQuery(f.id));
  const members = useQuery(membersQuery(project.id));
  const exceptions = useQuery(exceptionsQuery(project.id));
  const runs = useQuery(runsQuery(project.id));
  const [assignee, setAssignee] = useState(f.assignee_id ?? "");
  const [due, setDue] = useState(f.due_on ?? "");
  const [comment, setComment] = useState("");
  const actions = findingActions(f, project.role, userId);
  const [to, setTo] = useState<FindingStatus | "">(actions[0] ?? "");
  const [note, setNote] = useState("");
  const [exc, setExc] = useState("");
  const [vrun, setVrun] = useState("");
  const [needs, setNeeds] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["compliance-findings", project.id] });
    qc.invalidateQueries({ queryKey: ["compliance-finding-events", f.id] });
  };
  const assign = useMutation({
    mutationFn: () => assignFinding(f.id, assignee || null, due || null),
    onSuccess: refresh,
  });
  const post = useMutation({
    mutationFn: () => commentFinding(f.id, comment.trim()),
    onSuccess: () => (setComment(""), refresh()),
  });
  const move = useMutation({
    mutationFn: () =>
      transitionFinding(f.id, to as FindingStatus, {
        comment: note.trim(),
        exceptionId: exc,
        verifiedRunId: vrun,
      }),
    onSuccess: () => (setNote(""), refresh()),
  });
  const rule = f.rule_snapshot as {
    statement_ar?: string;
    statement_en?: string;
    remediation_ar?: string;
    remediation_en?: string;
  };
  const evidence = (f.evidence ?? []) as {
    official_identifier?: string;
    title_ar?: string;
    title_en?: string;
    locator?: string;
    page?: string;
    status_on_run?: string;
  }[];
  const need = to
    ? closureNeeds(f, to)
    : { comment: false, exception: false, verificationRun: false };
  const verifyRuns = (runs.data ?? []).filter(
    (r) =>
      r.target_artifact_id === f.target_artifact_id &&
      r.id !== f.run_id &&
      r.created_at > f.created_at,
  );
  const applicableExceptions = (exceptions.data ?? []).filter(
    (e) => e.status === "approved" && (!e.artifact_id || e.artifact_id === f.target_artifact_id),
  );
  const nameOf = (id: string | null) =>
    members.data?.find((m) => m.user_id === id)?.email ??
    (id ? id.slice(0, 8) : t("cl.unassigned"));
  const applyStatus = () => {
    const missing =
      (need.comment && !note.trim()) || (need.exception && !exc) || (need.verificationRun && !vrun);
    setNeeds(missing);
    if (!missing) move.mutate();
  };
  const contributors = (members.data ?? []).filter((m) => m.role !== "observer");
  const isClosed = CLOSED_FINDING.includes(f.status);

  return (
    <section className="surface-card min-w-0 space-y-4 p-5" aria-labelledby="cl-detail">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="cl-detail" className="font-semibold">
            {t("cl.findingDetail")}:{" "}
            <span dir="ltr">
              {f.rule_code} v{f.rule_version}
            </span>
          </h2>
          <p className="text-sm">{pick(rule.statement_ar, rule.statement_en)}</p>
        </div>
        <span className="state-badge" data-state={isClosed ? "approved" : "in_review"}>
          {t(k(`cl.fs.${f.status}`))}
        </span>
      </div>
      {f.severity === "blocker" && !isClosed && (
        <p className="notice notice-warn">{t("cl.blockerGate")}</p>
      )}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("cl.severity")}</dt>
          <dd>{t(k(`cl.sev.${f.severity}`))}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("cl.checkType")}</dt>
          <dd>
            {t(k(`cl.check.${f.check_type}`))} · {t(k(`cl.rationale.${f.rationale}`))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("cl.where")}</dt>
          <dd dir="ltr" className="text-start">
            {f.target_path}
          </dd>
        </div>
        {f.observed !== null && (
          <div>
            <dt className="text-muted-foreground">
              {t("cl.observed")} / {t("cl.expected")}
            </dt>
            <dd dir="ltr" className="text-start">
              {f.observed} / {f.expected}
            </dd>
          </div>
        )}
        {(rule.remediation_ar || rule.remediation_en) && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t("cl.remediation")}</dt>
            <dd>{pick(rule.remediation_ar, rule.remediation_en)}</dd>
          </div>
        )}
      </dl>
      <div>
        <h3 className="text-sm font-semibold">{t("cl.evidence")}</h3>
        <ul className="list-disc ps-5 text-sm">
          {evidence.map((e, i) => (
            <li key={i}>
              <span dir="ltr">{e.official_identifier}</span> · {pick(e.title_ar, e.title_en)}
              {e.locator ? ` · ${e.locator}` : ""}
              {e.page ? ` · ${t("cl.page")} ${e.page}` : ""}
              {e.status_on_run ? ` · ${t(k(`cl.src.${e.status_on_run}`))}` : ""}
            </li>
          ))}
        </ul>
      </div>

      {!isClosed && canEditCompliance(project.role) && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
          <Field id="fd-assignee" label={t("cl.assignee")}>
            <select
              id="fd-assignee"
              className="field-input"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">{t("cl.unassigned")}</option>
              {contributors.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.email} · {t(k(`role.${m.role}`))}
                </option>
              ))}
            </select>
          </Field>
          <Field id="fd-due" label={t("cl.due")}>
            <input
              id="fd-due"
              type="date"
              className="field-input"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn-primary"
            disabled={assign.isPending}
            onClick={() => assign.mutate()}
          >
            {t("cl.assign")}
          </button>
          <div className="sm:col-span-3">
            <ErrorLine error={assign.error} />
          </div>
        </div>
      )}
      {(isClosed || !canEditCompliance(project.role)) && (
        <p className="text-sm">
          {t("cl.assignee")}: {nameOf(f.assignee_id)}
          {f.due_on ? ` · ${t("cl.due")} ${f.due_on}` : ""}
        </p>
      )}

      {actions.length > 0 && (
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t("cl.changeStatus")}</legend>
          <Field id="fd-to" label={t("cl.changeStatus")}>
            <select
              id="fd-to"
              className="field-input"
              value={to}
              onChange={(e) => (setTo(e.target.value as FindingStatus), setNeeds(false))}
            >
              {actions.map((a) => (
                <option key={a} value={a}>
                  {t(k(`cl.fs.${a}`))}
                </option>
              ))}
            </select>
          </Field>
          {need.exception &&
            (applicableExceptions.length ? (
              <Field id="fd-exc" label={t("cl.exception")}>
                <select
                  id="fd-exc"
                  className="field-input"
                  value={exc}
                  onChange={(e) => setExc(e.target.value)}
                >
                  <option value="">—</option>
                  {applicableExceptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.reference} · {e.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">{t("cl.noExceptions")}</p>
            ))}
          {need.verificationRun &&
            (verifyRuns.length ? (
              <Field id="fd-run" label={t("cl.verifyRun")}>
                <select
                  id="fd-run"
                  className="field-input"
                  value={vrun}
                  onChange={(e) => setVrun(e.target.value)}
                >
                  <option value="">—</option>
                  {verifyRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.created_at).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">{t("cl.noVerifyRun")}</p>
            ))}
          <Field id="fd-note" label={t("cl.comment")}>
            <textarea
              id="fd-note"
              className="field-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          {needs && (
            <p role="alert" className="text-sm text-destructive">
              {t("cl.closureMissing")}
            </p>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!to || move.isPending}
            onClick={applyStatus}
          >
            {t("cl.apply")}
          </button>
          <ErrorLine error={move.error} />
        </fieldset>
      )}

      {canRunCompliance(project.role) && (
        <div className="space-y-2">
          <Field id="fd-comment" label={t("cl.addComment")}>
            <textarea
              id="fd-comment"
              className="field-input"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn-link"
            disabled={!comment.trim() || post.isPending}
            onClick={() => post.mutate()}
          >
            {t("cl.postComment")}
          </button>
          <ErrorLine error={post.error} />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold">{t("cl.history")}</h3>
        <ol className="space-y-1 text-sm">
          {events.data?.map((e) => (
            <li key={e.id}>
              <span className="text-muted-foreground" dir="ltr">
                {new Date(e.created_at).toLocaleString()}
              </span>{" "}
              · {nameOf(e.actor_id)} ({t(k(`role.${e.actor_role}`))}) · {t(k(`cl.event.${e.kind}`))}
              {e.to_status ? `: ${t(k(`cl.fs.${e.to_status}`))}` : ""}
              {e.comment ? ` — ${e.comment}` : ""}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
