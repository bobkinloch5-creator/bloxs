// Single unified brand pill shown in place of the model picker.
// BloxSmith presents as one intelligent agent; the real model is chosen
// automatically by the router (or overridden from /settings/advanced).

import { Brain } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Props = {
  /** Compact variant used inside the composer footer. */
  variant?: "bar" | "compact";
  /** Currently active model id — used only for the tooltip on hover. */
  modelId?: string;
};

export function AgentPill({ variant = "bar", modelId }: Props) {
  const compact = variant === "compact";
  return (
    <Link
      to="/settings"
      title={modelId ? `BloxSmith Agent — auto-routing (advanced: ${modelId})` : "BloxSmith Agent — auto-routing"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/15 ${
        compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      <Brain className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>BloxSmith Agent</span>
      <span
        className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
        aria-hidden
      />
    </Link>
  );
}
