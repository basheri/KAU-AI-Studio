import { describe, expect, it } from "vitest";
import { outcomeIssues, specProblem, assessmentWeightTotal } from "@/features/architecture/spec";

describe("course specification (mirrors public.course_spec_problem)", () => {
  it("accepts a complete specification", () => {
    expect(
      specProblem({
        description_ar: "وصف",
        description_en: "Intro",
        credit_hours: 3,
        objectives: [{ ar: "", en: "Build intuition" }],
        topics: [{ ar: "", en: "Descriptive statistics", weeks: 2, outcomes: ["CLO1"] }],
        references: [{ citation: "Freedman, Statistics", verified: false }],
      }),
    ).toBeNull();
    expect(specProblem(undefined)).toBeNull();
  });

  it("rejects what the database rejects", () => {
    expect(specProblem({ credit_hours: 99 } as never)).toMatch(/Credit hours/);
    expect(specProblem({ html: "<b>" } as never)).toMatch(
      /Unknown course specification field html/,
    );
    expect(specProblem({ references: [{ citation: " ", verified: true }] } as never)).toMatch(
      /Invalid reference/,
    );
    expect(specProblem({ references: [{ citation: "x" }] } as never)).toMatch(/Invalid reference/);
    expect(specProblem({ topics: [{ en: "t", weeks: 40 }] } as never)).toMatch(/Invalid topic/);
    expect(specProblem({ description_en: "x".repeat(5001) })).toMatch(/Invalid description_en/);
    expect(
      specProblem({ objectives: Array.from({ length: 61 }, () => ({ en: "o" })) } as never),
    ).toMatch(/Invalid objectives/);
  });

  it("totals assessment weights", () => {
    expect(
      assessmentWeightTotal([
        { details: { weight: 40 } },
        { details: { weight: 60 } },
        { details: {} },
      ] as never),
    ).toBe(100);
  });
});

describe("outcome wording checks", () => {
  it("flags unmeasurable verbs in English and Arabic", () => {
    expect(outcomeIssues("Understand regression", "")).toEqual([
      { kind: "vague", word: "understand" },
    ]);
    expect(outcomeIssues("", "أن يفهم الطالب الانحدار")).toEqual([{ kind: "vague", word: "يفهم" }]);
    expect(outcomeIssues("Know and appreciate data ethics", "")[0]).toEqual({
      kind: "vague",
      word: "know",
    });
  });
  it("flags compound outcomes and very short ones", () => {
    expect(outcomeIssues("Apply hypothesis tests and evaluate regression models", "")).toEqual([
      { kind: "multi" },
    ]);
    expect(outcomeIssues("Apply", "")).toEqual([{ kind: "short" }]);
  });
  it("passes clear, single, measurable outcomes", () => {
    expect(
      outcomeIssues(
        "Apply hypothesis tests to real survey data",
        "يطبّق اختبارات الفرضيات على بيانات حقيقية",
      ),
    ).toEqual([]);
  });
});
