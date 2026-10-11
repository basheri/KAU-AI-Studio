import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { CourseEditor } from "@/features/course/CourseEditor";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";
import type { CourseTree } from "@/features/course/tree";

const initial = (): CourseTree => ({
  title_ar: "الإحصاء",
  title_en: "Statistics",
  lang: "en",
  modules: [
    {
      key: "m1",
      title_ar: "",
      title_en: "Module 1",
      lang: "en",
      lessons: [
        {
          key: "l1",
          title_ar: "",
          title_en: "Lesson 1",
          lang: "en",
          blocks: [
            {
              key: "b1",
              type: "rich_text",
              lang: "en",
              payload: { text: "### Intro\nHello <b>x</b>" },
            },
            {
              key: "b2",
              type: "glossary",
              lang: "ar",
              payload: { terms: [{ term: "متوسط", definition: "مجموع/عدد" }] },
            },
          ],
        },
        { key: "l2", title_ar: "الدرس ٢", title_en: "", lang: "ar", blocks: [] },
      ],
    },
  ],
});

let latest: CourseTree;
function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [tree, setTree] = useState(initial);
  latest = tree;
  return (
    <CourseEditor
      tree={tree}
      onChange={setTree}
      readOnly={readOnly}
      media={[]}
      outcomes={[{ code: "CLO1", label: "CLO1 Apply" }]}
    />
  );
}
const setup = (readOnly = false) =>
  render(
    <LocaleProvider>
      <Harness readOnly={readOnly} />
    </LocaleProvider>,
  );

describe("course studio UI", () => {
  beforeEach(() => localStorage.clear());

  it("renders Arabic RTL authoring by default", async () => {
    setup();
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(screen.getByRole("button", { name: "التأليف" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "كتل المحتوى" })).toBeInTheDocument();
  });

  it("English LTR: adds, reorders by keyboard, duplicates, and deletes with confirmation", async () => {
    localStorage.setItem("kau-studio-locale", "en");
    setup();
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    fireEvent.change(screen.getByLabelText("Block type"), { target: { value: "knowledge_check" } });
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    expect(latest.modules[0]!.lessons[0]!.blocks.map((b) => b.type)).toEqual([
      "rich_text",
      "glossary",
      "knowledge_check",
    ]);

    const up = screen.getByRole("button", { name: "Move up: Knowledge check 3" });
    up.focus();
    fireEvent.keyDown(up, { key: "Enter" });
    fireEvent.click(up);
    expect(latest.modules[0]!.lessons[0]!.blocks.map((b) => b.type)).toEqual([
      "rich_text",
      "knowledge_check",
      "glossary",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate: Glossary 3" }));
    expect(latest.modules[0]!.lessons[0]!.blocks).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Delete: Glossary 4" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(latest.modules[0]!.lessons[0]!.blocks).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Delete: Glossary 4" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(latest.modules[0]!.lessons[0]!.blocks).toHaveLength(3));
  });

  it("learner preview renders per-block language direction and never injects HTML", async () => {
    localStorage.setItem("kau-studio-locale", "en");
    setup();
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    fireEvent.click(screen.getByRole("button", { name: "Learner preview" }));
    const preview = screen.getByTestId("learner-preview");
    expect(
      within(preview).getByRole("heading", { level: 2, name: "Lesson 1" }),
    ).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { level: 3, name: "Intro" })).toBeInTheDocument();
    expect(preview.querySelector("b")).toBeNull();
    expect(preview.querySelector('[data-block-type="glossary"]')).toHaveAttribute("dir", "rtl");
    expect(preview.querySelector('[data-block-type="rich_text"]')).toHaveAttribute("dir", "ltr");
    expect(within(preview).getByRole("button", { name: "Previous lesson" })).toBeDisabled();
    fireEvent.click(within(preview).getByRole("button", { name: "Next lesson" }));
    const article = within(preview)
      .getByRole("heading", { level: 2, name: "الدرس ٢" })
      .closest("article")!;
    expect(article).toHaveAttribute("dir", "rtl");
    expect(within(preview).getByRole("button", { name: "Next lesson" })).toBeDisabled();
  });

  it("shows live validation and is read-only for locked versions", async () => {
    localStorage.setItem("kau-studio-locale", "en");
    setup(true);
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    expect(screen.queryByRole("button", { name: "Add block" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete:/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Content validation" })).toBeInTheDocument();
  });
});
