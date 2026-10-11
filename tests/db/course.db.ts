/* eslint-disable @typescript-eslint/no-explicit-any -- rows from an untyped test client */
/**
 * Course Studio: hierarchy, block validation, versioning, review gate and isolation against the real backend.
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
let projectId = "";
let otherProjectId = "";
let archVersion = "";
let courseElement = "";
const media: Record<string, string> = {};

async function makeUser(name: string) {
  const email = `cs-${name}-${run}@kau.edu.sa`;
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
async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

function block(type: string, payload: unknown, lang = "en") {
  return { type, lang, payload };
}
function validBlocks() {
  return [
    block("rich_text", { text: "### Overview\nLearn **tests**." }),
    block("image", { media_id: media.image, alt: "Chart", caption: "", decorative: false }),
    block("audio", { media_id: media.audio, transcript: "Hello" }),
    block("video", {
      media_id: media.video,
      captions_url: "https://cdn.kau.edu.sa/c.vtt",
      transcript: "",
    }),
    block("embed", { url: "https://www.youtube-nocookie.com/embed/abc", title: "Intro" }),
    block("knowledge_check", {
      question: "Q?",
      choices: ["a", "b"],
      correct_index: 1,
      feedback_correct: "Yes",
      feedback_incorrect: "No",
      outcome_code: "CLO1",
    }),
    block("scenario", { prompt: "P", branches: [{ choice: "c", feedback: "f" }] }),
    block("rubric", {
      criteria: [{ name: "C", levels: [{ label: "L", points: 2, description: "" }] }],
    }),
    block("glossary", { terms: [{ term: "t", definition: "d" }] }),
    block("references", {
      items: [{ author: "A", title: "T", year: "2020", publisher: "", url: "https://example.org" }],
    }),
    block("rich_text", { text: "مرحبا" }, "ar"),
  ];
}
function treeWith(blocks: unknown[], lessons2: unknown[] = []) {
  return {
    title_ar: "الإحصاء",
    title_en: "Statistics",
    lang: "en",
    modules: [
      {
        title_ar: "",
        title_en: "Module A",
        lang: "en",
        lessons: [{ title_ar: "", title_en: "Lesson A1", lang: "en", blocks }, ...lessons2],
      },
      { title_ar: "الوحدة ب", title_en: "", lang: "ar", lessons: [] },
    ],
  };
}

async function readTree(v: string) {
  const nodes = await ok(
    owner().from("course_nodes").select("*").eq("artifact_version_id", v).order("position"),
  );
  const blocks = await ok(
    owner().from("content_blocks").select("*").eq("artifact_version_id", v).order("position"),
  );
  return { nodes: nodes as any[], blocks: blocks as any[] };
}

async function newCourse() {
  // each course identity can exist once; archive previous artifacts between tests
  const existing = await ok(
    admin.from("course_contents").select("artifact_id").eq("project_id", projectId),
  );
  for (const e of existing as any[]) {
    const del = await admin.from("artifacts").delete().eq("id", e.artifact_id);
    if (del.error) throw del.error;
  }
  return (await ok(
    owner().rpc("create_course_content", {
      _architecture_version_id: archVersion,
      _course_element_id: courseElement,
    }),
  )) as string;
}
const save = (v: string, tree: unknown, c: SupabaseClient = owner()) =>
  c.rpc("save_course_content", { _version_id: v, _tree: tree, _change_summary: null });

beforeAll(async () => {
  for (const n of ["owner", "observer", "outsider"]) await makeUser(n);
  projectId = (await ok(
    owner().rpc("create_project", { _title: `Course ${run}`, _description: null }),
  )) as string;
  otherProjectId = (await ok(
    owner().rpc("create_project", { _title: `Other ${run}`, _description: null }),
  )) as string;
  const inv = await owner().rpc("invite_to_project", {
    _project_id: projectId,
    _email: users.observer.email,
    _role: "observer",
  });
  await users.observer.client.rpc("accept_invitation", { _invitation_id: inv.data });
  const brief = (await ok(
    owner().rpc("create_program_brief", {
      _project_id: projectId,
      _mode: "guided_idea",
      _category: "academic_program",
      _fields: { title: { en: "Data" }, assumptions: { en: "30 learners" } },
    }),
  )) as string;
  await ok(owner().rpc("confirm_brief_assumptions", { _version_id: brief }));
  const a = (await ok(
    owner().rpc("create_program_architecture", { _brief_version_id: brief }),
  )) as string;
  archVersion = (await ok(
    owner().rpc("save_architecture", {
      _version_id: a,
      _elements: [
        { key: "po1", type: "program_outcome", code: "PLO1", label_en: "Analyse", label_ar: "" },
        { key: "c1", type: "course", code: "STAT101", label_en: "Statistics", label_ar: "" },
        {
          key: "co1",
          type: "course_outcome",
          parent_key: "c1",
          code: "CLO1",
          label_en: "Apply",
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
      ],
      _mappings: [
        { from: "po1", to: "c1" },
        { from: "po1", to: "co1" },
        { from: "co1", to: "as1" },
      ],
      _change_summary: null,
    }),
  )) as string;
  const els = (await ok(
    owner().from("arch_elements").select("id, element_type").eq("artifact_version_id", archVersion),
  )) as any[];
  courseElement = els.find((e) => e.element_type === "course").id;
  for (const kind of ["image", "audio", "video"])
    media[kind] = (await ok(
      owner().rpc("register_media_asset", {
        _project_id: projectId,
        _kind: kind,
        _title: `${kind} asset`,
        _source_url: `https://media.kau.edu.sa/${kind}`,
        _rights_note: "KAU owned",
      }),
    )) as string;
  media.foreign = (await ok(
    owner().rpc("register_media_asset", {
      _project_id: otherProjectId,
      _kind: "image",
      _title: "foreign",
      _source_url: "",
      _rights_note: "",
    }),
  )) as string;
}, 120_000);

afterAll(async () => {
  for (const p of [projectId, otherProjectId])
    if (p) await admin.from("projects").delete().eq("id", p);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 60_000);

describe("course studio", () => {
  it("reuses the architecture course identity and rejects duplicates or non-course elements", async () => {
    const v = await newCourse();
    const cc = (await ok(
      owner().from("course_contents").select("*").eq("artifact_version_id", v).single(),
    )) as any;
    expect(cc).toMatchObject({
      course_code: "STAT101",
      course_element_id: courseElement,
      architecture_version_id: archVersion,
    });
    const dup = await owner().rpc("create_course_content", {
      _architecture_version_id: archVersion,
      _course_element_id: courseElement,
    });
    expect(dup.error?.message).toMatch(/already has content/);
    const els = (await ok(
      owner()
        .from("arch_elements")
        .select("id, element_type")
        .eq("artifact_version_id", archVersion),
    )) as any[];
    const bad = await owner().rpc("create_course_content", {
      _architecture_version_id: archVersion,
      _course_element_id: els.find((e) => e.element_type === "course_outcome").id,
    });
    expect(bad.error?.message).toMatch(/not a course/);
  });

  it("persists ordered hierarchy, round-trips every block type, and reorders safely", async () => {
    const v = await newCourse();
    const blocks = validBlocks();
    const id = (await ok(
      save(v, treeWith(blocks, [{ title_ar: "", title_en: "Lesson A2", lang: "en", blocks: [] }])),
    )) as string;
    expect(id).toBe(v); // draft edits in place
    const t = await readTree(v);
    const modules = t.nodes.filter((n) => n.node_type === "module");
    expect(modules.map((m) => [m.position, m.title_en || m.title_ar])).toEqual([
      [1, "Module A"],
      [2, "الوحدة ب"],
    ]);
    const lessons = t.nodes.filter((n) => n.node_type === "lesson");
    expect(lessons.map((l) => l.title_en)).toEqual(["Lesson A1", "Lesson A2"]);
    expect(lessons.every((l) => l.parent_id === modules[0].id)).toBe(true);
    expect(t.blocks.map((b) => b.position)).toEqual(blocks.map((_, i) => i + 1));
    expect(t.blocks.map((b) => ({ type: b.block_type, lang: b.lang, payload: b.payload }))).toEqual(
      blocks,
    );

    const reordered = [blocks[2], blocks[0], ...blocks.slice(3), blocks[1]];
    await ok(save(v, treeWith(reordered)));
    const t2 = await readTree(v);
    expect(t2.blocks.map((b) => b.block_type)).toEqual(reordered.map((b) => b.type));
    expect(t2.blocks.map((b) => b.position)).toEqual(reordered.map((_, i) => i + 1));
  });

  it("rejects invalid or unsafe payloads explicitly", async () => {
    const v = await newCourse();
    const cases: [unknown, RegExp][] = [
      [block("rich_text", { text: "<script>alert(1)</script>" }), /HTML/],
      [block("rich_text", { text: "[x](javascript:alert(1))" }), /HTML/],
      [block("rich_text", { text: "x", extra: 1 }), /Invalid rich_text/],
      [block("rich_text", { text: 5 }), /Invalid rich_text/],
      [block("embed", { url: "http://www.youtube.com/embed/x", title: "t" }), /https/],
      [block("embed", { url: "https://x.org", title: "t", html: "<iframe>" }), /Invalid embed/],
      [
        block("image", { media_id: media.foreign, alt: "a", caption: "", decorative: false }),
        /media/i,
      ],
      [
        block("image", { media_id: media.audio, alt: "a", caption: "", decorative: false }),
        /media/i,
      ],
      [
        block("knowledge_check", {
          question: "q",
          choices: ["a"],
          correct_index: 3,
          feedback_correct: "",
          feedback_incorrect: "",
          outcome_code: "",
        }),
        /correct/,
      ],
      [
        block("rubric", {
          criteria: [{ name: "C", levels: [{ label: "L", points: "x", description: "" }] }],
        }),
        /Invalid rubric/,
      ],
      [block("hologram", {}), /block type/],
    ];
    for (const [b, re] of cases) {
      const r = await save(v, treeWith([b]));
      expect(r.error?.message, JSON.stringify(b)).toMatch(re);
    }
    expect((await readTree(v)).blocks).toHaveLength(0);
  });

  it("critical validation defects block review; a clean version's review references that exact version", async () => {
    const v = await newCourse();
    await ok(
      save(
        v,
        treeWith([
          block("image", { media_id: media.image, alt: "", caption: "", decorative: false }),
          block("knowledge_check", {
            question: "Q",
            choices: ["a", "b"],
            correct_index: null,
            feedback_correct: "",
            feedback_incorrect: "",
            outcome_code: "ZZZ",
          }),
          block("embed", { url: "https://evil.example/x", title: "t" }),
          block("rich_text", { text: "#### deep" }),
          block("references", {
            items: [{ author: "A", title: "T", year: "", publisher: "", url: "nope" }],
          }),
          block("video", { media_id: media.video, captions_url: "", transcript: "" }),
          block("audio", { media_id: media.audio, transcript: "" }),
          block("scenario", { prompt: "", branches: [] }),
        ]),
      ),
    );
    const defects = (await ok(owner().rpc("check_course_content", { _version_id: v }))) as any[];
    const codes = new Set(defects.filter((d) => d.severity === "critical").map((d) => d.defect));
    for (const c of [
      "missing_alt_text",
      "kc_missing_answer",
      "kc_missing_feedback",
      "outcome_link_missing",
      "invalid_embed_domain",
      "invalid_heading_hierarchy",
      "reference_url_invalid",
      "missing_captions",
      "missing_transcript",
      "empty_payload",
    ])
      expect(codes, c).toContain(c);
    const blocked = await owner().rpc("request_review", {
      _version_id: v,
      _note: null,
      _assignees: [],
    });
    expect(blocked.error?.message).toMatch(/content validation/);

    await ok(save(v, treeWith(validBlocks())));
    const after = (await ok(owner().rpc("check_course_content", { _version_id: v }))) as any[];
    expect(after.filter((d) => d.severity === "critical")).toEqual([]);
    const req = (await ok(
      owner().rpc("request_review", { _version_id: v, _note: null, _assignees: [] }),
    )) as string;
    const rr = (await ok(
      owner().from("review_requests").select("artifact_version_id").eq("id", req).single(),
    )) as any;
    expect(rr.artifact_version_id).toBe(v);
  });

  it("editing in-review content branches a complete child tree and preserves the parent", async () => {
    const v = await newCourse();
    await ok(save(v, treeWith(validBlocks())));
    await ok(owner().rpc("request_review", { _version_id: v, _note: null, _assignees: [] }));
    const before = await readTree(v);
    const changed = treeWith([block("rich_text", { text: "Changed" }), ...validBlocks()]);
    const child = (await ok(save(v, changed))) as string;
    expect(child).not.toBe(v);
    const parentAfter = await readTree(v);
    expect(parentAfter).toEqual(before);
    const ver = (await ok(
      owner().from("artifact_versions").select("id, state, parent_version_id").in("id", [v, child]),
    )) as any[];
    expect(ver.find((x) => x.id === v).state).toBe("in_review");
    expect(ver.find((x) => x.id === child)).toMatchObject({ state: "draft", parent_version_id: v });
    const c = await readTree(child);
    expect(c.blocks).toHaveLength(before.blocks.length + 1);
    expect(c.nodes).toHaveLength(before.nodes.length);
    expect(c.blocks.every((b) => !before.blocks.some((p) => p.id === b.id))).toBe(true);
    const cc = (await ok(
      owner()
        .from("course_contents")
        .select("course_code")
        .eq("artifact_version_id", child)
        .single(),
    )) as any;
    expect(cc.course_code).toBe("STAT101");
    // the locked parent cannot be written directly, even by the service role
    const direct = await admin
      .from("content_blocks")
      .update({ payload: { text: "x" } })
      .eq("artifact_version_id", v);
    expect(direct.error?.message).toMatch(/locked/);
  });

  it("observers read but cannot write; non-members see zero rows and cannot write", async () => {
    const v = await newCourse();
    await ok(save(v, treeWith(validBlocks())));
    const obs = users.observer.client;
    expect(
      ((await ok(obs.from("content_blocks").select("id").eq("artifact_version_id", v))) as any[])
        .length,
    ).toBeGreaterThan(0);
    expect((await save(v, treeWith([]), obs)).error?.message).toMatch(/Observers/);
    expect(
      (
        await obs.rpc("register_media_asset", {
          _project_id: projectId,
          _kind: "image",
          _title: "x",
          _source_url: "",
          _rights_note: "",
        })
      ).error,
    ).toBeTruthy();
    const out = users.outsider.client;
    for (const table of ["course_contents", "course_nodes", "content_blocks", "media_assets"]) {
      const r = await out.from(table).select("*").eq("project_id", projectId);
      expect(r.error).toBeNull();
      expect(r.data, table).toEqual([]);
    }
    expect((await save(v, treeWith([]), out)).error).toBeTruthy();
    expect((await out.rpc("check_course_content", { _version_id: v })).error).toBeTruthy();
    expect(
      (
        await out.rpc("create_course_content", {
          _architecture_version_id: archVersion,
          _course_element_id: courseElement,
        })
      ).error,
    ).toBeTruthy();
    // no direct table writes for members either
    const ins = await owner().from("content_blocks").insert({
      project_id: projectId,
      artifact_version_id: v,
      lesson_id: v,
      position: 99,
      block_type: "rich_text",
      lang: "en",
      payload: {},
    });
    expect(ins.error).toBeTruthy();
  });

  it("audits course content operations", async () => {
    const ev = (await ok(
      owner().from("audit_events").select("action").eq("project_id", projectId),
    )) as any[];
    const actions = new Set(ev.map((e) => e.action));
    for (const a of ["course_content.created", "course_content.saved", "media_asset.registered"])
      expect(actions).toContain(a);
  });
});
