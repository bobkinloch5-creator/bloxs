import { Component, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";

type Props = { children: ReactNode; label?: string; fallback?: ReactNode };
type State = { error: Error | null };

/**
 * Local error boundary. Wraps a subtree so a render-time crash surfaces a
 * friendly card instead of taking down the whole chat page. Users get a
 * clear message plus a Retry button that resets local boundary state.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Keep the raw error in the console so devs can inspect the stack.
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    const message = friendlyError(this.state.error, { fallback: "This section hit an unexpected error. Try again in a moment." });
    return (
      <div
        className="flex items-start gap-3 rounded-2xl border p-4 text-sm"
        style={{
          borderColor: "color-mix(in oklab, var(--bs-danger, #ef4444) 40%, transparent)",
          background: "color-mix(in oklab, var(--bs-danger, #ef4444) 8%, transparent)",
          color: "var(--bs-danger, #ef4444)",
        }}
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {this.props.label ? `${this.props.label} couldn't load` : "Something went wrong"}
          </div>
          <div className="mt-0.5 text-[12px] opacity-80">{message}</div>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium"
          style={{ borderColor: "currentColor" }}
        >
          <RotateCcw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }
}

