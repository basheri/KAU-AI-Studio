import { describe, expect, it } from "vitest";
import {
  findingActions,
  ruleApplies,
  sourceAuthorizes,
  sourceStatusOn,
  validateRuleDraft,
  validateSourceDraft,
} from "@/features/compliance/rules";

describe("compliance rules mirror", () => {
  it("computes source status and authorization by date (mirrors source_status_on)", () => {
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
      expect(sourceStatusOn(s as never, eff, exp, on)).toBe(status);
      expect(sourceAuthorizes(s as never, eff, exp, on)).toBe(auth);
    }
  });

  it("evaluates applicability across dimensions and dates (mirrors rule_applies)", () => {
    const ctx = {
      category: "academic_program",
      delivery_mode: "online",
      credit_type: "credit_bearing",
      language: "ar",
      artifact_kind: "program_brief",
    };
    const t = (app: object, from: string | null, to: string | null, on: string, c = ctx) =>
      ruleApplies(app, from, to, c, on);
    expect(t({}, null, null, "2026-01-01")).toBe(true);
    expect(t({ categories: ["academic_program"] }, null, null, "2026-01-01")).toBe(true);
    expect(t({ categories: ["micro_credential"] }, null, null, "2026-01-01")).toBe(false);
    expect(t({ delivery_modes: ["online", "blended"] }, null, null, "2026-01-01")).toBe(true);
    expect(t({ delivery_modes: ["in_person"] }, null, null, "2026-01-01")).toBe(false);
    expect(t({ credit_types: ["non_credit"] }, null, null, "2026-01-01")).toBe(false);
    expect(t({ languages: ["ar", "bilingual"] }, null, null, "2026-01-01")).toBe(true);
    expect(t({ artifact_kinds: ["course_content"] }, null, null, "2026-01-01")).toBe(false);
    expect(t({}, "2026-02-01", null, "2026-01-31")).toBe(false);
    expect(t({}, "2026-02-01", null, "2026-02-01")).toBe(true);
    expect(t({}, "2025-01-01", "2025-12-31", "2026-01-01")).toBe(false);
    expect(t({}, "2025-01-01", "2025-12-31", "2025-12-31")).toBe(true);
    expect(
      t({ delivery_modes: ["online"] }, null, null, "2026-01-01", { ...ctx, delivery_mode: "" }),
    ).toBe(false);
  });

  it("gives source and rule form hints matching the database messages", () => {
    expect(validateSourceDraft({})).toEqual([
      "title",
      "issuing_authority",
      "document_type",
      "official_identifier",
      "location",
    ]);
    expect(
      validateSourceDraft({
        title_en: "Policy",
        issuing_authority: "NCAAA",
        document_type: "standard",
        official_identifier: "X-1",
        source_url: "http://insecure.example",
        checksum: "abc",
        effective_on: "2026-02-01",
        expires_on: "2026-01-01",
      }),
    ).toEqual(["source_url", "checksum", "dates"]);
    expect(
      validateRuleDraft({ rule_code: "bad code", severity: "blocker", check_type: "automated" }),
    ).toEqual(["rule_code", "statement", "remediation", "check_spec"]);
    expect(
      validateRuleDraft({
        rule_code: "R-1",
        statement_en: "x",
        severity: "warning",
        check_type: "manual",
      }),
    ).toEqual([]);
  });

  it("offers only the finding transitions the database allows for the role", () => {
    const open = { status: "open", severity: "blocker", outcome: "fail", assignee_id: null };
    expect(findingActions(open, "observer", "u1")).toEqual([]);
    expect(findingActions(open, "instructional_designer", "u1")).toEqual([]);
    expect(findingActions({ ...open, assignee_id: "u1" }, "instructional_designer", "u1")).toEqual([
      "acknowledged",
      "remediation_in_progress",
    ]);
    expect(findingActions(open, "program_owner", "u1")).toEqual([
      "acknowledged",
      "remediation_in_progress",
    ]);
    // Blockers never offer false positive; reviewers can resolve or accept an exception.
    expect(findingActions(open, "compliance_reviewer", "u1")).toEqual([
      "acknowledged",
      "remediation_in_progress",
      "resolved",
      "accepted_exception",
    ]);
    expect(
      findingActions(
        { ...open, severity: "warning", status: "acknowledged" },
        "compliance_reviewer",
        "u1",
      ),
    ).toEqual(["remediation_in_progress", "resolved", "accepted_exception", "false_positive"]);
    expect(findingActions({ ...open, status: "resolved" }, "compliance_reviewer", "u1")).toEqual(
      [],
    );
  });
});
