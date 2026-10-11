/**
 * Program intake, canonical brief and architecture alignment against the real backend.
 * The service key is used only for throwaway users, cleanup, and to stand in for the
 * server-side extraction step (service-role only RPC). Run: bun run test:db
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BRIEF_FIELDS, parseProposalText } from "../../src/features/intake/brief";

const url = process.env["SUPABASE_URL"]!;
const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const run = Math.random().toString(36).slice(2, 8);
const password = `T3st-${run}-${Math.random().toString(36).slice(2)}`;
const BUCKET = "project-sources";

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
let projectId = "";
const uploaded: string[] = [];

async function makeUser(name: string) {
  const email = `in-${name}-${run}@kau.edu.sa`;
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

const owner = () => users.owner.client;

async function brief(versionId: string) {
  const { data, error } = await owner()
    .from("program_briefs")
    .select("*")
    .eq("artifact_version_id", versionId)
    .single();
  if (error) throw error;
  return data;
}

async function createBrief(mode: string, extra: Record<string, unknown> = {}) {
  const r = await owner().rpc("create_program_brief", {
    _project_id: projectId,
    _mode: mode,
    _category: "academic_program",
    _fields: { title: { en: `Brief ${mode}` }, assumptions: { en: "Cohort of 30 learners" } },
    ...extra,
  });
  if (r.error) throw r.error;
  return r.data as string;
}

async function uploadSource(name: string, type: string, body: string) {
  const path = `${projectId}/${crypto.randomUUID()}/${name}`;
  const up = await owner()
    .storage.from(BUCKET)
    .upload(path, new Blob([body], { type }), { contentType: type });
  if (up.error) throw up.error;
  uploaded.push(path);
  const reg = await owner().rpc("register_source_file", {
    _project_id: projectId,
    _storage_path: path,
    _file_name: name,
    _mime_type: type,
    _size_bytes: body.length,
  });
  if (reg.error) throw reg.error;
  return { path, fileId: reg.data as string };
}

async function confirmedBrief() {
  const v = await createBrief("guided_idea");
  expect((await owner().rpc("confirm_brief_assumptions", { _version_id: v })).error).toBeNull();
  return v;
}

function alignedElements() {
  return {
    _elements: [
      { key: "po1", type: "program_outcome", code: "PLO1", label_en: "Analyse data", label_ar: "" },
      { key: "c1", type: "course", code: "STAT101", label_en: "Statistics", label_ar: "" },
      {
        key: "co1",
        type: "course_outcome",
        parent_key: "c1",
        code: "CLO1",
        label_en: "Apply tests",
        label_ar: "",
      },
      {
        key: "act1",
        type: "activity",
        parent_key: "c1",
        code: "A1",
        label_en: "Lab",
        label_ar: "",
      },
      {
        key: "as1",
        type: "assessment",
        parent_key: "c1",
        code: "E1",
        label_en: "Exam",
        label_ar: "",
      },
      {
        key: "ev1",
        type: "source_evidence",
        code: "S1",
        label_en: "Labour market report",
        label_ar: "",
      },
    ],
    _mappings: [
      { from: "po1", to: "c1" },
      { from: "po1", to: "co1" },
      { from: "co1", to: "act1" },
      { from: "act1", to: "as1" },
      { from: "ev1", to: "po1" },
    ],
  };
}

beforeAll(async () => {
  for (const n of ["owner", "observer", "outsider"]) await makeUser(n);
  const p = await owner().rpc("create_project", { _title: `Intake ${run}`, _description: null });
  if (p.error) throw p.error;
  projectId = p.data as string;
  const inv = await owner().rpc("invite_to_project", {
    _project_id: projectId,
    _email: users.observer.email,
    _role: "observer",
  });
  await users.observer.client.rpc("accept_invitation", { _invitation_id: inv.data });
}, 90_000);

afterAll(async () => {
  if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded);
  if (projectId) await admin.from("projects").delete().eq("id", projectId);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 60_000);

describe("program intake and canonical brief", () => {
  it("all three intake modes produce the same canonical brief shape", async () => {
    const guided = await createBrief("guided_idea");

    const text = "Title: Applied AI Diploma\nRationale: Regional demand\nRisks: Faculty capacity";
    const { fileId } = await uploadSource("proposal.txt", "text/plain", text);
    const ex = await admin.rpc("record_source_extraction", {
      _file_id: fileId,
      _status: "succeeded",
      _text: text,
      _fields: parseProposalText(text),
      _error: null,
    });
    expect(ex.error).toBeNull();
    const upload = await createBrief("document_upload", { _source_file_id: fileId });

    const redevelop = await createBrief("redevelopment", {
      _snapshot: {
        source_label: "BSc Statistics 2019",
        raw_text: "legacy",
        fields: { title: "BSc Statistics", rationale: "Legacy plan" },
      },
    });

    const shapes = [];
    for (const v of [guided, upload, redevelop]) {
      const b = await brief(v);
      expect(Object.keys(b.fields).sort()).toEqual([...BRIEF_FIELDS].sort());
      for (const k of BRIEF_FIELDS)
        expect(Object.keys(b.fields[k]).sort()).toEqual(["ar", "en", "provenance", "source_ref"]);
      shapes.push(Object.keys(b).sort());
    }
    expect(shapes[1]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[0]);

    const up = await brief(upload);
    expect(up.intake_mode).toBe("document_upload");
    expect(up.fields.rationale).toMatchObject({
      en: "Regional demand",
      provenance: "extracted",
      source_ref: `source_file:${fileId}`,
    });
    expect(up.fields.title.provenance).toBe("manual"); // manual entry overrides extracted
    const rd = await brief(redevelop);
    expect(rd.fields.rationale).toMatchObject({ en: "Legacy plan", provenance: "imported" });
    expect(rd.fields.rationale.source_ref).toBe(`snapshot:${rd.source_snapshot_id}`);
  });

  it("does not pretend extraction succeeded", async () => {
    const { fileId } = await uploadSource("scan.pdf", "application/pdf", "%PDF-1.4");
    await admin.rpc("record_source_extraction", {
      _file_id: fileId,
      _status: "unsupported",
      _text: null,
      _fields: {},
      _error: "not available",
    });
    const v = await createBrief("document_upload", { _source_file_id: fileId });
    const b = await brief(v);
    expect(
      Object.values(b.fields).some((f) => (f as { provenance: string }).provenance === "extracted"),
    ).toBe(false);
    // Clients cannot record extraction results themselves
    const forged = await owner().rpc("record_source_extraction", {
      _file_id: fileId,
      _status: "succeeded",
      _text: "x",
      _fields: { title: "x" },
      _error: null,
    });
    expect(forged.error).not.toBeNull();
  });

  it("rejects upload type and size violations explicitly", async () => {
    const base = {
      _project_id: projectId,
      _storage_path: `${projectId}/x/file`,
      _file_name: "file",
    };
    const badType = await owner().rpc("register_source_file", {
      ...base,
      _mime_type: "image/png",
      _size_bytes: 100,
    });
    expect(badType.error?.message).toMatch(/file type/i);
    const tooBig = await owner().rpc("register_source_file", {
      ...base,
      _mime_type: "application/pdf",
      _size_bytes: 10 * 1024 * 1024 + 1,
    });
    expect(tooBig.error?.message).toMatch(/10 MB/i);
    const wrongProject = await owner().rpc("register_source_file", {
      ...base,
      _storage_path: `${crypto.randomUUID()}/x/file`,
      _mime_type: "application/pdf",
      _size_bytes: 100,
    });
    expect(wrongProject.error).not.toBeNull();
  });

  it("redevelopment preserves the imported snapshot", async () => {
    const v = await createBrief("redevelopment", {
      _snapshot: { source_label: "Old", raw_text: "original text", fields: { title: "Old title" } },
    });
    const b = await brief(v);
    const edit = await owner().rpc("update_program_brief", {
      _version_id: v,
      _category: "academic_program",
      _change_summary: "rename",
      _fields: { ...b.fields, title: { ...b.fields.title, en: "New title" } },
    });
    expect(edit.error).toBeNull();
    const snap = await owner()
      .from("program_source_snapshots")
      .select("snapshot")
      .eq("id", b.source_snapshot_id)
      .single();
    expect(snap.data?.snapshot).toEqual({
      source_label: "Old",
      raw_text: "original text",
      fields: { title: "Old title" },
    });
    const tamper = await admin
      .from("program_source_snapshots")
      .update({ snapshot: {} })
      .eq("id", b.source_snapshot_id);
    expect(tamper.error).not.toBeNull();
    expect((await brief(v)).fields.title).toMatchObject({
      en: "New title",
      provenance: "manual",
      source_ref: null,
    });
  });

  it("rejects architecture and brief review until assumptions are confirmed", async () => {
    const v = await createBrief("guided_idea");
    const arch = await owner().rpc("create_program_architecture", { _brief_version_id: v });
    expect(arch.error?.message).toMatch(/assumptions/i);
    const review = await owner().rpc("request_review", {
      _version_id: v,
      _note: null,
      _assignees: [],
    });
    expect(review.error?.message).toMatch(/assumptions/i);
    expect(
      (await users.observer.client.rpc("confirm_brief_assumptions", { _version_id: v })).error,
    ).not.toBeNull();
    expect((await owner().rpc("confirm_brief_assumptions", { _version_id: v })).error).toBeNull();
    expect(
      (await owner().rpc("create_program_architecture", { _brief_version_id: v })).error,
    ).toBeNull();
  });

  it("approved/in-review brief changes create a child version and preserve the parent", async () => {
    const v = await confirmedBrief();
    expect(
      (await owner().rpc("request_review", { _version_id: v, _note: null, _assignees: [] })).error,
    ).toBeNull();
    const before = await brief(v);
    const direct = await admin
      .from("program_briefs")
      .update({ fields: {} })
      .eq("artifact_version_id", v);
    expect(direct.error?.message).toMatch(/locked/i);
    const content = await admin.from("artifact_versions").update({ content: "x" }).eq("id", v);
    expect(content.error).not.toBeNull();

    const child = await owner().rpc("update_program_brief", {
      _version_id: v,
      _category: "academic_program",
      _change_summary: "risk added",
      _fields: {
        ...before.fields,
        risks: { ar: "", en: "Accreditation timing", provenance: "manual", source_ref: null },
      },
    });
    expect(child.error).toBeNull();
    expect(child.data).not.toBe(v);
    expect((await brief(v)).fields).toEqual(before.fields);
    const c = await brief(child.data as string);
    expect(c.fields.risks.en).toBe("Accreditation timing");
    expect(c.assumptions_confirmed_at).not.toBeNull(); // assumptions unchanged → confirmation carried
    const pv = await owner()
      .from("artifact_versions")
      .select("parent_version_id, state")
      .eq("id", child.data)
      .single();
    expect(pv.data).toEqual({ parent_version_id: v, state: "draft" });
    // Generic text edits cannot bypass the structured brief
    expect(
      (
        await owner().rpc("edit_artifact", {
          _version_id: child.data,
          _content: "hack",
          _change_summary: null,
        })
      ).error,
    ).not.toBeNull();
  });
});

describe("architecture and alignment", () => {
  let archVersion = "";

  it("stores outcomes, courses, activities, assessments, evidence and mappings", async () => {
    const b = await confirmedBrief();
    const a = await owner().rpc("create_program_architecture", { _brief_version_id: b });
    expect(a.error).toBeNull();
    archVersion = a.data as string;
    const save = await owner().rpc("save_architecture", {
      _version_id: archVersion,
      ...alignedElements(),
      _change_summary: null,
    });
    expect(save.error).toBeNull();
    expect(save.data).toBe(archVersion);
    const els = await owner()
      .from("arch_elements")
      .select("element_type")
      .eq("artifact_version_id", archVersion);
    expect(els.data?.map((e) => e.element_type).sort()).toEqual([
      "activity",
      "assessment",
      "course",
      "course_outcome",
      "program_outcome",
      "source_evidence",
    ]);
    expect(
      (await owner().from("arch_mappings").select("id").eq("artifact_version_id", archVersion))
        .data,
    ).toHaveLength(5);
    expect(
      (await owner().rpc("check_architecture_alignment", { _version_id: archVersion })).data,
    ).toEqual([]);
  });

  it("detects each alignment defect type and blocks review while defects exist", async () => {
    const b = await confirmedBrief();
    const v = (await owner().rpc("create_program_architecture", { _brief_version_id: b }))
      .data as string;
    const base = alignedElements();
    base._elements.push(
      { key: "po2", type: "program_outcome", code: "PLO2", label_en: "Communicate", label_ar: "" },
      {
        key: "po3",
        type: "program_outcome",
        code: "PLO3",
        label_en: "ANALYSE  data",
        label_ar: "",
      },
      {
        key: "co2",
        type: "course_outcome",
        parent_key: "c1",
        code: "CLO2",
        label_en: "Write report",
        label_ar: "",
      },
    );
    base._mappings.push({ from: "po3", to: "co1" });
    expect(
      (await owner().rpc("save_architecture", { _version_id: v, ...base, _change_summary: null }))
        .error,
    ).toBeNull();
    const { data } = await owner().rpc("check_architecture_alignment", { _version_id: v });
    const found = (data as { defect: string; code: string }[]).map((d) => `${d.defect}:${d.code}`);
    expect(found).toEqual([
      "orphaned_program_outcome:PLO2",
      "duplicate_outcome:PLO3",
      "course_outcome_without_parent:CLO2",
      "outcome_without_assessment:PLO2",
      "outcome_without_assessment:CLO2",
    ]);
    const review = await owner().rpc("request_review", {
      _version_id: v,
      _note: null,
      _assignees: [],
    });
    expect(review.error?.message).toMatch(/alignment/i);
  });

  it("locks architecture under review and edits create a child copy", async () => {
    expect(
      (
        await owner().rpc("request_review", {
          _version_id: archVersion,
          _note: null,
          _assignees: [],
        })
      ).error,
    ).toBeNull();
    const tamper = await admin
      .from("arch_elements")
      .update({ label_en: "x" })
      .eq("artifact_version_id", archVersion);
    expect(tamper.error?.message).toMatch(/locked/i);
    const next = alignedElements();
    next._elements[0].label_en = "Analyse and interpret data";
    const child = await owner().rpc("save_architecture", {
      _version_id: archVersion,
      ...next,
      _change_summary: "reword",
    });
    expect(child.error).toBeNull();
    expect(child.data).not.toBe(archVersion);
    const parentPo = await owner()
      .from("arch_elements")
      .select("label_en")
      .eq("artifact_version_id", archVersion)
      .eq("element_type", "program_outcome")
      .single();
    expect(parentPo.data?.label_en).toBe("Analyse data");
    const childPo = await owner()
      .from("arch_elements")
      .select("label_en")
      .eq("artifact_version_id", child.data)
      .eq("element_type", "program_outcome")
      .single();
    expect(childPo.data?.label_en).toBe("Analyse and interpret data");
  });

  it("observers cannot write intake or architecture", async () => {
    const o = users.observer.client;
    expect(
      (
        await o.rpc("create_program_brief", {
          _project_id: projectId,
          _mode: "guided_idea",
          _category: "micro_credential",
          _fields: { title: { en: "x" } },
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await o.rpc("save_architecture", {
          _version_id: archVersion,
          ...alignedElements(),
          _change_summary: null,
        })
      ).error,
    ).not.toBeNull();
  });

  it("a non-member sees no brief, source, architecture, outcome, activity, assessment or mapping", async () => {
    const c = users.outsider.client;
    for (const t of [
      "program_briefs",
      "source_files",
      "program_source_snapshots",
      "program_architectures",
      "arch_elements",
      "arch_mappings",
    ]) {
      const { data, error } = await c.from(t).select("*");
      expect(error, t).toBeNull();
      expect(data, t).toEqual([]);
    }
    for (const type of ["program_outcome", "activity", "assessment"]) {
      expect(
        (await c.from("arch_elements").select("id").eq("element_type", type)).data,
        type,
      ).toEqual([]);
    }
    expect(
      (await c.rpc("check_architecture_alignment", { _version_id: archVersion })).error,
    ).not.toBeNull();
    const list = await c.storage.from(BUCKET).list(projectId);
    expect(list.data ?? []).toEqual([]);
    const dl = await c.storage.from(BUCKET).download(uploaded[0]);
    expect(dl.data).toBeNull();
    const up = await c.storage
      .from(BUCKET)
      .upload(`${projectId}/evil/x.txt`, new Blob(["x"], { type: "text/plain" }));
    expect(up.error).not.toBeNull();
  });
});
