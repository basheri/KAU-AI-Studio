/* eslint-disable @typescript-eslint/no-explicit-any -- rows from an untyped test client */
/**
 * Compliance Library: sources, rules, applicability, immutable runs, findings and isolation
 * against the real backend. Demonstration rules below are TEST DATA ONLY.
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
let briefVersion = "";
let briefArtifact = "";
let rulesetId = "";
const CTX = { delivery_mode: "online", credit_type: "credit_bearing", language: "bilingual" };

async function makeUser(name: string) {
  const email = `cmp-${name}-${run}@kau.edu.sa`;
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
const reviewer = () => users.reviewer.client;
async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}
const today = () => new Date().toISOString().slice(0, 10);
const shift = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function sourceFields(extra: Record<string, unknown> = {}) {
  return {
    title_en: `[DEMO] Test policy ${run}`,
    title_ar: "",
    issuing_authority: "Demo authority (test data)",
    document_type: "policy",
    scope: "test",
    source_url: "https://example.org/demo-policy",
    official_identifier: `DEMO-POL-${run}`,
    official_version: "1.0",
    effective_on: shift(-10),
    checksum: "a".repeat(64),
    ...extra,
  };
}
async function draftSource(extra: Record<string, unknown> = {}) {
  return (await ok(
    owner().rpc("save_compliance_source", {
      _project_id: projectId,
      _source_id: null,
      _fields: sourceFields(extra),
    }),
  )) as string;
}
async function activeSource(extra: Record<string, unknown> = {}) {
  const id = await draftSource(extra);
  await ok(
    owner().rpc("transition_compliance_source", {
      _source_id: id,
      _to: "under_review",
      _comment: null,
    }),
  );
  await ok(
    reviewer().rpc("transition_compliance_source", {
      _source_id: id,
      _to: "active",
      _comment: "Checked",
    }),
  );
  return id;
}
async function draftRule(code: string, fields: Record<string, unknown>, evidence: unknown[]) {
  return (await ok(
    owner().rpc("save_compliance_rule", {
      _ruleset_id: rulesetId,
      _rule_id: null,
      _fields: {
        rule_code: code,
        statement_en: `[DEMO] ${code} statement`,
        remediation_en: "Fix it",
        severity: "blocker",
        check_type: "automated",
        check_spec: { type: "brief_field_bilingual", field: "title" },
        effective_from: shift(-1),
        ...fields,
      },
      _evidence: evidence,
    }),
  )) as string;
}
const activate = (id: string) =>
  reviewer().rpc("set_compliance_rule_status", { _rule_id: id, _to: "active", _comment: null });
const ev = (sourceId: string) => [{ source_id: sourceId, locator: "§2", page: "4", section: "2" }];
const runOn = (c: SupabaseClient, version = briefVersion) =>
  c.rpc("run_compliance", { _version_id: version, _ruleset_id: rulesetId, _context: CTX });

beforeAll(async () => {
  for (const n of ["owner", "reviewer", "observer", "outsider"]) await makeUser(n);
  projectId = (await ok(
    owner().rpc("create_project", { _title: `Compliance ${run}`, _description: null }),
  )) as string;
  for (const [n, role] of [
    ["reviewer", "compliance_reviewer"],
    ["observer", "observer"],
  ] as const) {
    const inv = await ok(
      owner().rpc("invite_to_project", {
        _project_id: projectId,
        _email: users[n].email,
        _role: role,
      }),
    );
    await ok(users[n].client.rpc("accept_invitation", { _invitation_id: inv }));
  }
  briefVersion = (await ok(
    owner().rpc("create_program_brief", {
      _project_id: projectId,
      _mode: "guided_idea",
      _category: "academic_program",
      _fields: { title: { en: "Data Science" }, assumptions: { en: "30 learners" } },
    }),
  )) as string;
  await ok(owner().rpc("confirm_brief_assumptions", { _version_id: briefVersion }));
  const v = (await ok(
    owner().from("artifact_versions").select("artifact_id").eq("id", briefVersion).single(),
  )) as any;
  briefArtifact = v.artifact_id;
  rulesetId = (await ok(
    owner().rpc("save_compliance_ruleset", {
      _project_id: projectId,
      _ruleset_id: null,
      _code: "DEMO-RS",
      _title_ar: "",
      _title_en: "[DEMO] Test ruleset",
    }),
  )) as string;
}, 120_000);

afterAll(async () => {
  if (projectId) await admin.from("projects").delete().eq("id", projectId);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 60_000);

describe("compliance library", () => {
  it("computes source status and authorization deterministically by date", async () => {
    const cases: [string, string | null, string | null, string, string, boolean][] = [
      ["active", "2025-01-01", "2025-12-31", "2025-06-01", "active", true],
      ["active", "2025-01-01", "2025-12-31", "2026-01-01", "expired", false],
      ["active", "2025-07-01", null, "2025-06-01", "active", false],
      ["draft", null, null, "2025-06-01", "draft", false],
      ["rejected", null, null, "2025-06-01", "rejected", false],
      ["under_review", null, null, "2025-06-01", "under_review", false],
      ["superseded", null, null, "2025-06-01", "superseded", false],
    ];
    for (const [s, eff, exp, on, status, auth] of cases) {
      const a = { _status: s, _effective: eff, _expires: exp, _on: on };
      expect(await ok(owner().rpc("source_status_on", a)), JSON.stringify(a)).toBe(status);
      expect(await ok(owner().rpc("source_authorizes", a)), JSON.stringify(a)).toBe(auth);
    }
    const id = await activeSource({ official_identifier: `DEMO-STAT-${run}` });
    const row = (await ok(
      owner()
        .from("compliance_sources_current")
        .select("status, effective_status, authorizes_rules")
        .eq("id", id)
        .single(),
    )) as any;
    expect(row).toEqual({ status: "active", effective_status: "active", authorizes_rules: true });
  });

  it("requires an active, in-date source before a rule can become active", async () => {
    const r0 = await draftRule(`DEMO-NOEV-${run}`, {}, []);
    expect((await activate(r0)).error?.message).toMatch(/active, effective source/);

    const draft = await draftSource({ official_identifier: `DEMO-DRAFT-${run}` });
    const r1 = await draftRule(`DEMO-DRAFTEV-${run}`, {}, ev(draft));
    expect((await activate(r1)).error?.message).toMatch(/active, effective source/);

    const rej = await draftSource({ official_identifier: `DEMO-REJ-${run}` });
    await ok(
      owner().rpc("transition_compliance_source", {
        _source_id: rej,
        _to: "under_review",
        _comment: null,
      }),
    );
    const noComment = await reviewer().rpc("transition_compliance_source", {
      _source_id: rej,
      _to: "rejected",
      _comment: "",
    });
    expect(noComment.error?.message).toMatch(/comment/i);
    await ok(
      reviewer().rpc("transition_compliance_source", {
        _source_id: rej,
        _to: "rejected",
        _comment: "Wrong document",
      }),
    );
    const r2 = await draftRule(`DEMO-REJEV-${run}`, {}, ev(rej));
    expect((await activate(r2)).error?.message).toMatch(/active, effective source/);

    // An already-expired source can never be activated through the RPC ...
    const old = await draftSource({
      official_identifier: `DEMO-OLD-${run}`,
      effective_on: "2020-01-01",
      expires_on: "2020-12-31",
    });
    await ok(
      owner().rpc("transition_compliance_source", {
        _source_id: old,
        _to: "under_review",
        _comment: null,
      }),
    );
    const act = await reviewer().rpc("transition_compliance_source", {
      _source_id: old,
      _to: "active",
      _comment: "x",
    });
    expect(act.error?.message).toMatch(/expired/i);
    // ... and a stored "active" row past its expiry date still does not authorize (direct write).
    const exp = await admin
      .from("compliance_sources")
      .insert({
        project_id: projectId,
        lineage_id: crypto.randomUUID(),
        title_en: "[DEMO] expired",
        issuing_authority: "Demo",
        document_type: "policy",
        source_url: "https://example.org/x",
        official_identifier: `DEMO-EXP-${run}`,
        effective_on: "2020-01-01",
        expires_on: "2020-12-31",
        status: "active",
        created_by: users.owner.id,
      })
      .select("id")
      .single();
    expect(exp.error).toBeNull();
    const view = (await ok(
      owner()
        .from("compliance_sources_current")
        .select("effective_status, authorizes_rules")
        .eq("id", exp.data!.id)
        .single(),
    )) as any;
    expect(view).toEqual({ effective_status: "expired", authorizes_rules: false });
    const r3 = await draftRule(`DEMO-EXPEV-${run}`, {}, ev(exp.data!.id));
    expect((await activate(r3)).error?.message).toMatch(/active, effective source/);
    // Even the service role cannot force an unsupported rule to active.
    const forced = await admin
      .from("compliance_rules")
      .update({ status: "active" })
      .eq("id", r3);
    expect(forced.error?.message).toMatch(/active, effective source/);

    const good = await activeSource({ official_identifier: `DEMO-GOOD-${run}` });
    const r4 = await draftRule(`DEMO-OK-${run}`, { severity: "info" }, ev(good));
    expect((await activate(r4)).error).toBeNull();
    // Observers and owners cannot approve rules; only compliance reviewers.
    const r5 = await draftRule(`DEMO-ROLE-${run}`, { severity: "info" }, ev(good));
    expect(
      (await owner().rpc("set_compliance_rule_status", { _rule_id: r5, _to: "active" })).error,
    ).not.toBeNull();
    await ok(reviewer().rpc("set_compliance_rule_status", { _rule_id: r4, _to: "retired", _comment: "cleanup" }));
  });

  it("evaluates applicability across category, delivery, credit, language, kind and dates", async () => {
    const ctx = {
      category: "academic_program",
      delivery_mode: "online",
      credit_type: "credit_bearing",
      language: "ar",
      artifact_kind: "program_brief",
    };
    const t = (app: object, from: string | null, to: string | null, on: string, c = ctx) =>
      ok(owner().rpc("rule_applies", { _app: app, _from: from, _to: to, _ctx: c, _on: on }));
    expect(await t({}, null, null, "2026-01-01")).toBe(true);
    expect(await t({ categories: ["academic_program"] }, null, null, "2026-01-01")).toBe(true);
    expect(await t({ categories: ["micro_credential"] }, null, null, "2026-01-01")).toBe(false);
    expect(await t({ delivery_modes: ["online", "blended"] }, null, null, "2026-01-01")).toBe(true);
    expect(await t({ delivery_modes: ["in_person"] }, null, null, "2026-01-01")).toBe(false);
    expect(await t({ credit_types: ["non_credit"] }, null, null, "2026-01-01")).toBe(false);
    expect(await t({ credit_types: ["credit_bearing"] }, null, null, "2026-01-01")).toBe(true);
    expect(await t({ languages: ["en"] }, null, null, "2026-01-01")).toBe(false);
    expect(await t({ languages: ["ar", "bilingual"] }, null, null, "2026-01-01")).toBe(true);
    expect(await t({ artifact_kinds: ["course_content"] }, null, null, "2026-01-01")).toBe(false);
    expect(await t({}, "2026-02-01", null, "2026-01-31")).toBe(false);
    expect(await t({}, "2026-02-01", null, "2026-02-01")).toBe(true);
    expect(await t({}, "2025-01-01", "2025-12-31", "2026-01-01")).toBe(false);
    expect(await t({}, "2025-01-01", "2025-12-31", "2025-12-31")).toBe(true);
    expect(
      await t(
        { categories: ["academic_program"], languages: ["ar"], delivery_modes: ["online"] },
        null,
        null,
        "2026-01-01",
        { ...ctx, delivery_mode: "" },
      ),
    ).toBe(false);
    const bad = await owner().rpc("save_compliance_rule", {
      _ruleset_id: rulesetId,
      _rule_id: null,
      _fields: {
        rule_code: `DEMO-BADAPP-${run}`,
        statement_en: "x",
        severity: "info",
        check_type: "manual",
        applicability: { delivery_modes: ["by_pigeon"] },
        effective_from: today(),
      },
      _evidence: [],
    });
    expect(bad.error?.message).toMatch(/Invalid delivery_modes/);
  });

  let blockerFinding = "";
  let firstRun = "";

  it("freezes rule, source and version evidence in an immutable run", async () => {
    const src = await activeSource({ official_identifier: `DEMO-FRZ-${run}` });
    const rb = await draftRule(`DEMO-BIL-${run}`, {}, ev(src));
    await ok(activate(rb));
    const rm = await draftRule(
      `DEMO-MAN-${run}`,
      { check_type: "manual", check_spec: null, severity: "blocker" },
      ev(src),
    );
    await ok(activate(rm));
    const rn = await draftRule(
      `DEMO-NA-${run}`,
      { severity: "warning", applicability: { categories: ["professional_program"] } },
      ev(src),
    );
    await ok(activate(rn));

    expect((await runOn(users.observer.client)).error).not.toBeNull();
    expect(
      (await owner().rpc("run_compliance", {
        _version_id: briefVersion,
        _ruleset_id: rulesetId,
        _context: { ...CTX, delivery_mode: "" },
      })).error?.message,
    ).toMatch(/delivery mode/i);
    firstRun = (await ok(runOn(owner()))) as string;
    const r = (await ok(
      owner().from("compliance_runs").select("*").eq("id", firstRun).single(),
    )) as any;
    expect(r.context).toMatchObject({ category: "academic_program", artifact_kind: "program_brief", ...CTX });
    const byCode = Object.fromEntries(r.snapshot.results.map((x: any) => [x.rule_code, x]));
    expect(byCode[`DEMO-BIL-${run}`].outcome).toBe("fail");
    expect(byCode[`DEMO-BIL-${run}`].observed).toBe("en");
    expect(byCode[`DEMO-MAN-${run}`].outcome).toBe("manual");
    expect(byCode[`DEMO-NA-${run}`].outcome).toBe("not_applicable");
    expect(byCode[`DEMO-BIL-${run}`].evidence[0]).toMatchObject({
      official_identifier: `DEMO-FRZ-${run}`,
      checksum: "a".repeat(64),
      status_on_run: "active",
      authorizes: true,
      locator: "§2",
    });
    expect(r.snapshot.target).toMatchObject({ version_id: briefVersion, kind: "program_brief" });

    const findings = (await ok(
      owner().from("compliance_findings").select("*").eq("run_id", firstRun).order("rule_code"),
    )) as any[];
    expect(findings.map((f) => f.rule_code).sort()).toEqual(
      [`DEMO-BIL-${run}`, `DEMO-MAN-${run}`].sort(),
    );
    const f = findings.find((x) => x.rule_code === `DEMO-BIL-${run}`);
    expect(f).toMatchObject({
      severity: "blocker",
      status: "open",
      target_version_id: briefVersion,
      target_path: "brief.fields.title",
      expected: "ar+en",
      observed: "en",
      rationale: "automated_check_failed",
    });
    expect(f.rule_snapshot.statement_en).toBe(`[DEMO] DEMO-BIL-${run} statement`);
    blockerFinding = f.id;

    // Runs and frozen finding fields are immutable even with full database access.
    expect(
      (await admin.from("compliance_runs").update({ summary: {} }).eq("id", firstRun)).error,
    ).not.toBeNull();
    expect(
      (await admin.from("compliance_findings").update({ observed: "x" }).eq("id", f.id)).error,
    ).not.toBeNull();
    // Open blockers block review of that exact version.
    const rq = await owner().rpc("request_review", { _version_id: briefVersion });
    expect(rq.error?.message).toMatch(/compliance blocker/i);
  });

  it("keeps a past run unchanged after the source and rule are revised", async () => {
    const before = (await ok(
      owner().from("compliance_runs").select("snapshot, summary").eq("id", firstRun).single(),
    )) as any;
    const beforeF = (await ok(
      owner().from("compliance_findings").select("rule_snapshot, evidence").eq("run_id", firstRun),
    )) as any[];
    const rule = (await ok(
      owner()
        .from("compliance_rules")
        .select("id")
        .eq("rule_code", `DEMO-BIL-${run}`)
        .eq("status", "active")
        .single(),
    )) as any;
    const src = before.snapshot.results[0].evidence[0].source_id as string;
    const nsrc = (await ok(
      owner().rpc("revise_compliance_source", {
        _source_id: src,
        _fields: { official_version: "2.0", title_en: "[DEMO] Revised policy" },
      }),
    )) as string;
    await ok(owner().rpc("transition_compliance_source", { _source_id: nsrc, _to: "under_review" }));
    await ok(
      reviewer().rpc("transition_compliance_source", {
        _source_id: nsrc,
        _to: "active",
        _comment: "v2",
      }),
    );
    const old = (await ok(
      owner().from("compliance_sources").select("status").eq("id", src).single(),
    )) as any;
    expect(old.status).toBe("superseded");
    const nrule = (await ok(owner().rpc("revise_compliance_rule", { _rule_id: rule.id }))) as string;
    await ok(
      owner().rpc("save_compliance_rule", {
        _ruleset_id: rulesetId,
        _rule_id: nrule,
        _fields: { statement_en: "[DEMO] changed statement" },
        _evidence: ev(nsrc),
      }),
    );
    await ok(activate(nrule));
    const after = (await ok(
      owner().from("compliance_runs").select("snapshot, summary").eq("id", firstRun).single(),
    )) as any;
    const afterF = (await ok(
      owner().from("compliance_findings").select("rule_snapshot, evidence").eq("run_id", firstRun),
    )) as any[];
    expect(after).toEqual(before);
    expect(afterF).toEqual(beforeF);
    // Active versions are frozen.
    expect(
      (await admin.from("compliance_rules").update({ statement_en: "x" }).eq("id", nrule)).error,
    ).not.toBeNull();
    expect(
      (await admin.from("compliance_sources").update({ title_en: "x" }).eq("id", nsrc)).error,
    ).not.toBeNull();
  });

  it("gives non-members zero rows and denies them and observers every mutation", async () => {
    const out = users.outsider.client;
    for (const t of [
      "compliance_sources",
      "compliance_sources_current",
      "compliance_rulesets",
      "compliance_rules",
      "compliance_rule_evidence",
      "compliance_runs",
      "compliance_findings",
      "compliance_finding_events",
    ]) {
      const { data, error } = await out.from(t).select("*").eq("project_id", projectId);
      expect(error, t).toBeNull();
      expect(data, t).toEqual([]);
    }
    for (const c of [out, users.observer.client]) {
      expect((await runOn(c)).error).not.toBeNull();
      expect(
        (await c.rpc("transition_finding", {
          _finding_id: blockerFinding,
          _to: "acknowledged",
        })).error,
      ).not.toBeNull();
      expect(
        (await c.rpc("save_compliance_source", {
          _project_id: projectId,
          _source_id: null,
          _fields: sourceFields({ official_identifier: "X" }),
        })).error,
      ).not.toBeNull();
      expect(
        (await c.rpc("assign_finding", {
          _finding_id: blockerFinding,
          _assignee: users.reviewer.id,
          _due: null,
        })).error,
      ).not.toBeNull();
      expect(
        (await c.rpc("comment_finding", { _finding_id: blockerFinding, _body: "hi" })).error,
      ).not.toBeNull();
    }
    for (const t of ["compliance_sources", "compliance_findings", "compliance_runs"]) {
      const ins = await owner().from(t).insert({ project_id: projectId });
      expect(ins.error, t).not.toBeNull();
    }
    expect(
      (await owner().rpc("record_source_checksum", {
        _source_id: crypto.randomUUID(),
        _computed: "b".repeat(64),
        _actor: users.owner.id,
      })).error,
    ).not.toBeNull();
  });

  it("closes blockers only by verified remediation or an approved exception with comment", async () => {
    await ok(
      owner().rpc("assign_finding", {
        _finding_id: blockerFinding,
        _assignee: users.reviewer.id,
        _due: shift(7),
      }),
    );
    await ok(owner().rpc("transition_finding", { _finding_id: blockerFinding, _to: "acknowledged" }));
    await ok(
      reviewer().rpc("transition_finding", {
        _finding_id: blockerFinding,
        _to: "remediation_in_progress",
        _comment: "Adding Arabic title",
      }),
    );
    await ok(owner().rpc("comment_finding", { _finding_id: blockerFinding, _body: "On it" }));
    const tryResolve = (c: SupabaseClient, extra: Record<string, unknown>) =>
      c.rpc("transition_finding", { _finding_id: blockerFinding, _to: "resolved", ...extra });
    expect((await tryResolve(owner(), { _comment: "done" })).error?.message).toMatch(
      /compliance reviewer/,
    );
    expect((await tryResolve(reviewer(), { _comment: "" })).error?.message).toMatch(/comment/);
    expect((await tryResolve(reviewer(), { _comment: "done" })).error?.message).toMatch(
      /later compliance run/,
    );
    expect(
      (await reviewer().rpc("transition_finding", {
        _finding_id: blockerFinding,
        _to: "false_positive",
        _comment: "nah",
      })).error?.message,
    ).toMatch(/false positive/);
    const stillFailing = (await ok(runOn(owner()))) as string;
    expect(
      (await tryResolve(reviewer(), { _comment: "done", _verified_run_id: stillFailing })).error
        ?.message,
    ).toMatch(/does not show this rule passing/);
    await ok(
      owner().rpc("update_program_brief", {
        _version_id: briefVersion,
        _fields: { title: { ar: "علم البيانات", en: "Data Science" } },
        _category: "academic_program",
        _change_summary: null,
      }),
    );
    const passing = (await ok(runOn(owner()))) as string;
    expect(
      (await tryResolve(reviewer(), { _comment: "Arabic title added", _verified_run_id: passing }))
        .error,
    ).toBeNull();
    const f = (await ok(
      owner().from("compliance_findings").select("*").eq("id", blockerFinding).single(),
    )) as any;
    expect(f).toMatchObject({ status: "resolved", verified_run_id: passing, closed_by: users.reviewer.id });
    expect(
      (await reviewer().rpc("transition_finding", {
        _finding_id: blockerFinding,
        _to: "acknowledged",
      })).error?.message,
    ).toMatch(/closed/);
    const events = (await ok(
      owner()
        .from("compliance_finding_events")
        .select("kind, to_status, actor_role")
        .eq("finding_id", blockerFinding)
        .order("created_at"),
    )) as any[];
    expect(events.map((e) => e.kind)).toEqual(["assign", "status", "status", "comment", "status"]);
    expect(events.at(-1)).toMatchObject({ to_status: "resolved", actor_role: "compliance_reviewer" });

    // Manual blockers: approved exception path.
    const manual = (await ok(
      owner()
        .from("compliance_findings")
        .select("id")
        .eq("run_id", passing)
        .eq("rule_code", `DEMO-MAN-${run}`)
        .single(),
    )) as any;
    expect(
      (await reviewer().rpc("transition_finding", {
        _finding_id: manual.id,
        _to: "accepted_exception",
        _comment: "approved",
      })).error?.message,
    ).toMatch(/exception and a comment/);
    const exc = (await ok(
      owner().rpc("create_exception", {
        _project_id: projectId,
        _artifact_id: briefArtifact,
        _title: "[DEMO] exception",
        _justification: "Test-only waiver",
      }),
    )) as string;
    await ok(
      reviewer().rpc("transition_finding", {
        _finding_id: manual.id,
        _to: "accepted_exception",
        _comment: "Waiver approved by committee",
        _exception_id: exc,
      }),
    );
    // Bypass attempt with full access still respects the blocker invariant.
    const other = (await ok(
      owner()
        .from("compliance_findings")
        .select("id")
        .eq("run_id", firstRun)
        .eq("rule_code", `DEMO-MAN-${run}`)
        .single(),
    )) as any;
    const bypass = await admin
      .from("compliance_findings")
      .update({ status: "false_positive" })
      .eq("id", other.id);
    expect(bypass.error?.message).toMatch(/false positive/);
  });

  it("records an audit event for every compliance mutation", async () => {
    const actions = new Set(
      ((await ok(
        owner().from("audit_events").select("action").eq("project_id", projectId),
      )) as any[]).map((a) => a.action),
    );
    for (const a of [
      "compliance.source.saved",
      "compliance.source.status",
      "compliance.source.revised",
      "compliance.ruleset.saved",
      "compliance.rule.saved",
      "compliance.rule.revised",
      "compliance.rule.status",
      "compliance.run.created",
      "compliance.finding.assigned",
      "compliance.finding.status",
      "compliance.finding.comment",
    ])
      expect(actions.has(a), a).toBe(true);
  });
});
