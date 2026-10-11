import { describe, expect, it } from "vitest";
import { diffLines } from "@/features/reviews/diff";
import { decisionProblem, editOutcome, ARTIFACT_STATES } from "@/features/reviews/rules";

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
