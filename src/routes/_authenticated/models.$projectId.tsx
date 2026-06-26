import { createFileRoute } from "@tanstack/react-router";
import { ModelsView } from "@/components/models/ModelsView";

export const Route = createFileRoute("/_authenticated/models/$projectId")({
  head: () => ({ meta: [{ title: "3D Models — BloxSmith" }] }),
  component: function ProjectModelsPage() {
    const { projectId } = Route.useParams();
    return <ModelsView projectId={projectId} />;
  },
});
