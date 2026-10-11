import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tables: Record<string, unknown[]> = {};
const rpcCalls: [string, unknown][] = [];
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const result = () => Promise.resolve({ data: tables[table] ?? [], error: null });
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "in"]) b[m] = () => b;
    b["then"] = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      result().then(ok, bad);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string, args: unknown) => {
        rpcCalls.push([name, args]);
        if (name === "list_project_members") return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: "new-id", error: null });
      },
    },
  };
});

import { ProjectCompliance } from "@/features/compliance/ComplianceLibrary";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";
import type { ProjectRole } from "@/features/projects/api";

const project = (role: ProjectRole) => ({
  id: "p1",
  title: "Demo",
  description: null,
  created_at: "2026-01-01",
  role,
});
const setup = (role: ProjectRole, locale: "ar" | "en" = "en") => {
  localStorage.setItem("kau-studio-locale", locale);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ProjectCompliance project={project(role)} userId="u-rev" />
      </LocaleProvider>
    </QueryClientProvider>,
  );
};

const source = {
  id: "s1",
  project_id: "p1",
  lineage_id: "l1",
  version_number: 1,
  title_ar: "",
  title_en: "[DEMO] Assessment policy",
  issuing_authority: "Demo authority",
  document_type: "policy",
  official_identifier: "DEMO-POL-1",
  official_version: "1.0",
  status: "under_review",
  effective_status: "under_review",
  authorizes_rules: false,
  effective_on: "2026-01-01",
  expires_on: null,
  decision_comment: null,
};
const finding = {
  id: "f1",
  project_id: "p1",
  run_id: "r1",
  rule_id: "ru1",
  rule_code: "DEMO-BIL",
  rule_version: 1,
  target_artifact_id: "a1",
  target_version_id: "v1",
  target_path: "brief.fields.title",
  severity: "blocker",
  check_type: "automated",
  outcome: "fail",
  rationale: "automated_check_failed",
  observed: "en",
  expected: "ar+en",
  evidence: [{ official_identifier: "DEMO-POL-1", title_en: "[DEMO] Policy", locator: "§2" }],
  rule_snapshot: { statement_en: "Title must be bilingual", remediation_en: "Add Arabic title" },
  status: "open",
  assignee_id: null,
  due_on: null,
  created_at: "2026-01-02T00:00:00Z",
};

describe("compliance library UI", () => {
  beforeEach(() => {
    localStorage.clear();
    rpcCalls.length = 0;
    for (const k of Object.keys(tables)) delete tables[k];
  });

  it("renders Arabic RTL sections by default", async () => {
    setup("program_owner", "ar");
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(screen.getByRole("button", { name: "المصادر" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "الملاحظات" })).toBeInTheDocument();
  });

  it("observers can read sources but get no editing or decision controls", async () => {
    tables["compliance_sources_current"] = [source];
    setup("observer");
    expect(await screen.findByText("[DEMO] Assessment policy")).toBeInTheDocument();
    expect(screen.getByText("Under review")).toBeInTheDocument();
    expect(screen.getByText(/cannot change them|but not change them/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a source" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("validates a new source before calling the database, then saves through the RPC", async () => {
    setup("program_owner");
    fireEvent.click(await screen.findByRole("button", { name: "Add a source" }));
    fireEvent.change(screen.getByLabelText("Source address (https)"), {
      target: { value: "http://insecure.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft source" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Enter a title in Arabic or English.")).toBeInTheDocument();
    expect(within(alert).getByText("The address must start with https://.")).toBeInTheDocument();
    expect(rpcCalls).toEqual([]);

    fireEvent.change(screen.getByLabelText("Title (English)"), { target: { value: "Policy" } });
    fireEvent.change(screen.getByLabelText("Issuing authority"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("Document type"), { target: { value: "policy" } });
    fireEvent.change(screen.getByLabelText("Official identifier"), { target: { value: "P-1" } });
    fireEvent.change(screen.getByLabelText("Source address (https)"), {
      target: { value: "https://example.org/p" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft source" }));
    await waitFor(() => expect(rpcCalls[0]?.[0]).toBe("save_compliance_source"));
    expect(rpcCalls[0]![1]).toMatchObject({
      _project_id: "p1",
      _source_id: null,
      _fields: { title_en: "Policy", official_identifier: "P-1" },
    });
  });

  it("compliance reviewers approve a source and must comment to reject it", async () => {
    tables["compliance_sources_current"] = [source];
    setup("compliance_reviewer");
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(await screen.findByText("A comment is required for this action.")).toBeInTheDocument();
    expect(rpcCalls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(rpcCalls).toContainEqual([
        "transition_compliance_source",
        { _source_id: "s1", _to: "active" },
      ]),
    );
  });

  it("findings board: a failed automated blocker needs a verification run to resolve", async () => {
    tables["compliance_findings"] = [finding];
    setup("compliance_reviewer");
    fireEvent.click(screen.getByRole("button", { name: "Findings" }));
    fireEvent.click(await screen.findByRole("button", { name: /DEMO-BIL/ }));
    const detail = (await screen.findByRole("heading", { name: /Finding detail/ })).closest(
      "section",
    )!;
    expect(within(detail).getByText("Title must be bilingual")).toBeInTheDocument();
    expect(within(detail).getByText("ar+en", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Open blockers prevent review/)).toBeInTheDocument();
    const status = screen.getByLabelText("Change status");
    expect(
      within(status)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Acknowledged", "Remediation in progress", "Resolved", "Accepted exception"]);
    fireEvent.change(status, { target: { value: "resolved" } });
    expect(screen.getByText(/Run the check again after fixing/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision comment"), { target: { value: "fixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      await screen.findByText(/needs the comment, exception or verification run/),
    ).toBeInTheDocument();
    expect(rpcCalls.filter(([n]) => n === "transition_finding")).toEqual([]);
  });

  it("runs a check with the chosen program context", async () => {
    tables["artifacts"] = [
      {
        id: "a1",
        kind: "program_brief",
        title: "Data Science",
        created_at: "2026-01-01",
        artifact_versions: [{ id: "v1", version_number: 1, state: "draft" }],
      },
    ];
    tables["compliance_rulesets"] = [
      { id: "rs1", code: "DEMO-RS", title_en: "Demo", title_ar: "", revision: 1 },
    ];
    setup("program_owner");
    fireEvent.click(screen.getByRole("button", { name: "Run check" }));
    const lang = await screen.findByLabelText("Program language");
    fireEvent.change(lang, { target: { value: "ar" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Run check" }).at(-1)!);
    await waitFor(() =>
      expect(rpcCalls).toContainEqual([
        "run_compliance",
        {
          _version_id: "v1",
          _ruleset_id: "rs1",
          _context: { delivery_mode: "online", credit_type: "credit_bearing", language: "ar" },
        },
      ]),
    );
  });
});
