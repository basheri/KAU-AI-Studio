import { describe, expect, it } from "vitest";
import { architectureForm } from "@/features/architecture/normalize";
import type { ArchElement } from "@/features/architecture/alignment";

const el = (key: string, extra: Partial<ArchElement> = {}): ArchElement => ({
  key,
  type: "program_outcome",
  parent_key: null,
  code: "PO1",
  label_ar: "مخرج",
  label_en: "Outcome",
  ...extra,
});

describe("architectureForm", () => {
  it("ignores keys, whitespace, mapping order and empty details", () => {
    const local = [
      el("n-1", { label_en: "Outcome " }),
      el("n-2", { type: "course", code: "C1", details: {} }),
    ];
    const server = [el("uuid-a"), el("uuid-b", { type: "course", code: "C1" })];
    expect(
      architectureForm(local, [
        { from: "n-1", to: "n-2" },
        { from: "n-1", to: "n-2" },
      ]),
    ).toBe(architectureForm(server, [{ from: "uuid-a", to: "uuid-b" }]));
  });

  it("detects real changes", () => {
    expect(architectureForm([el("a")], [])).not.toBe(
      architectureForm([el("a", { code: "PO2" })], []),
    );
  });
});
