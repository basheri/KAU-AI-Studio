import { createFileRoute } from "@tanstack/react-router";
import { parseFocus, type Focus } from "@/features/navigation/focus";
import { ModulePage } from "@/components/shell/ModulePage";
import { OtpSignIn } from "@/features/auth/OtpSignIn";
import { CourseStudio } from "@/features/course/CourseStudio";
import { useSession } from "@/features/session/SessionProvider";

const DESC =
  "Author course modules, lesson pages and accessible learner content in KAU AI Program Studio.";

export const Route = createFileRoute("/course-studio")({
  head: () => ({
    meta: [
      { title: "Course Studio — KAU AI Program Studio" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Course Studio — KAU AI Program Studio" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): Focus => parseFocus(search),
  component: CourseStudioPage,
});

function CourseStudioPage() {
  const session = useSession();
  const focus = Route.useSearch();
  return (
    <ModulePage to="/course-studio">
      {session.status === "loading" ? (
        <p role="status" className="text-muted-foreground">
          …
        </p>
      ) : session.status === "signed-out" ? (
        <OtpSignIn />
      ) : (
        <CourseStudio key={JSON.stringify(focus)} userId={session.userId} focus={focus} />
      )}
    </ModulePage>
  );
}
