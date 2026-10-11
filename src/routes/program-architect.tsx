import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";
import { OtpSignIn } from "@/features/auth/OtpSignIn";
import { ProgramStudio } from "@/features/intake/ProgramStudio";
import { useSession } from "@/features/session/SessionProvider";

export const Route = createFileRoute("/program-architect")({
  head: () => ({
    meta: [
      { title: "Program Architect — KAU AI Program Studio" },
      {
        name: "description",
        content: "Program intake, canonical Program Brief and learning alignment for KAU programs.",
      },
      { property: "og:title", content: "Program Architect — KAU AI Program Studio" },
      {
        property: "og:description",
        content: "Program intake, canonical Program Brief and learning alignment for KAU programs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchitectPage,
});

function ArchitectPage() {
  const session = useSession();
  return (
    <ModulePage to="/program-architect">
      {session.status === "loading" ? (
        <p role="status" className="text-muted-foreground">
          …
        </p>
      ) : session.status === "signed-out" ? (
        <OtpSignIn />
      ) : (
        <ProgramStudio userId={session.userId} />
      )}
    </ModulePage>
  );
}
