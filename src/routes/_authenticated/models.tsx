import { createFileRoute } from "@tanstack/react-router";
import { ModelsView } from "@/components/models/ModelsView";

export const Route = createFileRoute("/_authenticated/models")({
  head: () => ({ meta: [{ title: "3D Models — BloxSmith" }] }),
  component: () => <ModelsView />,
});
