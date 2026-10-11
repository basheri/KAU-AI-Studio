import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance Library — KAU AI Program Studio" },
      { name: "description", content: "Compliance Library workspace in KAU AI Program Studio." },
      { property: "og:title", content: "Compliance Library — KAU AI Program Studio" },
      {
        property: "og:description",
        content: "Compliance Library workspace in KAU AI Program Studio.",
      },
    ],
  }),
  component: CompliancePage,
});

function CompliancePage() {
  return <ModulePage to="/compliance" />;
}
