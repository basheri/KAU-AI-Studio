import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const rpcCalls: [string, unknown][] = [];
vi.mock("@/integrations/supabase/client", () => {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) b[m] = () => b;
  b["then"] = (ok: (v: unknown) => unknown) =>
    Promise.resolve({
      data: [{ id: "rs1", code: "NCAAA", title_en: "", title_ar: "", revision: 0 }],
      error: null,
    }).then(ok);
  return {
    supabase: {
      from: () => b,
      rpc: async (name: string, args: unknown) => (
        rpcCalls.push([name, args]),
        { data: "id", error: null }
      ),
    },
  };
});
vi.mock("@/features/ai/ai.functions", () => ({
  getAiStatus: async () => ({ enabled: true, provider: "anthropic", model: "m", dailyLimit: 5 }),
  aiDraftComplianceRules: async () => ({
    requestId: "r1",
    rules: [
      {
        rule_code: "DOC-R1",
        statement_ar: "يجب توثيق مخرجات التعلم",
        statement_en: "Learning outcomes must be documented",
        remediation_ar: "وثّق المخرجات",
        remediation_en: "Document the outcomes",
        severity: "blocker",
        clause: "Article 4.2",
        page: 7,
      },
    ],
  }),
  aiSummarizeChanges: async () => ({
    requestId: "s1",
    summary_ar: "ملخص",
    summary_en: "Outcomes were reworded.",
    points: [{ ar: "أ", en: "PLO2 added" }],
  }),
  aiSummarizeThread: async () => ({
    requestId: "s2",
    summary_ar: "",
    summary_en: "Reviewers agree.",
    points: [],
  }),
}));

import { RuleDraftAi } from "@/features/ai/ComplianceAi";
import { ReviewAi } from "@/features/ai/ReviewAi";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";

const wrap = (ui: React.ReactNode) => {
  localStorage.setItem("kau-studio-locale", "en");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>{ui}</LocaleProvider>
    </QueryClientProvider>,
  );
};

describe("phase 4 AI", () => {
  it("saves a drafted rule only as a draft that cites the clause and page", async () => {
    wrap(
      <RuleDraftAi
        project={{ id: "p1", title: "P", description: null, created_at: "", role: "program_owner" }}
        source={{ id: "s1" } as never}
      />,
    );
    fireEvent.click(screen.getAllByText("Draft rules from this source")[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Draft rules from this source" }));
    expect(await screen.findByText("Learning outcomes must be documented")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as draft rule" }));
    await waitFor(() => expect(rpcCalls.find(([n]) => n === "save_compliance_rule")).toBeTruthy());
    expect(rpcCalls.find(([n]) => n === "save_compliance_rule")![1]).toMatchObject({
      _ruleset_id: "rs1",
      _rule_id: null,
      _fields: { rule_code: "DOC-R1", severity: "blocker", check_type: "manual", check_spec: null },
      _evidence: [{ source_id: "s1", locator: "Article 4.2", page: "7", section: "" }],
    });
    expect(await screen.findByText(/A compliance reviewer must activate it/)).toBeInTheDocument();
    expect(rpcCalls.some(([n]) => n === "set_compliance_rule_status")).toBe(false);
  });

  it("summarises changes and discussion as reading aids", async () => {
    wrap(<ReviewAi versionId="v2" parentVersionId="v1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Summarise changes from the previous version" }),
    );
    expect(await screen.findByText("Outcomes were reworded.")).toBeInTheDocument();
    expect(screen.getByText("PLO2 added")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Summarise the discussion" }));
    expect(await screen.findByText("Reviewers agree.")).toBeInTheDocument();
    expect(screen.getAllByText(/check it against the versions and comments/)).toHaveLength(2);
  });

  it("offers no change summary for a first version", async () => {
    wrap(<ReviewAi versionId="v1" parentVersionId={null} />);
    expect(
      await screen.findByRole("button", { name: "Summarise the discussion" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Summarise changes/ })).toBeNull();
  });
});
