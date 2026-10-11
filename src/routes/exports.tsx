import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/exports")({
  head: () => ({
    meta: [
      { title: "Exports — KAU AI Program Studio" },
      { name: "description", content: "Exports workspace in KAU AI Program Studio." },
      { property: "og:title", content: "Exports — KAU AI Program Studio" },
      { property: "og:description", content: "Exports workspace in KAU AI Program Studio." },
    ],
  }),
  component: ExportsPage,
});

function ExportsPage() {
  return <ModulePage to="/exports" />;
}
