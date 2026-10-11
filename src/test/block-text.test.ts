import { describe, expect, it } from "vitest";
import { applyStrings, blockStrings, lessonText } from "@/features/ai/blockText";
import { parsePayload } from "@/features/course/blocks";

const kc = {
  question: "What is a mean?",
  choices: ["Sum/n", "Middle value"],
  correct_index: 0,
  feedback_correct: "Right",
  feedback_incorrect: "No",
  outcome_code: "CLO1",
};

describe("translatable block text", () => {
  it("collects text but never codes, links, media or numbers", () => {
    expect(blockStrings("knowledge_check", kc).map((s) => s.path)).toEqual([
      "question",
      "choices.0",
      "choices.1",
      "feedback_correct",
      "feedback_incorrect",
    ]);
    expect(
      blockStrings("image", { media_id: "m", alt: "A chart", caption: "", decorative: false }),
    ).toEqual([{ path: "alt", text: "A chart" }]);
    expect(blockStrings("embed", { url: "https://www.youtube.com/x", title: "Intro" })).toEqual([
      { path: "title", text: "Intro" },
    ]);
    expect(
      blockStrings("rubric", {
        criteria: [
          { name: "Clarity", levels: [{ label: "Good", points: 3, description: "Clear" }] },
        ],
      }).map((s) => s.path),
    ).toEqual(["criteria.0.name", "criteria.0.levels.0.label", "criteria.0.levels.0.description"]);
  });

  it("applies translations without changing structure, so the payload stays valid", () => {
    const out = applyStrings(kc, { question: "ما المتوسط؟", "choices.1": "القيمة الوسطى" });
    expect(out).toEqual({ ...kc, question: "ما المتوسط؟", choices: ["Sum/n", "القيمة الوسطى"] });
    expect(kc.question).toBe("What is a mean?");
    expect(parsePayload("knowledge_check", out).ok).toBe(true);
  });

  it("renders a lesson as plain text for the clarity check", () => {
    const text = lessonText({
      key: "l",
      title_ar: "",
      title_en: "Means",
      lang: "en",
      blocks: [
        {
          key: "b1",
          type: "rich_text",
          lang: "en",
          payload: { text: "### Intro\nThe mean is..." },
        },
        { key: "b2", type: "knowledge_check", lang: "en", payload: kc },
      ],
    });
    expect(text).toContain("Means");
    expect(text).toContain("The mean is...");
    expect(text).toContain("What is a mean?");
    expect(text).not.toContain("CLO1");
  });
});
