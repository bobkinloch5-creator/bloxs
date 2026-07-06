import { useEffect, useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Maximize2, Minimize2, X } from "lucide-react";

type Layout = { leftOpen: boolean; rightOpen: boolean; focus: boolean };
const DEFAULT: Layout = { leftOpen: true, rightOpen: true, focus: false };

function load(key: string): Layout {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

// Tailwind's lg breakpoint (1024px) — below this we switch to a mobile/tablet
// single-column layout with rails presented as overlay drawers.
function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return narrow;
}

/**
 * IDE-style workspace: collapsible/resizable left & right rails, focus mode, persisted layout.
 * On tablets and phones (<1024px) the rails collapse into overlay drawers so the center
 * pane always has room to breathe.
 */
export function WorkspaceShell({
  storageKey = "bs-workspace",
  left,
  right,
  children,
  topBar,
}: {
  storageKey?: string;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  topBar?: ReactNode;
}) {
  const [layout, setLayout] = useState<Layout>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const narrow = useIsNarrow();

  useEffect(() => { setLayout(load(storageKey)); setHydrated(true); }, [storageKey]);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch {}
  }, [layout, storageKey, hydrated]);

  // Auto-collapse rails when shrinking into tablet/phone widths; do NOT persist
  // this so restoring on a wide screen brings the rails back.
  const [mobileDrawer, setMobileDrawer] = useState<null | "left" | "right">(null);
  useEffect(() => {
    if (narrow) setMobileDrawer(null);
  }, [narrow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); if (narrow) setMobileDrawer((d) => d === "left" ? null : "left"); else setLayout((l) => ({ ...l, leftOpen: !l.leftOpen })); }
      else if (k === "j") { e.preventDefault(); if (narrow) setMobileDrawer((d) => d === "right" ? null : "right"); else setLayout((l) => ({ ...l, rightOpen: !l.rightOpen })); }
      else if (e.key === ".") { e.preventDefault(); setLayout((l) => ({ ...l, focus: !l.focus })); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [narrow]);

  const showLeft = !!left && layout.leftOpen && !layout.focus && !narrow;
  const showRight = !!right && layout.rightOpen && !layout.focus && !narrow;

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden">
      {topBar}
      <div className="relative flex min-h-0 flex-1">
        <FloatingControls
          layout={layout}
          setLayout={setLayout}
          hasLeft={!!left}
          hasRight={!!right}
          narrow={narrow}
          openDrawer={(d) => setMobileDrawer(d)}
        />
        {narrow ? (
          <div className="relative flex h-full min-h-0 w-full">
            <div className="flex h-full min-h-0 w-full flex-col">{children}</div>
            {mobileDrawer && (
              <MobileDrawer
                side={mobileDrawer}
                onClose={() => setMobileDrawer(null)}
              >
                {mobileDrawer === "left" ? left : right}
              </MobileDrawer>
            )}
          </div>
        ) : (
          <Group
            orientation="horizontal"
            id={`${storageKey}-group`}
            className="flex h-full min-h-0 w-full"
          >
            {showLeft && (
              <>
                <Panel id="left" defaultSize="18%" minSize="12%" maxSize="34%" className="min-w-0">
                  <div className="h-full min-h-0 overflow-y-auto bs-smooth-scroll">{left}</div>
                </Panel>
                <ResizeBar />
              </>
            )}
            <Panel id="center" minSize="30%" className="min-w-0">
              <div className="flex h-full min-h-0 flex-col">{children}</div>
            </Panel>
            {showRight && (
              <>
                <ResizeBar />
                <Panel id="right" defaultSize="22%" minSize="14%" maxSize="38%" className="min-w-0">
                  <div className="h-full min-h-0 overflow-y-auto bs-smooth-scroll">{right}</div>
                </Panel>
              </>
            )}
          </Group>
        )}
      </div>
    </div>
  );
}

function MobileDrawer({ side, onClose, children }: { side: "left" | "right"; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className={`flex-1 bg-black/60 backdrop-blur-sm ${side === "left" ? "order-2" : "order-1"}`}
      />
      <div
        className={`relative flex h-full w-[min(88vw,340px)] flex-col border-indigo-500/15 bg-[#0a0a1a]/95 shadow-2xl ${
          side === "left" ? "order-1 border-r" : "order-2 border-l"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-white/70 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="h-full min-h-0 overflow-y-auto bs-smooth-scroll pt-2">{children}</div>
      </div>
    </div>
  );
}

function ResizeBar() {
  return (
    <Separator className="group relative !w-[3px] bg-transparent transition-colors hover:!bg-indigo-400/40 data-[resize-handle-state=drag]:!bg-indigo-400/70">
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </Separator>
  );
}

function FloatingControls({
  layout, setLayout, hasLeft, hasRight,
}: { layout: Layout; setLayout: (f: (l: Layout) => Layout) => void; hasLeft: boolean; hasRight: boolean }) {
  return (
    <div className="pointer-events-none absolute right-3 top-2 z-30 flex gap-1.5">
      {hasLeft && !layout.focus && (
        <CtrlBtn
          onClick={() => setLayout((l) => ({ ...l, leftOpen: !l.leftOpen }))}
          title={layout.leftOpen ? "Hide left sidebar (⌘B)" : "Show left sidebar (⌘B)"}
        >
          {layout.leftOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        </CtrlBtn>
      )}
      {hasRight && !layout.focus && (
        <CtrlBtn
          onClick={() => setLayout((l) => ({ ...l, rightOpen: !l.rightOpen }))}
          title={layout.rightOpen ? "Hide right sidebar (⌘J)" : "Show right sidebar (⌘J)"}
        >
          {layout.rightOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
        </CtrlBtn>
      )}
      <CtrlBtn
        onClick={() => setLayout((l) => ({ ...l, focus: !l.focus }))}
        title={layout.focus ? "Exit focus mode (⌘.)" : "Focus mode — chat only (⌘.)"}
      >
        {layout.focus ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </CtrlBtn>
    </div>
  );
}

function CtrlBtn({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-white/70 shadow-lg backdrop-blur-md transition hover:border-indigo-400/40 hover:bg-indigo-500/20 hover:text-white"
    >
      {children}
    </button>
  );
}
