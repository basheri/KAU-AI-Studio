/**
 * Database isolation tests against the real backend through the public Data API.
 * The service key is used ONLY in this Node test process to create and remove
 * throwaway test users; every assertion runs as a normal signed-in user with RLS.
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
const users: Record<string, { id: string; email: string; client: SupabaseClient }> = {};
let projectId = "";
let inviteId = "";

async function makeUser(name: string) {
  const email = `rls-${name}-${run}@kau.edu.sa`;
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

beforeAll(async () => {
  await makeUser("owner");
  await makeUser("member");
  await makeUser("outsider");
}, 60_000);

afterAll(async () => {
  if (projectId) await admin.from("projects").delete().eq("id", projectId);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
});

describe("project isolation (RLS)", () => {
  it("rejects non-KAU sign-ups at the database", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: `rls-bad-${run}@gmail.com`,
      password,
      email_confirm: true,
    });
    expect(error).not.toBeNull();
  });

  it("creates the program owner atomically as the first member", async () => {
    const { owner } = users;
    const { data, error } = await owner.client.rpc("create_project", {
      _title: `Secret Program ${run}`,
      _description: "confidential",
    });
    expect(error).toBeNull();
    projectId = data as string;
    const members = await owner.client
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", projectId);
    expect(members.data).toEqual([{ user_id: owner.id, role: "program_owner" }]);
    const settings = await owner.client
      .from("project_settings")
      .select("project_id")
      .eq("project_id", projectId);
    expect(settings.data).toHaveLength(1);
    const audit = await owner.client
      .from("audit_events")
      .select("action")
      .eq("project_id", projectId);
    expect(audit.data?.map((a) => a.action)).toContain("project.created");
  });

  it("blocks direct project inserts and self-joins", async () => {
    const { outsider } = users;
    const ins = await outsider.client
      .from("projects")
      .insert({ title: "x", created_by: outsider.id });
    expect(ins.error).not.toBeNull();
    const join = await outsider.client
      .from("project_members")
      .insert({ project_id: projectId, user_id: outsider.id, role: "program_owner" });
    expect(join.error).not.toBeNull();
    const selfAdmin = await outsider.client
      .from("platform_admins")
      .insert({ user_id: outsider.id });
    expect(selfAdmin.error).not.toBeNull();
  });

  it("stores file, comment and export metadata for members", async () => {
    const c = users.owner.client;
    expect(
      (
        await c.from("project_files").insert({
          project_id: projectId,
          file_name: "syllabus.pdf",
          mime_type: "application/pdf",
          size_bytes: 1000,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await c
          .from("project_comments")
          .insert({ project_id: projectId, body: "confidential comment" })
      ).error,
    ).toBeNull();
    expect(
      (
        await c
          .from("project_exports")
          .insert({ project_id: projectId, export_format: "docx", file_name: "spec.docx" })
      ).error,
    ).toBeNull();
  });

  it("rejects non-KAU invitations and requires explicit acceptance", async () => {
    const { owner, member } = users;
    const bad = await owner.client.rpc("invite_to_project", {
      _project_id: projectId,
      _email: "x@gmail.com",
      _role: "observer",
    });
    expect(bad.error).not.toBeNull();
    const inv = await owner.client.rpc("invite_to_project", {
      _project_id: projectId,
      _email: `  ${member.email.toUpperCase()} `,
      _role: "subject_matter_expert",
    });
    expect(inv.error).toBeNull();
    inviteId = inv.data as string;
    // Not a member until accepting
    expect((await member.client.from("projects").select("id").eq("id", projectId)).data).toEqual(
      [],
    );
    const mine = await member.client.rpc("list_my_invitations");
    expect(mine.data).toHaveLength(1);
    // Outsider cannot accept someone else's invitation
    const steal = await users.outsider.client.rpc("accept_invitation", {
      _invitation_id: inviteId,
    });
    expect(steal.error).not.toBeNull();
    const acc = await member.client.rpc("accept_invitation", { _invitation_id: inviteId });
    expect(acc.error).toBeNull();
  });

  it("lets a project member read the project and its metadata", async () => {
    const c = users.member.client;
    expect((await c.from("projects").select("title").eq("id", projectId)).data).toEqual([
      { title: `Secret Program ${run}` },
    ]);
    expect(
      (await c.from("project_exports").select("id").eq("project_id", projectId)).data,
    ).toHaveLength(1);
    expect(
      (await c.from("project_files").select("id").eq("project_id", projectId)).data,
    ).toHaveLength(1);
    const role = await c.from("project_members").select("role").eq("user_id", users.member.id);
    expect(role.data).toEqual([{ role: "subject_matter_expert" }]);
  });

  it("returns zero rows to a non-member on every project table", async () => {
    const c = users.outsider.client;
    for (const t of [
      "projects",
      "project_members",
      "project_invitations",
      "project_settings",
      "project_comments",
      "audit_events",
    ]) {
      const { data, error } = await c.from(t).select("*");
      expect(error, t).toBeNull();
      expect(data, t).toEqual([]);
    }
  });

  it("does not let a non-member retrieve export or file metadata", async () => {
    const c = users.outsider.client;
    expect((await c.from("project_exports").select("*").eq("project_id", projectId)).data).toEqual(
      [],
    );
    expect((await c.from("project_files").select("*").eq("project_id", projectId)).data).toEqual(
      [],
    );
  });

  it("denies the admin capability to non-admins", async () => {
    const r = await users.owner.client.rpc("admin_list_projects");
    expect(r.error).not.toBeNull();
  });
});
