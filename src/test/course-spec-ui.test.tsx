import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spec = vi.fn();
const translate = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => ({})), from: vi.fn() },
}));
vi.mock("@/features/ai/ai.functions", () => ({
  getAiStatus: async () => ({ enabled: true, provider: "anthropic", model: "m", dailyLimit: 5 }),
  aiCourseSpec: (a: unknown) => spec(a),
  aiTranslate: (a: unknown) => translate(a),
}));

import { CourseSpecPanel } from "@/features/architecture/CourseSpecPanel";
import {
  checkAlignment,
  type ArchElement,
  type ArchMapping,
} from "@/features/architecture/alignment";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";

let latest: { elements: ArchElement[]; mappings: ArchMapping[] };
const initial: ArchElement[] = [
  {
    key: "p1",
    type: "program_outcome",
    parent_key: null,
    code: "PLO1",
    label_ar: "",
    label_en: "Analyse data",
  },
  {
    key: "c1",
    type: "course",
    parent_key: null,
    code: "STAT101",
    label_ar: "الإحصاء",
    label_en: "Statistics",
    details: {
      spec: {
        description_en: "Intro to statistics",
        objectives: [{ ar: "", en: "Build intuition" }],
      },
    },
  },
];
function Harness() {
  const [elements, setElements] = useState(initial);
  const [mappings, setMappings] = useState<ArchMapping[]>([]);
  latest = { elements, mappings };
  return (
    <CourseSpecPanel
      versionId="v1"
      course={elements.find((e) => e.key === "c1")!}
      elements={elements}
      editable
      setElements={setElements}
      setMappings={setMappings}
    />
  );
}
const setup = () => {
  localStorage.setItem("kau-studio-locale", "en");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <Harness />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText(/Course specification/));
};

describe("course specification panel", () => {
  beforeEach(() => {
    spec.mockReset();
    translate.mockReset();
  });

  it("inserts AI learning outcomes and assessments as mapped architecture elements", async () => {
    spec.mockResolvedValueOnce({
      requestId: "r1",
      step: "outcomes",
      result: {
        outcomes: [
          {
            code: "CLO1",
            ar: "يطبق الاختبارات",
            en: "Apply tests",
            domain: "skills",
            program_outcomes: ["PLO1"],
          },
        ],
      },
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Draft learning outcomes" }));
    expect(await screen.findByText("Apply tests")).toBeInTheDocument();
    expect(latest.elements).toHaveLength(2); // nothing changes until a person inserts
    fireEvent.click(screen.getByRole("button", { name: "Insert all" }));
    const clo = latest.elements.find((e) => e.code === "CLO1")!;
    expect(clo).toMatchObject({ type: "course_outcome", parent_key: "c1" });
    expect(latest.mappings).toEqual([
      { from: "p1", to: clo.key },
      { from: "p1", to: "c1" },
    ]);

    spec.mockResolvedValueOnce({
      requestId: "r2",
      step: "assessments",
      result: {
        assessments: [{ code: "A1", ar: "اختبار", en: "Exam", weight: 100, outcomes: ["CLO1"] }],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft assessments" }));
    fireEvent.click(await screen.findByRole("button", { name: "Insert all" }));
    const a1 = latest.elements.find((e) => e.code === "A1")!;
    expect(a1).toMatchObject({ type: "assessment", details: { weight: 100 } });
    expect(latest.mappings).toContainEqual({ from: clo.key, to: a1.key });
    expect(checkAlignment(latest.elements, latest.mappings)).toEqual([]);
    expect(screen.getByText("Assessment weights total: 100%")).toBeInTheDocument();
  });

  it("adds suggested references as unverified and flags vague outcomes", async () => {
    spec.mockResolvedValueOnce({
      requestId: "r3",
      step: "references",
      result: {
        references: [
          { citation: "Freedman, Statistics (4th ed.)", why_ar: "مرجع", why_en: "Core text" },
        ],
      },
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Suggest references" }));
    expect(await screen.findByText(/unverified until a person checks/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Insert all" }));
    const course = latest.elements.find((e) => e.key === "c1")!;
    expect(course.details?.spec?.references).toEqual([
      { citation: "Freedman, Statistics (4th ed.)", verified: false },
    ]);
    expect(
      screen.getAllByText(/review is blocked until every reference is verified/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Verified against the library catalogue"));
    expect(
      latest.elements.find((e) => e.key === "c1")!.details?.spec?.references?.[0]?.verified,
    ).toBe(true);
  });

  it("translates only the missing language and never overwrites", async () => {
    translate.mockImplementation(
      async ({ data }: { data: { target: string; items: { id: string }[] } }) => ({
        requestId: `t-${data.target}`,
        items: data.items.map((i) => ({ id: i.id, text: `AR:${i.id}` })),
      }),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Translate missing labels" }));
    await waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    expect(translate.mock.calls[0]![0].data.items).toEqual([
      { id: "description", text: "Intro to statistics" },
      { id: "objective:0", text: "Build intuition" },
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Insert all" }));
    const s = latest.elements.find((e) => e.key === "c1")!.details!.spec!;
    expect(s.description_ar).toBe("AR:description");
    expect(s.description_en).toBe("Intro to statistics");
    expect(s.objectives).toEqual([{ ar: "AR:objective:0", en: "Build intuition" }]);
  });
});
