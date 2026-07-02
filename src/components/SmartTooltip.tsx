import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { HelpCircle, Clock, Zap, Keyboard, Wand2, BookOpen, CheckCircle2 } from "lucide-react";

/* ────────────── Help Mode context (localStorage persisted) ────────────── */

type HelpCtx = { enabled: boolean; toggle: () => void; set: (v: boolean) => void };
const HelpModeContext = createContext<HelpCtx | null>(null);

const STORAGE_KEY = "bs-help-mode";

export function HelpModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch { /* ignore */ }
  }, [enabled]);
  return (
    <HelpModeContext.Provider value={{ enabled, toggle: () => setEnabled((v) => !v), set: setEnabled }}>
      {children}
    </HelpModeContext.Provider>
  );
}

export function useHelpMode(): HelpCtx {
  const ctx = useContext(HelpModeContext);
  if (ctx) return ctx;
  // Safe fallback so consumers work outside the provider.
  return { enabled: false, toggle: () => {}, set: () => {} };
}

/* ────────────── Help Mode Toggle button ────────────── */

export function HelpModeToggle({ className = "" }: { className?: string }) {
  const { enabled, toggle } = useHelpMode();
  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled ? "Help Mode is on — click to hide hints" : "Turn on Help Mode for guided tips"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${className}`}
      style={{
        borderColor: enabled ? "color-mix(in oklab, var(--bs-primary) 45%, transparent)" : "var(--bs-border)",
        background: enabled ? "color-mix(in oklab, var(--bs-primary) 12%, transparent)" : "var(--bs-card)",
        color: enabled ? "var(--bs-primary)" : "var(--bs-muted-fg)",
      }}
    >
      <HelpCircle className="h-3 w-3" />
      Help {enabled ? "on" : "off"}
    </button>
  );
}

/* ────────────── Rich hover card ────────────── */

export type SmartHelp = {
  title: string;
  description: string;
  useWhen?: string;
  generates?: string;
  estTime?: string;
  affectsProject?: boolean;
  credits?: string | number;
  shortcut?: string;
  status?: string;
  docsHref?: string;
};

type Props = { help: SmartHelp; children: ReactNode; disabled?: boolean };

/**
 * Wrap any interactive control to get a rich hover card with what the button
 * does, when to use it, what it generates, estimated time, project impact,
 * credit cost, shortcut, and optional docs link. Falls back to no-op when
 * disabled or if children can't be a hover trigger.
 */
export function SmartTooltip({ help, children, disabled }: Props) {
  if (disabled) return <>{children}</>;
  return (
    <HoverCard openDelay={220} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-80 rounded-xl border p-3 text-sm shadow-xl"
        style={{
          borderColor: "var(--bs-border)",
          background: "var(--bs-card)",
          color: "var(--bs-fg)",
        }}
      >
        <div className="flex items-start gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in oklab, var(--bs-primary) 12%, transparent)", color: "var(--bs-primary)" }}>
            <Wand2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display truncate text-[14px] font-bold">{help.title}</div>
            <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--bs-muted-fg)" }}>
              {help.description}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {help.estTime && (
            <MetaRow icon={Clock} label="Est. time" value={help.estTime} />
          )}
          {typeof help.affectsProject === "boolean" && (
            <MetaRow icon={CheckCircle2} label="Project" value={help.affectsProject ? "Modifies" : "Read-only"} tone={help.affectsProject ? "var(--bs-primary)" : "#22c55e"} />
          )}
          {help.credits !== undefined && (
            <MetaRow icon={Zap} label="Credits" value={String(help.credits)} tone="#eab308" />
          )}
          {help.shortcut && (
            <MetaRow icon={Keyboard} label="Shortcut" value={help.shortcut} />
          )}
        </div>

        {(help.useWhen || help.generates) && (
          <div className="mt-3 space-y-1.5 border-t pt-2 text-[12px]" style={{ borderColor: "var(--bs-border)" }}>
            {help.useWhen && (
              <div>
                <span className="font-semibold" style={{ color: "var(--bs-primary)" }}>Use when: </span>
                <span style={{ color: "var(--bs-muted-fg)" }}>{help.useWhen}</span>
              </div>
            )}
            {help.generates && (
              <div>
                <span className="font-semibold" style={{ color: "var(--bs-primary)" }}>Generates: </span>
                <span style={{ color: "var(--bs-muted-fg)" }}>{help.generates}</span>
              </div>
            )}
          </div>
        )}

        {help.status && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
            style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)", color: "var(--bs-primary)" }}
          >
            {help.status}
          </div>
        )}

        {help.docsHref && (
          <a
            href={help.docsHref}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--bs-primary)" }}
          >
            <BookOpen className="h-3 w-3" /> Documentation
          </a>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function MetaRow({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]" style={{ background: "var(--bs-card-2)" }}>
      <Icon className="h-3 w-3" style={{ color: tone ?? "var(--bs-muted-fg)" }} />
      <span style={{ color: "var(--bs-muted-fg)" }}>{label}:</span>
      <span className="ml-auto truncate font-semibold" style={{ color: tone ?? "var(--bs-fg)" }}>{value}</span>
    </div>
  );
}

/* ────────────── Inline "Help Mode" caption under a button ────────────── */

export function HelpCaption({ text, badge }: { text: string; badge?: string }) {
  const { enabled } = useHelpMode();
  if (!enabled) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[10.5px] leading-tight" style={{ color: "var(--bs-muted-fg)" }}>
      {badge && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
          style={{ background: "color-mix(in oklab, var(--bs-primary) 15%, transparent)", color: "var(--bs-primary)" }}
        >
          {badge}
        </span>
      )}
      <span className="truncate">{text}</span>
    </div>
  );
}
