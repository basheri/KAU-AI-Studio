import { createFileRoute } from "@tanstack/react-router";
import { parseFocus, type Focus } from "@/features/navigation/focus";
import { ModulePage } from "@/components/shell/ModulePage";
import { OtpSignIn } from "@/features/auth/OtpSignIn";
import { ComplianceLibrary } from "@/features/compliance/ComplianceLibrary";
import { useSession } from "@/features/session/SessionProvider";

const DESC =
  "Versioned policy sources, enforceable rules, frozen compliance runs and findings in KAU AI Program Studio.";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance Library — KAU AI Program Studio" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Compliance Library — KAU AI Program Studio" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): Focus => parseFocus(search),
  component: CompliancePage,
});

function CompliancePage() {
  const session = useSession();
  const focus = Route.useSearch();
  return (
    <ModulePage to="/compliance">
      {session.status === "loading" ? (
        <p role="status" className="text-muted-foreground">
          …
        </p>
      ) : session.status === "signed-out" ? (
        <OtpSignIn />
      ) : (
        <ComplianceLibrary key={JSON.stringify(focus)} userId={session.userId} focus={focus} />
      )}
    </ModulePage>
  );
}
