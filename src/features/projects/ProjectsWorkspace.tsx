import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/features/i18n/LocaleProvider";
import { normalizeKauEmail } from "@/features/auth/kau-email";
import type { MessageKey } from "@/features/i18n/locale";
import {
  INVITABLE_ROLES,
  createProject,
  inviteToProject,
  myInvitationsQuery,
  myProjectsQuery,
  projectInvitationsQuery,
  projectMembersQuery,
  respondToInvitation,
  type MyProject,
  type ProjectRole,
} from "./api";

const roleKey = (r: ProjectRole) => `role.${r}` as MessageKey;

export function ProjectsWorkspace({ userId }: { userId: string }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const projects = useQuery(myProjectsQuery(userId));
  const invitations = useQuery(myInvitationsQuery(userId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = projects.data?.find((p) => p.id === selectedId) ?? projects.data?.[0] ?? null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () => createProject(title, description),
    onSuccess: (id) => {
      setTitle("");
      setDescription("");
      setSelectedId(id);
      void qc.invalidateQueries({ queryKey: ["projects", userId] });
    },
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      respondToInvitation(id, accept),
    onSuccess: () => void qc.invalidateQueries(),
  });

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) create.mutate();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-6">
        {!!invitations.data?.length && (
          <section className="surface-card p-5" aria-labelledby="inv-mine">
            <h2 id="inv-mine" className="mb-3 font-semibold">
              {t("invitations.mine")}
            </h2>
            <ul className="space-y-3">
              {invitations.data.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{inv.project_title}</span>
                    <span className="ms-2 text-sm text-muted-foreground">
                      {t(roleKey(inv.role))}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <button
                      className="btn-primary"
                      disabled={respond.isPending}
                      onClick={() => respond.mutate({ id: inv.id, accept: true })}
                    >
                      {t("invitations.accept")}
                    </button>
                    <button
                      className="chip-btn"
                      disabled={respond.isPending}
                      onClick={() => respond.mutate({ id: inv.id, accept: false })}
                    >
                      {t("invitations.decline")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="surface-card p-5" aria-labelledby="new-project">
          <h2 id="new-project" className="mb-3 font-semibold">
            {t("projects.new")}
          </h2>
          <form onSubmit={submitCreate} className="space-y-3">
            <div>
              <label htmlFor="p-title" className="field-label">
                {t("projects.title")}
              </label>
              <input
                id="p-title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="p-desc" className="field-label">
                {t("projects.description")}
              </label>
              <textarea
                id="p-desc"
                maxLength={2000}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="field-input"
              />
            </div>
            {create.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t("auth.failed")}
              </p>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={create.isPending || !title.trim()}
            >
              {t("projects.create")}
            </button>
          </form>
        </section>

        <section className="surface-card p-5" aria-labelledby="my-projects">
          <h2 id="my-projects" className="mb-3 font-semibold">
            {t("projects.mine")}
          </h2>
          {projects.data?.length ? (
            <ul className="space-y-2">
              {projects.data.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    aria-pressed={selected?.id === p.id}
                    className={selected?.id === p.id ? "list-item list-item-active" : "list-item"}
                  >
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground">{t(roleKey(p.role))}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {projects.isLoading ? "…" : t("projects.none")}
            </p>
          )}
        </section>
      </div>

      {selected && <ProjectDetail project={selected} />}
    </div>
  );
}

function ProjectDetail({ project }: { project: MyProject }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const isOwner = project.role === "program_owner";
  const members = useQuery(projectMembersQuery(project.id));
  const pending = useQuery({ ...projectInvitationsQuery(project.id), enabled: isOwner });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("subject_matter_expert");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const invite = useMutation({
    mutationFn: (normalized: string) => inviteToProject(project.id, normalized, role),
    onSuccess: () => {
      setEmail("");
      setMsg({ ok: true, text: t("invite.sent") });
      void qc.invalidateQueries({ queryKey: ["project-invitations", project.id] });
    },
    onError: () => setMsg({ ok: false, text: t("auth.failed") }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeKauEmail(email);
    if (!normalized) return setMsg({ ok: false, text: t("auth.invalidDomain") });
    invite.mutate(normalized);
  }

  return (
    <section className="surface-card p-5" aria-labelledby="sel-project">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("projects.selected")}
      </p>
      <h2 id="sel-project" className="text-xl font-semibold">
        {project.title}
      </h2>
      {project.description && (
        <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
      )}
      <p className="mt-2 text-sm">
        {t("projects.role")}: <strong>{t(roleKey(project.role))}</strong>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("projects.members")}: {members.data?.length ?? "…"}
      </p>

      <hr className="my-5 border-border" />
      <h3 className="mb-3 font-semibold">{t("invite.title")}</h3>
      {isOwner ? (
        <>
          <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label htmlFor="inv-email" className="field-label">
                {t("invite.email")}
              </label>
              <input
                id="inv-email"
                type="email"
                dir="ltr"
                placeholder="name@kau.edu.sa"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="inv-role" className="field-label">
                {t("invite.role")}
              </label>
              <select
                id="inv-role"
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
                className="field-input"
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(roleKey(r))}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="btn-primary sm:col-span-2 sm:justify-self-start"
              disabled={invite.isPending}
            >
              {t("invite.send")}
            </button>
          </form>
          {msg && (
            <p
              role={msg.ok ? "status" : "alert"}
              className={msg.ok ? "mt-3 text-sm text-secondary" : "mt-3 text-sm text-destructive"}
            >
              {msg.text}
            </p>
          )}
          {!!pending.data?.length && (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-medium">{t("invite.pending")}</h4>
              <ul className="space-y-1 text-sm">
                {pending.data.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <bdi dir="ltr">{i.email}</bdi>
                    <span className="text-muted-foreground">{t(roleKey(i.role))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("invite.ownerOnly")}</p>
      )}
    </section>
  );
}
