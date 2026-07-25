import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  FolderKanban,
  Sparkles,
  Store,
  Trophy,
  Puzzle,
  Users,
  Settings,
  BookOpen,
  Heart,
  MessageSquare,
  Keyboard,
  History,
  Palette,
  Gift,
  LifeBuoy,
} from "lucide-react";

type Nav = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
};

const NAV: Nav[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, keywords: "home main" },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "History", to: "/history", icon: History, keywords: "past builds" },
  { label: "Plugin", to: "/plugin", icon: Puzzle, keywords: "roblox studio pair" },
  { label: "3D Models", to: "/models", icon: Sparkles, keywords: "trellis nvidia generate 3d" },
  { label: "UI Generator", to: "/ui-generator", icon: Palette, keywords: "gui design" },
  { label: "Collaborators", to: "/collaborators", icon: Users, keywords: "team invite" },
  { label: "Referrals", to: "/referrals", icon: Gift, keywords: "invite friends" },
  { label: "Settings", to: "/settings", icon: Settings },
];

const PUBLIC_NAV: Nav[] = [
  { label: "Showcase", to: "/showcase", icon: Trophy, keywords: "community games" },
  { label: "Template Marketplace", to: "/templates-market", icon: Store, keywords: "presets" },
  { label: "Docs", to: "/docs", icon: BookOpen },
  { label: "Support", to: "/support", icon: LifeBuoy, keywords: "help" },
  { label: "Donate", to: "/donate", icon: Heart },
  { label: "Contact", to: "/contact", icon: MessageSquare },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "?" && !inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    router.navigate({ to });
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, actions, help…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {NAV.map((n) => (
              <CommandItem
                key={n.to}
                value={`${n.label} ${n.keywords ?? ""}`}
                onSelect={() => go(n.to)}
              >
                <n.icon className="mr-2 h-4 w-4" />
                <span>{n.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Explore">
            {PUBLIC_NAV.map((n) => (
              <CommandItem
                key={n.to}
                value={`${n.label} ${n.keywords ?? ""}`}
                onSelect={() => go(n.to)}
              >
                <n.icon className="mr-2 h-4 w-4" />
                <span>{n.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Help">
            <CommandItem
              value="keyboard shortcuts help"
              onSelect={() => {
                setOpen(false);
                setShortcutsOpen(true);
              }}
            >
              <Keyboard className="mr-2 h-4 w-4" />
              <span>Keyboard shortcuts</span>
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandList className="max-h-[420px]">
        <CommandGroup heading="Global">
          <Row keys={["⌘", "K"]} label="Open command palette" />
          <Row keys={["Ctrl", "K"]} label="Open command palette (Windows/Linux)" />
          <Row keys={["?"]} label="Show keyboard shortcuts" />
          <Row keys={["Esc"]} label="Close dialogs" />
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Workspace Chat">
          <Row keys={["⌘", "/"]} label="Toggle Chat ↔ Build mode" />
          <Row keys={["⌘", "Enter"]} label="Send message" />
          <Row keys={["↑"]} label="Edit last message (when empty)" />
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-2 text-sm">
      <span className="text-slate-200">{label}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-slate-100"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}
