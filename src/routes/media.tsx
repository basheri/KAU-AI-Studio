import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";

export const Route = createFileRoute("/media")({
  head: () => ({
    meta: [
      { title: "Media — KAU AI Program Studio" },
      { name: "description", content: "Media workspace in KAU AI Program Studio." },
      { property: "og:title", content: "Media — KAU AI Program Studio" },
      { property: "og:description", content: "Media workspace in KAU AI Program Studio." },
    ],
  }),
  component: MediaPage,
});

function MediaPage() {
  return <ModulePage to="/media" />;
}
