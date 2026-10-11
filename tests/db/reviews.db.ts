/**
 * Governed review workflow tests against the real backend (RLS + RPCs).
 * Service key is used only to create/remove throwaway users and to prove
 * the database-level review lock also stops privileged writes.
 * Run: bun run test:db
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env["SUPABASE_URL"]!;
const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const run = Math.random().toString(36).slice(2, 8);
const password = `T3st-${run}-${Math.random().toString(36).slice(2)}`;

function apiClient(key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const admin = apiClient(serviceKey);
type U = { id: string; email: string; client: SupabaseClient };
const users: Record<string, U> = {};
const projectIds: string[] = [];
let projectId = "";

const DEFAULT_KEYS = [
  "program_brief_confirmed",
  "program_architecture_review",
  "course_architecture_review",
  "learner_content_review",
  "compliance_review",
  "export_frozen",
];

async function makeUser(name: string) {
  const email = `rv-${name}-${run}@kau.edu.sa`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = apiClient(anonKey);
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  users[name] = { id: data.user.id, email, client };
}

async function join(name: string, role: string) {
  const inv = await users.owner.client.rpc("invite_to_project", {
    _project_id: projectId,
    _email: users[name].email,
    _role: role,
  });
  if (inv.error) throw inv.error;
  const acc = await users[name].client.rpc("accept_invitation", { _invitation_id: inv.data });
  if (acc.error) throw acc.error;
}

async function newArtifact(title: string, content = "Line one\nLine two") {
  const { data, error } = await users.owner.client.rpc("create_artifact", {
    _project_id: projectId,
    _kind: "program_brief",
    _title: title,
    _content: content,
  });
  if (error) throw error;
  const v = await users.owner.client
    .from("artifact_versions")
    .select("id")
    .eq("artifact_id", data)
    .single();
  return { artifactId: data as string, versionId: v.data!.id as string };
}

async function openRequest(versionId: string) {
  const r = await users.owner.client
    .from("review_requests")
    .select("id, stage_id")
    .eq("artifact_version_id", versionId)
    .eq("status", "open")
    .single();
  return r.data!;
}

async function decide(
  u: U,
  requestId: string,
  decision: string,
  comment?: string,
  exceptionId?: string,
) {
  return u.client.rpc("decide_review", {
    _request_id: requestId,
    _decision: decision,
    _comment: comment ?? null,
    _exception_id: exceptionId ?? null,
  });
}

/** Approver per default stage, by position. */
/** Never the requester or version creator (owner), except at the export freeze. */
const approverFor = () => [
  users.coowner,
  users.designer,
  users.designer,
  users.designer,
  users.compliance,
  users.owner,
];

async function approveRemaining(versionId: string) {
  const stages = await users.owner.client
    .from("workflow_stages")
    .select("id, position")
    .eq("project_id", projectId)
    .order("position");
  for (;;) {
    const req = await users.owner.client
      .from("review_requests")
      .select("id, stage_id")
      .eq("artifact_version_id", versionId)
      .eq("status", "open")
      .maybeSingle();
    if (!req.data) return;
    const pos = stages.data!.findIndex((s) => s.id === req.data!.stage_id);
    const r = await decide(approverFor()[pos], req.data.id, "approve");
    if (r.error) throw r.error;
  }
}

beforeAll(async () => {
  for (const n of ["owner", "coowner", "sme", "designer", "compliance", "observer", "outsider"])
    await makeUser(n);
  const p = await users.owner.client.rpc("create_project", {
    _title: `Review Program ${run}`,
    _description: null,
  });
  if (p.error) throw p.error;
  projectId = p.data as string;
  projectIds.push(projectId);
  await join("coowner", "program_owner");
  await join("sme", "subject_matter_expert");
  await join("designer", "instructional_designer");
  await join("compliance", "compliance_reviewer");
  await join("observer", "observer");
}, 90_000);

afterAll(async () => {
  for (const id of projectIds) await admin.from("projects").delete().eq("id", id);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 60_000);

describe("governed review workflow", () => {
  it("seeds the default six-stage workflow for new projects", async () => {
    const { data } = await users.owner.client
      .from("workflow_stages")
      .select("stage_key, position, approver_roles")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("position");
    expect(data?.map((s) => s.stage_key)).toEqual(DEFAULT_KEYS);
    expect(data?.[4].approver_roles).toEqual(["compliance_reviewer"]);
  });

  it("starts a new artifact as draft version 1 at the first stage", async () => {
    const { artifactId, versionId } = await newArtifact(`Brief A ${run}`);
    const v = await users.owner.client
      .from("artifact_versions")
      .select("state, version_number, parent_version_id")
      .eq("id", versionId)
      .single();
    expect(v.data).toEqual({ state: "draft", version_number: 1, parent_version_id: null });
    const a = await users.owner.client
      .from("artifacts")
      .select("current_stage_id, workflow_stages(stage_key)")
      .eq("id", artifactId)
      .single();
    expect((a.data as { workflow_stages: { stage_key: string } }).workflow_stages.stage_key).toBe(
      DEFAULT_KEYS[0],
    );
    // Observers cannot author
    const obs = await users.observer.client.rpc("create_artifact", {
      _project_id: projectId,
      _kind: "program_brief",
      _title: "x",
      _content: "",
    });
    expect(obs.error).not.toBeNull();
  });

  it("review lock rejects direct edits and proposes a child version instead", async () => {
    const { versionId } = await newArtifact(`Brief Lock ${run}`, "Original text");
    expect(
      (
        await users.owner.client.rpc("request_review", {
          _version_id: versionId,
          _note: null,
          _assignees: [users.sme.id],
        })
      ).error,
    ).toBeNull();

    const direct = await users.owner.client
      .from("artifact_versions")
      .update({ content: "Tampered" })
      .eq("id", versionId)
      .select();
    expect(direct.error !== null || (direct.data ?? []).length === 0).toBe(true);
    const privileged = await admin
      .from("artifact_versions")
      .update({ content: "Tampered" })
      .eq("id", versionId);
    expect(privileged.error?.message).toMatch(/locked/i);

    const edit = await users.owner.client.rpc("edit_artifact", {
      _version_id: versionId,
      _content: "Proposed text",
      _change_summary: "fix",
    });
    expect(edit.error).toBeNull();
    expect(edit.data).not.toBe(versionId);
    const original = await users.owner.client
      .from("artifact_versions")
      .select("content, state")
      .eq("id", versionId)
      .single();
    expect(original.data).toEqual({ content: "Original text", state: "in_review" });
    const child = await users.owner.client
      .from("artifact_versions")
      .select("content, state, parent_version_id, version_number")
      .eq("id", edit.data)
      .single();
    expect(child.data).toEqual({
      content: "Proposed text",
      state: "draft",
      parent_version_id: versionId,
      version_number: 2,
    });
  });

  it("requires comments and an exception reference where the decision demands it", async () => {
    const { versionId } = await newArtifact(`Brief Rules ${run}`);
    await users.owner.client.rpc("request_review", {
      _version_id: versionId,
      _note: null,
      _assignees: [],
    });
    const req = await openRequest(versionId);
    expect((await decide(users.coowner, req.id, "request_changes", "  ")).error).not.toBeNull();
    expect(
      (await decide(users.coowner, req.id, "approve_exception", "justified")).error,
    ).not.toBeNull();
    // Stage 1 approver is the program owner only
    expect((await decide(users.sme, req.id, "approve")).error).not.toBeNull();
    expect((await decide(users.outsider, req.id, "approve")).error).not.toBeNull();
    expect((await decide(users.observer, req.id, "approve")).error).not.toBeNull();
  });

  it("an approved decision references the exact version with actor, role and exception", async () => {
    const { artifactId, versionId } = await newArtifact(`Brief Approve ${run}`);
    const exc = await users.owner.client.rpc("create_exception", {
      _project_id: projectId,
      _artifact_id: artifactId,
      _title: "Credit hours",
      _justification: "Approved by council",
    });
    expect(exc.error).toBeNull();
    // Exceptions start pending and only another compliance reviewer can approve them.
    const pending = await users.owner.client
      .from("documented_exceptions")
      .select("status")
      .eq("id", exc.data)
      .single();
    expect(pending.data?.status).toBe("pending");
    expect(
      (await users.sme.client.rpc("decide_exception", { _exception_id: exc.data, _approve: true }))
        .error,
    ).not.toBeNull();
    await users.owner.client.rpc("request_review", {
      _version_id: versionId,
      _note: null,
      _assignees: [],
    });
    // Walk stages 1-4 normally, stage 5 by exception, stage 6 approve.
    for (let i = 0; i < 4; i++) {
      const req = await openRequest(versionId);
      expect((await decide(approverFor()[i], req.id, "approve")).error).toBeNull();
    }
    const comp = await openRequest(versionId);
    expect(
      (
        await decide(
          users.compliance,
          comp.id,
          "approve_exception",
          "Exception accepted",
          exc.data as string,
        )
      ).error?.message,
    ).toMatch(/not been approved/);
    expect(
      (
        await users.compliance.client.rpc("decide_exception", {
          _exception_id: exc.data,
          _approve: true,
          _comment: "Council minutes checked",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await decide(
          users.compliance,
          comp.id,
          "approve_exception",
          "Exception accepted",
          exc.data as string,
        )
      ).error,
    ).toBeNull();
    const last = await openRequest(versionId);
    expect((await decide(users.owner, last.id, "approve")).error).toBeNull();

    const v = await users.owner.client
      .from("artifact_versions")
      .select("state")
      .eq("id", versionId)
      .single();
    expect(v.data?.state).toBe("approved");
    const decisions = await users.owner.client
      .from("review_decisions")
      .select(
        "artifact_version_id, actor_id, actor_role, decided_at, decision, exception_id, comment",
      )
      .eq("artifact_version_id", versionId);
    expect(decisions.data).toHaveLength(6);
    for (const d of decisions.data!) {
      expect(d.artifact_version_id).toBe(versionId);
      expect(d.actor_id).toBeTruthy();
      expect(d.actor_role).toBeTruthy();
      expect(d.decided_at).toBeTruthy();
    }
    const ex = decisions.data!.find((d) => d.decision === "approve_exception")!;
    expect(ex).toMatchObject({
      actor_id: users.compliance.id,
      actor_role: "compliance_reviewer",
      exception_id: exc.data,
      comment: "Exception accepted",
    });
    const audit = await users.owner.client
      .from("audit_events")
      .select("action")
      .eq("project_id", projectId);
    const actions = audit.data!.map((a) => a.action);
    for (const a of [
      "review.requested",
      "review.approved",
      "artifact_version.approved",
      "exception.created",
      "exception.approved",
    ])
      expect(actions).toContain(a);

    // Editing the frozen approved version proposes a child; approved stays untouched.
    const edit = await users.owner.client.rpc("edit_artifact", {
      _version_id: versionId,
      _content: "Amended",
      _change_summary: null,
    });
    expect(edit.error).toBeNull();
    const still = await users.owner.client
      .from("artifact_versions")
      .select("state, content")
      .eq("id", versionId)
      .single();
    expect(still.data).toEqual({ state: "approved", content: "Line one\nLine two" });
  });

  it("a returned artifact creates a corrected child version that resumes at the returning stage", async () => {
    const { versionId } = await newArtifact(`Brief Return ${run}`, "Draft A");
    await users.owner.client.rpc("request_review", {
      _version_id: versionId,
      _note: null,
      _assignees: [],
    });
    const s1 = await openRequest(versionId);
    await decide(users.coowner, s1.id, "approve");
    const s2 = await openRequest(versionId);
    expect(
      (await decide(users.sme, s2.id, "request_changes", "Outcomes are unclear")).error,
    ).toBeNull();
    expect(
      (
        await users.owner.client
          .from("artifact_versions")
          .select("state")
          .eq("id", versionId)
          .single()
      ).data?.state,
    ).toBe("changes_requested");

    const child = await users.sme.client.rpc("edit_artifact", {
      _version_id: versionId,
      _content: "Draft B",
      _change_summary: "Clarified outcomes",
    });
    expect(child.error).toBeNull();
    const childId = child.data as string;
    expect(
      (
        await users.owner.client
          .from("artifact_versions")
          .select("parent_version_id, state")
          .eq("id", childId)
          .single()
      ).data,
    ).toEqual({ parent_version_id: versionId, state: "draft" });

    expect(
      (
        await users.sme.client.rpc("request_review", {
          _version_id: childId,
          _note: "Fixed",
          _assignees: [],
        })
      ).error,
    ).toBeNull();
    const resumed = await openRequest(childId);
    expect(resumed.stage_id).toBe(s2.stage_id);

    await approveRemaining(childId);
    expect(
      (
        await users.owner.client
          .from("artifact_versions")
          .select("state")
          .eq("id", childId)
          .single()
      ).data?.state,
    ).toBe("approved");
    expect(
      (
        await users.owner.client
          .from("artifact_versions")
          .select("state")
          .eq("id", versionId)
          .single()
      ).data?.state,
    ).toBe("superseded");
  });

  it("review comments, mentions and decisions are invisible to non-members", async () => {
    const { versionId } = await newArtifact(`Brief Comments ${run}`);
    const c = await users.sme.client.rpc("add_review_comment", {
      _version_id: versionId,
      _body: "Please check CLO 2",
      _parent_id: null,
      _mentions: [users.owner.id],
    });
    expect(c.error).toBeNull();
    const reply = await users.owner.client.rpc("add_review_comment", {
      _version_id: versionId,
      _body: "Done",
      _parent_id: c.data,
      _mentions: [],
    });
    expect(reply.error).toBeNull();
    expect(
      (
        await users.owner.client
          .from("review_comments")
          .select("id")
          .eq("artifact_version_id", versionId)
      ).data,
    ).toHaveLength(2);
    expect(
      (
        await users.owner.client
          .from("review_comment_mentions")
          .select("user_id")
          .eq("comment_id", c.data)
      ).data,
    ).toEqual([{ user_id: users.owner.id }]);

    const out = users.outsider.client;
    for (const t of [
      "review_comments",
      "review_comment_mentions",
      "review_requests",
      "review_decisions",
      "review_assignments",
      "artifact_versions",
      "artifacts",
      "documented_exceptions",
      "workflow_stages",
    ]) {
      const { data, error } = await out.from(t).select("*");
      expect(error, t).toBeNull();
      expect(data, t).toEqual([]);
    }
    expect(
      (
        await out.rpc("add_review_comment", {
          _version_id: versionId,
          _body: "hi",
          _parent_id: null,
          _mentions: [],
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await users.observer.client.rpc("add_review_comment", {
          _version_id: versionId,
          _body: "hi",
          _parent_id: null,
          _mentions: [],
        })
      ).error,
    ).not.toBeNull();
    // Mentioning a non-member is refused
    expect(
      (
        await users.sme.client.rpc("add_review_comment", {
          _version_id: versionId,
          _body: "x",
          _parent_id: null,
          _mentions: [users.outsider.id],
        })
      ).error,
    ).not.toBeNull();
  });

  it("blocks the requester and the version creator from deciding, except at the export freeze", async () => {
    const { versionId } = await newArtifact(`Brief Self ${run}`);
    await users.owner.client.rpc("request_review", {
      _version_id: versionId,
      _note: null,
      _assignees: [],
    });
    const s1 = await openRequest(versionId);
    expect((await decide(users.owner, s1.id, "approve")).error?.message).toMatch(
      /cannot decide a review you requested/,
    );
    expect((await decide(users.coowner, s1.id, "approve")).error).toBeNull();
    const s2 = await openRequest(versionId);
    expect((await decide(users.designer, s2.id, "request_changes", "Rework")).error).toBeNull();
    // The SME writes the correction; someone else submits it; the SME still cannot decide it.
    const child = (
      await users.sme.client.rpc("edit_artifact", {
        _version_id: versionId,
        _content: "Corrected",
        _change_summary: null,
      })
    ).data as string;
    await users.owner.client.rpc("request_review", {
      _version_id: child,
      _note: null,
      _assignees: [],
    });
    const c2 = await openRequest(child);
    expect((await decide(users.sme, c2.id, "approve")).error?.message).toMatch(
      /version you created/,
    );
    // Even full database access cannot record a self-decision.
    const forged = await admin.from("review_decisions").insert({
      project_id: projectId,
      review_request_id: c2.id,
      artifact_version_id: child,
      stage_id: c2.stage_id,
      decision: "approve",
      actor_id: users.sme.id,
      actor_role: "subject_matter_expert",
    });
    expect(forged.error?.message).toMatch(/cannot decide/);
  });

  it("lets only the program owner reconfigure stages", async () => {
    const p = await users.owner.client.rpc("create_project", {
      _title: `Config ${run}`,
      _description: null,
    });
    projectIds.push(p.data as string);
    const stages = [
      {
        key: "program_brief_confirmed",
        name_ar: "تأكيد",
        name_en: "Brief",
        approver_roles: ["program_owner"],
      },
      {
        key: "final",
        name_ar: "نهائي",
        name_en: "Final",
        approver_roles: ["program_owner", "subject_matter_expert"],
      },
      {
        key: "compliance_review",
        name_ar: "امتثال",
        name_en: "Compliance",
        approver_roles: ["compliance_reviewer"],
      },
      {
        key: "export_frozen",
        name_ar: "تجميد",
        name_en: "Export",
        approver_roles: ["program_owner"],
      },
    ];
    const save = (c: SupabaseClient, st: unknown) =>
      c.rpc("save_workflow_stages", { _project_id: p.data, _stages: st });
    // The compliance stage cannot be removed or opened to other roles, and the export freeze stays last.
    expect(
      (await save(users.owner.client, stages.slice(0, 2).concat(stages[3]!))).error?.message,
    ).toMatch(/compliance_review stage is required/);
    expect(
      (await save(users.owner.client, [stages[0], stages[3], stages[2]])).error?.message,
    ).toMatch(/must be the last stage/);
    expect(
      (
        await save(users.owner.client, [
          stages[0],
          { ...stages[2], approver_roles: ["program_owner"] },
          stages[3],
        ])
      ).error?.message,
    ).toMatch(/only be decided by compliance/);
    expect(
      (await users.sme.client.rpc("save_workflow_stages", { _project_id: p.data, _stages: stages }))
        .error,
    ).not.toBeNull();
    expect(
      (
        await users.owner.client.rpc("save_workflow_stages", {
          _project_id: p.data,
          _stages: stages,
        })
      ).error,
    ).toBeNull();
    const { data } = await users.owner.client
      .from("workflow_stages")
      .select("stage_key")
      .eq("project_id", p.data)
      .eq("is_active", true)
      .order("position");
    expect(data?.map((s) => s.stage_key)).toEqual([
      "program_brief_confirmed",
      "final",
      "compliance_review",
      "export_frozen",
    ]);
    const off = await admin
      .from("workflow_stages")
      .update({ is_active: false })
      .eq("project_id", p.data)
      .eq("stage_key", "compliance_review");
    expect(off.error?.message).toMatch(/cannot be removed/);
  });
});
