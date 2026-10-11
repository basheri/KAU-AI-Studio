import { describe, expect, it } from "vitest";
import { diffLines } from "@/features/reviews/diff";
import {
  canDecideException,
  decisionProblem,
  editOutcome,
  selfDecisionBlocked,
  ARTIFACT_STATES,
} from "@/features/reviews/rules";

describe("artifact states", () => {
  it("are exactly the six governed states", () => {
    expect(ARTIFACT_STATES).toEqual([
      "draft",
      "in_review",
      "changes_requested",
      "approved",
      "superseded",
      "archived",
    ]);
  });
});

describe("edit outcome (mirrors database lock)", () => {
  it("edits drafts in place", () => expect(editOutcome("draft")).toBe("in_place"));
  it("proposes a child for approved, in_review and changes_requested", () => {
    expect(editOutcome("approved")).toBe("child");
    expect(editOutcome("in_review")).toBe("child");
    expect(editOutcome("changes_requested")).toBe("child");
  });
  it("refuses superseded and archived", () => {
    expect(editOutcome("superseded")).toBe("blocked");
    expect(editOutcome("archived")).toBe("blocked");
  });
});

describe("decision validation", () => {
  it("approve needs nothing", () => expect(decisionProblem("approve", "", null)).toBeNull());
  it("request changes needs a comment", () => {
    expect(decisionProblem("request_changes", "   ", null)).toBe("comment");
    expect(decisionProblem("request_changes", "Fix CLOs", null)).toBeNull();
  });
  it("exception approval needs a comment and an exception", () => {
    expect(decisionProblem("approve_exception", "", "e1")).toBe("comment");
    expect(decisionProblem("approve_exception", "ok", null)).toBe("exception");
    expect(decisionProblem("approve_exception", "ok", "e1")).toBeNull();
  });
});

describe("line diff", () => {
  it("marks added, removed and unchanged lines", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "B" },
      { type: "same", text: "c" },
      { type: "added", text: "d" },
    ]);
  });
  it("handles identical text", () => {
    expect(diffLines("x", "x")).toEqual([{ type: "same", text: "x" }]);
  });
});

describe("segregation of duties (mirrors migration 0008)", () => {
  it("blocks the requester and the version creator except at the export freeze", () => {
    const base = { userId: "u1", requestedBy: "u2", versionCreatedBy: "u3" };
    expect(selfDecisionBlocked({ ...base, stageKey: "program_brief_confirmed" })).toBe(false);
    expect(selfDecisionBlocked({ ...base, requestedBy: "u1", stageKey: "compliance_review" })).toBe(
      true,
    );
    expect(
      selfDecisionBlocked({ ...base, versionCreatedBy: "u1", stageKey: "learner_content_review" }),
    ).toBe(true);
    expect(selfDecisionBlocked({ ...base, requestedBy: "u1", stageKey: "export_frozen" })).toBe(
      false,
    );
  });

  it("lets only another compliance reviewer or administrator decide a pending exception", () => {
    const ex = { status: "pending" as const, created_by: "u2" };
    expect(canDecideException(ex, "compliance_reviewer", "u1")).toBe(true);
    expect(canDecideException(ex, "system_administrator", "u1")).toBe(true);
    expect(canDecideException(ex, "program_owner", "u1")).toBe(false);
    expect(canDecideException(ex, "compliance_reviewer", "u2")).toBe(false);
    expect(canDecideException({ ...ex, status: "approved" }, "compliance_reviewer", "u1")).toBe(
      false,
    );
  });
});
