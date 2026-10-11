import { describe, expect, it } from "vitest";
import { friendlyErrorKey, friendlyError } from "@/features/guidance/errors";
import { translate } from "@/features/i18n/locale";

describe("plain-language errors", () => {
  it("maps database refusals to bilingual messages", () => {
    const cases: [string, string][] = [
      ["You cannot decide a review you requested or a version you created", "err.selfDecision"],
      ["Your project role cannot decide at this stage", "err.roleCannotDecide"],
      ["Confirm the brief assumptions before architecture review", "err.assumptions"],
      ["Resolve alignment defects before review", "err.alignment"],
      ["Resolve open compliance blocker findings before approval", "err.blockers"],
      [
        "Review and accept the AI-drafted brief fields before review: title, risks",
        "err.aiPending",
      ],
      ["Verify every course reference before review", "err.references"],
      ["Version is locked (approved); propose a child version instead", "err.locked"],
      ["Observers cannot change review content", "err.observer"],
      ["You have reached today's AI limit; try again tomorrow", "err.aiLimit"],
    ];
    for (const [msg, key] of cases) expect(friendlyErrorKey({ message: msg }), msg).toBe(key);
  });

  it("falls back to the original message, then to a generic one", () => {
    const t = (k: string) => translate("ar", k as never);
    expect(friendlyError({ message: "Resolve alignment defects before review" }, t)).toBe(
      "عالج عيوب المواءمة أولًا.",
    );
    expect(friendlyError({ message: "Something unusual" }, t)).toBe("Something unusual");
    expect(friendlyError(null, t)).toBe(translate("ar", "rv.failed"));
  });
});
