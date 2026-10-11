import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const draft = vi.fn();
const translate = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => ({})), from: vi.fn() },
}));
vi.mock("@/features/ai/ai.functions", () => ({
  getAiStatus: async () => ({ enabled: true, provider: "anthropic", model: "m", dailyLimit: 5 }),
  aiDraftBlock: (a: unknown) => draft(a),
  aiTranslate: (a: unknown) => translate(a),
  aiLearnerCheck: async () => ({ requestId: "c", points: [] }),
  aiAltText: async () => ({ requestId: "a", alt_ar: "رسم", alt_en: "Chart" }),
}));

import { LessonAi } from "@/features/ai/LessonAi";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";
import type { Block, LessonNode } from "@/features/course/tree";

let blocks: Block[];
const start = (): LessonNode => ({
  key: "l1",
  title_ar: "",
  title_en: "Means",
  lang: "en",
  blocks: [
    { key: "b1", type: "rich_text", lang: "en", payload: { text: "The mean is the average." } },
  ],
});
function Harness() {
  const [lesson, setLesson] = useState(start);
  blocks = lesson.blocks;
  return (
    <LessonAi
      versionId="v1"
      lesson={lesson}
      outcomes={[{ code: "CLO1", label: "CLO1 Compute means" }]}
      media={[]}
      setBlocks={(fn) => setLesson((l) => ({ ...l, blocks: fn(l.blocks) }))}
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
};

describe("lesson AI assistant", () => {
  beforeEach(() => {
    draft.mockReset();
    translate.mockReset();
  });

  it("previews a drafted knowledge check and inserts it only on request", async () => {
    draft.mockResolvedValue({
      requestId: "r1",
      payload: {
        question: "What is the mean of 2 and 4?",
        choices: ["2", "3", "4"],
        correct_index: 1,
        feedback_correct: "Yes",
        feedback_incorrect: "Add and divide",
        outcome_code: "CLO1",
      },
    });
    setup();
    fireEvent.change(await screen.findByLabelText("Block to draft"), {
      target: { value: "knowledge_check" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft block" }));
    await waitFor(() =>
      expect(draft.mock.calls[0]![0].data).toMatchObject({
        versionId: "v1",
        blockType: "knowledge_check",
        lang: "en",
        outcome: { code: "CLO1" },
      }),
    );
    expect(await screen.findByText("What is the mean of 2 and 4?")).toBeInTheDocument();
    expect(blocks).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(blocks.map((b) => b.type)).toEqual(["rich_text", "knowledge_check"]);
  });

  it("adds reviewed translated copies right after their originals", async () => {
    translate.mockImplementation(
      async ({ data }: { data: { target: string; items: { id: string }[] } }) => ({
        requestId: "t1",
        items: data.items.map((i) => ({ id: i.id, text: "المتوسط هو معدل القيم." })),
      }),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Translate missing labels" }));
    await waitFor(() => expect(translate).toHaveBeenCalled());
    expect(translate.mock.calls[0]![0].data).toEqual({
      versionId: "v1",
      target: "ar",
      items: [{ id: "b1|text", text: "The mean is the average." }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Add translated copies" }));
    expect(blocks.map((b) => [b.lang, (b.payload as { text: string }).text])).toEqual([
      ["en", "The mean is the average."],
      ["ar", "المتوسط هو معدل القيم."],
    ]);
    expect(screen.getByText(/translated copies added/)).toBeInTheDocument();
  });
});
