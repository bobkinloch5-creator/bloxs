import { useEffect, useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Maximize2, Minimize2 } from "lucide-react";

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

/**
 * IDE-style workspace: collapsible/resizable left & right rails, focus mode, persisted layout.
 * Wrap any 3-pane builder UI. Panel sizes are auto-saved by react-resizable-panels via `id`.
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

  useEffect(() => { setLayout(load(storageKey)); setHydrated(true); }, [storageKey]);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch {}
  }, [layout, storageKey, hydrated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); setLayout((l) => ({ ...l, leftOpen: !l.leftOpen })); }
      else if (k === "j") { e.preventDefault(); setLayout((l) => ({ ...l, rightOpen: !l.rightOpen })); }
      else if (e.key === ".") { e.preventDefault(); setLayout((l) => ({ ...l, focus: !l.focus })); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showLeft = !!left && layout.leftOpen && !layout.focus;
  const showRight = !!right && layout.rightOpen && !layout.focus;

  return (
    <div className="flex h-screen min-h-0 w-full flex-col overflow-hidden">
      {topBar}
      <div className="relative flex min-h-0 flex-1">
        <FloatingControls layout={layout} setLayout={setLayout} hasLeft={!!left} hasRight={!!right} />
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
