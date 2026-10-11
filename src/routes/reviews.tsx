import { createFileRoute } from "@tanstack/react-router";
import { parseFocus, type Focus } from "@/features/navigation/focus";
import { ModulePage } from "@/components/shell/ModulePage";
import { OtpSignIn } from "@/features/auth/OtpSignIn";
import { ReviewWorkspace } from "@/features/reviews/ReviewWorkspace";
import { useSession } from "@/features/session/SessionProvider";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — KAU AI Program Studio" },
      {
        name: "description",
        content: "Governed review workflow, decisions and version history for program artifacts.",
      },
      { property: "og:title", content: "Reviews — KAU AI Program Studio" },
      {
        property: "og:description",
        content: "Governed review workflow, decisions and version history for program artifacts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): Focus => parseFocus(search),
  component: ReviewsPage,
});

function ReviewsPage() {
  const session = useSession();
  const focus = Route.useSearch();
  return (
    <ModulePage to="/reviews">
      {session.status === "loading" ? (
        <p className="text-muted-foreground">…</p>
      ) : session.status === "signed-out" ? (
        <OtpSignIn />
      ) : (
        <ReviewWorkspace key={JSON.stringify(focus)} userId={session.userId} focus={focus} />
      )}
    </ModulePage>
  );
}
