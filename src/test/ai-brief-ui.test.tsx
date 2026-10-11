import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const status = { enabled: true };
const draft = vi.fn();
const check = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/features/ai/ai.functions", () => ({
  getAiStatus: async () => ({ ...status, provider: "anthropic", model: "m", dailyLimit: 5 }),
  aiDraftBrief: (a: unknown) => draft(a),
  aiTranslateBrief: async () => ({ requestId: "r2", filled: [] }),
  aiCheckBriefConsistency: (a: unknown) => check(a),
}));

import { BriefAiTools } from "@/features/ai/BriefAi";
import { AiBadge } from "@/features/ai/AiParts";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";

const setup = (props: { dirty?: boolean } = {}, onChanged = vi.fn()) => {
  localStorage.setItem("kau-studio-locale", "en");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <BriefAiTools versionId="v1" dirty={props.dirty ?? false} onChanged={onChanged} />
        <AiBadge kind="translation" />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return onChanged;
};

describe("brief AI tools", () => {
  beforeEach(() => {
    localStorage.clear();
    status.enabled = true;
    draft.mockReset();
    check.mockReset();
  });

  it("explains that AI is off and offers no actions when disabled", async () => {
    status.enabled = false;
    setup();
    expect(await screen.findByText(/turned off on this platform/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Draft the empty fields" })).toBeNull();
  });

  it("requires an idea, drafts on the server, and reports what was filled", async () => {
    draft.mockResolvedValue({ requestId: "r1", filled: ["rationale", "risks"] });
    const onChanged = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Draft the empty fields" }));
    expect(screen.getByRole("alert")).toHaveTextContent("at least one full sentence");
    expect(draft).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Describe the program idea/), {
      target: { value: "  A professional diploma in applied data analytics.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft the empty fields" }));
    await waitFor(() =>
      expect(draft).toHaveBeenCalledWith({
        data: { versionId: "v1", idea: "A professional diploma in applied data analytics." },
      }),
    );
    expect(await screen.findByText(/Fields filled: Rationale، Risks/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByText("AI translation – not yet accepted")).toBeInTheDocument();
  });

  it("blocks server writes while the brief has unsaved edits", async () => {
    setup({ dirty: true });
    expect(await screen.findByRole("button", { name: "Draft the empty fields" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Translate missing languages" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check Arabic–English consistency" })).toBeEnabled();
  });

  it("shows consistency issues in both languages", async () => {
    check.mockResolvedValue({
      requestId: "r3",
      issues: [
        {
          field: "duration_credits",
          severity: "major",
          note_ar: "عدد الساعات مختلف",
          note_en: "Credit hours differ",
        },
      ],
    });
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "Check Arabic–English consistency" }),
    );
    expect(await screen.findByText("Credit hours differ")).toBeInTheDocument();
    expect(screen.getByText("عدد الساعات مختلف")).toBeInTheDocument();
    expect(screen.getByText(/Major/)).toBeInTheDocument();
  });
});
