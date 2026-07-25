import { createFileRoute } from "@tanstack/react-router";
import { ModelsView } from "@/components/models/ModelsView";
import { RouteSkeleton } from "@/components/RouteSkeleton";

export const Route = createFileRoute("/_authenticated/models")({
  pendingComponent: () => <RouteSkeleton title="3D Models" columns={3} />,
  pendingMs: 150,
  head: () => ({ meta: [{ title: "3D Models — BloxSmith" }] }),
  component: () => <ModelsView />,
});
