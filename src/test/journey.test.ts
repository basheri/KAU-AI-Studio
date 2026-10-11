import { describe, expect, it } from "vitest";
import {
  journeySteps,
  nextStep,
  workLink,
  type Journey,
  readinessFix,
} from "@/features/guidance/journey";
import { parseFocus } from "@/features/navigation/focus";

const base: Journey = {
  brief: {
    artifact_id: "b",
    version_id: "bv",
    version: 1,
    state: "draft",
    assumptions_confirmed: true,
    ai_pending: 0,
  },
  architecture: {
    artifact_id: "a",
    version_id: "av",
    version: 1,
    state: "draft",
    elements: 5,
    defects: 0,
    unverified_references: 0,
    courses: 2,
    courses_specified: 2,
  },
  courses: { with_content: 2, critical_defects: 0, in_review_or_approved: 0 },
  compliance: { active_rules: 3, runs: 1, open_blockers: 0, open_findings: 0 },
  reviews: { in_review: 0, changes_requested: 0, approved: 0 },
};
const P = "11111111-1111-1111-1111-111111111111";

describe("project journey", () => {
  it("starts with creating a brief", () => {
    const j: Journey = {
      ...base,
      brief: null,
      architecture: null,
      courses: { with_content: 0, critical_defects: 0, in_review_or_approved: 0 },
      compliance: { active_rules: 0, runs: 0, open_blockers: 0, open_findings: 0 },
    };
    expect(nextStep(j, P)).toMatchObject({
      key: "jr.next.createBrief",
      to: "/program-architect",
      search: { project: P },
    });
    expect(journeySteps(j).map((s) => s.status)).toEqual([
      "current",
      "todo",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
  });

  it("asks for AI acceptance before confirming assumptions, and links to the brief", () => {
    const j = { ...base, brief: { ...base.brief!, ai_pending: 3, assumptions_confirmed: false } };
    expect(nextStep(j, P)).toMatchObject({
      key: "jr.next.acceptAi",
      count: 3,
      search: { project: P, artifact: "b" },
    });
    expect(journeySteps(j)[0]).toMatchObject({ id: "brief", status: "attention" });
  });

  it("walks the build order: alignment, specification, references, content, compliance", () => {
    const steps: [Partial<Journey>, string][] = [
      [{ architecture: { ...base.architecture!, defects: 2 } }, "jr.next.fixAlignment"],
      [{ architecture: { ...base.architecture!, courses_specified: 1 } }, "jr.next.specifyCourses"],
      [
        { architecture: { ...base.architecture!, unverified_references: 4 } },
        "jr.next.verifyReferences",
      ],
      [{ courses: { ...base.courses, with_content: 1 } }, "jr.next.createContent"],
      [{ courses: { ...base.courses, critical_defects: 2 } }, "jr.next.fixContent"],
      [{ compliance: { ...base.compliance, active_rules: 0 } }, "jr.next.setupCompliance"],
      [{ compliance: { ...base.compliance, runs: 0 } }, "jr.next.runCompliance"],
      [{ compliance: { ...base.compliance, open_blockers: 1 } }, "jr.next.resolveBlockers"],
    ];
    for (const [patch, key] of steps) expect(nextStep({ ...base, ...patch }, P).key, key).toBe(key);
  });

  it("then moves to review, returned work and completion", () => {
    expect(nextStep(base, P)).toMatchObject({ key: "jr.next.requestReview", to: "/reviews" });
    expect(nextStep({ ...base, reviews: { ...base.reviews, changes_requested: 1 } }, P).key).toBe(
      "jr.next.reviseReturned",
    );
    const waiting = {
      ...base,
      brief: { ...base.brief!, state: "in_review" },
      architecture: { ...base.architecture!, state: "in_review" },
      reviews: { ...base.reviews, in_review: 2 },
    };
    expect(nextStep(waiting, P).key).toBe("jr.next.awaitReview");
    const done = {
      ...base,
      brief: { ...base.brief!, state: "approved" },
      architecture: { ...base.architecture!, state: "approved" },
      reviews: { ...base.reviews, approved: 2 },
    };
    expect(nextStep(done, P).key).toBe("jr.next.done");
    expect(journeySteps(done).every((s) => s.status === "done")).toBe(true);
  });

  it("links each work item to the exact place", () => {
    const item = (kind: string) => ({ kind, project_id: P, ref_id: "r", artifact_id: "a" });
    expect(workLink(item("decide_review"))).toEqual({
      to: "/reviews",
      search: { project: P, artifact: "a" },
    });
    expect(workLink(item("finding"))).toEqual({
      to: "/compliance",
      search: { project: P, tab: "findings", item: "r" },
    });
    expect(workLink(item("activate_rule"))).toEqual({
      to: "/compliance",
      search: { project: P, tab: "rules" },
    });
    expect(workLink(item("accept_ai"))).toEqual({
      to: "/program-architect",
      search: { project: P, artifact: "a" },
    });
  });

  it("accepts only well-formed focus values from the address bar", () => {
    expect(parseFocus({ project: P, tab: "findings", item: "x" })).toEqual({
      project: P,
      tab: "findings",
    });
    expect(parseFocus({ project: "drop table", tab: "evil" })).toEqual({});
  });
});

describe("readinessFix", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const A = "22222222-2222-4222-8222-222222222222";
  it("sends each failed check to the screen that fixes it", () => {
    expect(readinessFix("aligned", P, A)).toEqual({
      to: "/program-architect",
      search: { project: P, artifact: A },
    });
    expect(readinessFix("no_critical_defects", P, A)?.to).toBe("/course-studio");
    expect(readinessFix("no_compliance_blockers", P, A)?.search.tab).toBe("findings");
    expect(readinessFix("independent_approver", P, A)).toBeNull();
    expect(readinessFix("is_draft", P, A)).toBeNull();
  });
});
