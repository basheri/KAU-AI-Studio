import { describe, expect, it } from "vitest";
import { briefAiPending, fieldAiBadges, unverifiedReferenceCount } from "@/features/ai/gate";

const f = (o: object) => ({ ar: "", en: "", provenance: null, source_ref: null, ...o });

describe("AI review gate (mirrors public.brief_ai_pending and gate_ai_review)", () => {
  it("lists fields with unaccepted AI drafts or translations in field order", () => {
    const fields = {
      title: f({ en: "T", ar: "ع", provenance: "manual", ar_prov: "AI_translation" }),
      rationale: f({ en: "R", provenance: "AI_draft" }),
      risks: f({ en: "x", provenance: "AI_accepted", en_prov: "AI_translation_accepted" }),
      stakeholders: f({ en: "s", provenance: "manual" }),
    };
    expect(briefAiPending(fields as never)).toEqual(["title", "rationale"]);
  });

  it("derives badges per field and per language", () => {
    expect(fieldAiBadges(f({ provenance: "AI_draft" }) as never)).toEqual({
      field: "draft",
      ar: null,
      en: null,
    });
    expect(
      fieldAiBadges(f({ provenance: "AI_accepted", ar_prov: "AI_translation" }) as never),
    ).toEqual({
      field: "accepted",
      ar: "translation",
      en: null,
    });
    expect(
      fieldAiBadges(f({ provenance: "manual", en_prov: "AI_translation_accepted" }) as never),
    ).toEqual({
      field: null,
      ar: null,
      en: "translationAccepted",
    });
  });

  it("counts unverified course references", () => {
    const els = [
      {
        type: "course",
        details: {
          spec: {
            references: [
              { citation: "a", verified: false },
              { citation: "b", verified: true },
            ],
          },
        },
      },
      { type: "course", details: {} },
      {
        type: "program_outcome",
        details: { spec: { references: [{ citation: "c", verified: false }] } },
      },
    ];
    expect(unverifiedReferenceCount(els as never)).toBe(1);
  });
});
