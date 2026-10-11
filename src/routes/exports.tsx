import { createFileRoute } from "@tanstack/react-router";
import { parseFocus, type Focus } from "@/features/navigation/focus";
import { ModulePage } from "@/components/shell/ModulePage";
import { OtpSignIn } from "@/features/auth/OtpSignIn";
import { ExportsWorkspace } from "@/features/exports/ExportsWorkspace";
import { useSession } from "@/features/session/SessionProvider";

const DESC =
  "Course specifications, program summaries and SCORM packages from approved versions, with a verifiable export log.";

export const Route = createFileRoute("/exports")({
  head: () => ({
    meta: [
      { title: "Exports — KAU AI Program Studio" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Exports — KAU AI Program Studio" },
      { property: "og:description", content: DESC },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): Focus => parseFocus(search),
  component: ExportsPage,
});

function ExportsPage() {
  const session = useSession();
  const focus = Route.useSearch();
  return (
    <ModulePage to="/exports">
      {session.status === "loading" ? (
        <p role="status" className="text-muted-foreground">
          …
        </p>
      ) : session.status === "signed-out" ? (
        <OtpSignIn />
      ) : (
        <ExportsWorkspace key={JSON.stringify(focus)} userId={session.userId} focus={focus} />
      )}
    </ModulePage>
  );
}
