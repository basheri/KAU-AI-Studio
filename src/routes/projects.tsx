import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/shell/ModulePage";
import { OtpSignIn } from "@/features/auth/OtpSignIn";
import { ProjectsWorkspace } from "@/features/projects/ProjectsWorkspace";
import { useSession } from "@/features/session/SessionProvider";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projects — KAU AI Program Studio" },
      { name: "description", content: "Private program and course development projects." },
      { property: "og:title", content: "Projects — KAU AI Program Studio" },
      { property: "og:description", content: "Private program and course development projects." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const session = useSession();
  return (
    <ModulePage to="/projects">
      {session.status === "loading" ? (
        <p className="text-muted-foreground">…</p>
      ) : session.status === "signed-out" ? (
        <OtpSignIn />
      ) : (
        <ProjectsWorkspace userId={session.userId} />
      )}
    </ModulePage>
  );
}
