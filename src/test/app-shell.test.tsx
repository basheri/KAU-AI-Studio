import { render, screen, fireEvent } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/shell/AppShell";
import { LocaleProvider } from "@/features/i18n/LocaleProvider";
import { NAV_ITEMS } from "@/features/navigation/nav";

function renderShell() {
  const root = createRootRoute({
    component: () => (
      <LocaleProvider>
        <AppShell session={{ status: "signed-out" }}>
          <p>content</p>
        </AppShell>
      </LocaleProvider>
    ),
  });
  const index = createRoute({ getParentRoute: () => root, path: "/" });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("signed-out app shell", () => {
  it("defines the nine workspace sections", () => {
    expect(NAV_ITEMS.map((n) => n.to)).toEqual([
      "/",
      "/projects",
      "/program-architect",
      "/course-studio",
      "/compliance",
      "/reviews",
      "/media",
      "/exports",
      "/settings",
    ]);
  });

  it("renders navigation, signed-out status and Arabic RTL by default", async () => {
    renderShell();
    const nav = await screen.findByRole("navigation", { name: "التنقل الرئيسي" });
    expect(nav.querySelectorAll("a")).toHaveLength(9);
    expect(screen.getByTestId("session-status")).toHaveAttribute("data-status", "signed-out");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
  });

  it("switches to English LTR", async () => {
    renderShell();
    fireEvent.click(await screen.findByRole("button", { name: /English/ }));
    expect(await screen.findByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });
});
