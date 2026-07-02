import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy project workspace URL. The dedicated /project/:id page was removed —
 * opening a project now just sets it as the active project in localStorage
 * and lands the user back on the single Home / AI Workspace (/dashboard).
 */
export const Route = createFileRoute("/_authenticated/project/$projectId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (typeof window !== "undefined") {
      try { localStorage.setItem("bs:activeProjectId", params.projectId); } catch {}
      // Notify the Dashboard (which may already be mounted) to re-read the active id.
      try { window.dispatchEvent(new Event("bs:active-project-changed")); } catch {}
    }
    throw redirect({ to: "/dashboard", hash: "build" });
  },
  component: () => null,
});
