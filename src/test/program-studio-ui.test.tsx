import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, from: vi.fn(), storage: { from: vi.fn() } },
}));

import { IntakeForm } from "@/features/intake/IntakeForm";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <IntakeForm projectId="p1" onCreated={() => {}} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("program intake UI", () => {
  beforeEach(() => {
    rpc.mockClear();
    localStorage.clear();
  });

  it("renders Arabic RTL by default with the three modes and categories", async () => {
    setup();
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    for (const name of ["فكرة موجّهة", "رفع مقترح أو مستند", "إعادة تطوير برنامج قائم"])
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("renders English LTR and is keyboard operable", async () => {
    localStorage.setItem("kau-studio-locale", "en");
    setup();
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    const upload = screen.getByRole("radio", { name: "Proposal or document upload" });
    upload.focus();
    expect(document.activeElement).toBe(upload);
    fireEvent.click(upload);
    expect(screen.getByLabelText("Proposal file")).toBeInTheDocument();
    const redevelop = screen.getByRole("radio", { name: "Existing program redevelopment" });
    fireEvent.click(redevelop);
    expect(screen.getByLabelText("Existing program source")).toBeInTheDocument();
  });

  it("validates before any request is sent", async () => {
    localStorage.setItem("kau-studio-locale", "en");
    setup();
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    fireEvent.click(screen.getByRole("button", { name: "Create brief" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a title");
    expect(rpc).not.toHaveBeenCalled();
  });
});
