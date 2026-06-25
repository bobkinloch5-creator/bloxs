import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles, Zap, ChevronRight, Code2, Map, Cpu, Layers, Box, ArrowRight,
  Puzzle, Save, Rocket, MessageSquare, Upload, Settings2, Check,
  Plug, FileCode, Wand2, Shield,
} from "lucide-react";
import bloxLogo from "@/assets/bloxsmith-logo.png.asset.json";
import heroBg from "@/assets/hero-roblox-background.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BloxSmith — Build the Roblox Game Only You Can Imagine" },
      { name: "description", content: "BloxSmith is the 100% free AI Roblox game builder. Describe your idea, AI builds scripts, maps, UI, and systems, and sends them straight to Roblox Studio." },
      { property: "og:title", content: "BloxSmith — AI Roblox Game Builder" },
      { property: "og:description", content: "Describe your idea. AI builds it. You play it." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="bs-land min-h-screen text-white">
      <BgFx />
      <Header />
      <main className="relative z-10">
        <Hero />
        <FeatureStrip />
        <FreeForever />
        <HowItWorks />
        <Previews />
        <FinalCTA />
      </main>
      <Footer />
      <LandingCss />
    </div>
  );
}

/* ---------------- Header ---------------- */
function Header() {
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
      <Link to="/" className="flex items-center gap-2.5">
        <img src={bloxLogo.url} alt="BloxSmith" className="h-9 w-9 rounded-xl" />
        <span className="text-xl font-bold tracking-tight">BloxSmith</span>
      </Link>
      <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
        <a href="#features" className="hover:text-white transition">Features</a>
        <a href="#how" className="hover:text-white transition">How It Works</a>
        <a href="#plugin" className="hover:text-white transition">Plugin</a>
        <Link to="/docs" className="hover:text-white transition">Docs</Link>
        <Link to="/support" className="hover:text-white transition">Support</Link>
      </nav>
      <div className="flex items-center gap-2">
        <Link to="/auth" className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-sm text-white/90 hover:bg-white/10 transition">Log in</Link>
        <Link to="/auth" className="bs-btn-grad inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white">
          <Zap className="h-4 w-4" /> Start Building Free
        </Link>
      </div>
    </header>
  );
}

/* ---------------- Hero ---------------- */
import tileBedBattle from "@/assets/tile-bed-battle.jpg";
import tileThemePark from "@/assets/tile-theme-park.jpg";
import tileObbyTower from "@/assets/tile-obby-tower.jpg";
import tileRacingWorld from "@/assets/tile-racing-world.jpg";
import tilePetAdventure from "@/assets/tile-pet-adventure.jpg";
import tileBattleArena from "@/assets/tile-battle-arena.jpg";

const HERO_TILES_L = [
  { title: "BED BATTLE", sub: "Build me a bedwars game...", img: tileBedBattle },
  { title: "THEME PARK", sub: "Build me a theme park...", img: tileThemePark },
  { title: "OBBY TOWER", sub: "Build me an obby game...", img: tileObbyTower },
];
const HERO_TILES_R = [
  { title: "RACING WORLD", sub: "Build me a racing game...", img: tileRacingWorld },
  { title: "PET ADVENTURE", sub: "Build me a pet system...", img: tilePetAdventure },
  { title: "BATTLE ARENA", sub: "Build me a battle arena...", img: tileBattleArena },
];
const PILLS = [
  { icon: Code2, label: "Scripts" }, { icon: Map, label: "Maps" },
  { icon: Cpu, label: "Systems" }, { icon: Layers, label: "UI" },
  { icon: Box, label: "Models" }, { icon: ArrowRight, label: "More" },
];

function Hero() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 pt-6 pb-20 md:pt-12">
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_2fr_1fr]">
        <div className="hidden flex-col gap-5 lg:flex">
          {HERO_TILES_L.map((t, i) => (
            <GameTile key={t.title} {...t} delay={i * 0.15} />
          ))}
        </div>

        <div className="text-center">
          <h1 className="bs-h1 font-extrabold tracking-tight">
            BUILD THE <span className="bs-text-grad">ROBLOX GAME</span><br />
            ONLY YOU CAN IMAGINE
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-300 md:text-lg">
            BloxSmith is the <span className="text-blue-400 font-semibold">100% FREE</span> AI Roblox game builder.<br />
            Describe your idea. <span className="text-blue-400 font-semibold">AI builds it.</span> <span className="text-blue-400 font-semibold">You play it.</span>
          </p>

          <div className="mx-auto mt-8 max-w-2xl">
            <div className="bs-prompt rounded-2xl p-5 text-left">
              <div className="text-slate-400">Describe the Roblox game you want to build...</div>
              <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  <div>
                    <div className="font-semibold text-slate-200">100% Free to use</div>
                    <div>No credit cost · Free forever</div>
                  </div>
                </div>
                <Link to="/auth" className="bs-btn-grad inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white">
                  <Zap className="h-4 w-4" /> Generate Free
                </Link>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {PILLS.map(({ icon: Ic, label }) => (
                <button key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.08] transition">
                  <Ic className="h-3.5 w-3.5 text-blue-400" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden flex-col gap-5 lg:flex">
          {HERO_TILES_R.map((t, i) => (
            <GameTile key={t.title} {...t} delay={i * 0.15 + 0.2} />
          ))}
        </div>
      </div>
    </section>
  );
}

function GameTile({ title, sub, img, delay = 0 }: { title: string; sub: string; img: string; delay?: number }) {
  return (
    <div
      className="bs-float bs-tile rounded-2xl border border-white/10 bg-slate-900/50 p-3 shadow-xl backdrop-blur"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="relative h-32 overflow-hidden rounded-xl">
        <img
          src={img}
          alt={title}
          loading="lazy"
          width={768}
          height={512}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <div className="bs-tile-title text-lg font-extrabold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {title}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-slate-300">
        <Sparkles className="h-3 w-3 text-blue-400" /> {sub}
      </div>
    </div>
  );
}

/* ---------------- Feature strip ---------------- */
const STRIP = [
  { icon: Box, title: "AI Game Builder", body: "Describe your idea and AI builds the game for you in seconds." },
  { icon: Puzzle, title: "Roblox Studio Plugin", body: "Send builds to Roblox Studio with one click and keep building seamlessly." },
  { icon: Cpu, title: "Advanced Systems", body: "Shops, quests, leaderboards, inventories, combat, and more — built in." },
  { icon: Save, title: "Save & Manage", body: "Auto-save your projects, track history, and manage every build." },
  { icon: Rocket, title: "Publish & Share", body: "Publish your game to Roblox and share it with the world." },
];

function FeatureStrip() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-6">
      <div className="bs-panel rounded-3xl border border-white/10 p-8 md:p-10">
        <div className="grid gap-8 md:grid-cols-5">
          {STRIP.map(({ icon: Ic, title, body }) => (
            <div key={title} className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bs-icon-grad">
                <Ic className="h-7 w-7 text-blue-300" />
              </div>
              <h3 className="mt-4 font-bold text-white">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/10 pt-6 text-xs text-slate-400">
          <span className="uppercase tracking-wider">Built for Roblox creators</span>
          <span className="hidden h-1 w-1 rounded-full bg-slate-600 md:inline-block" />
          <span>100% free to use · No credit card</span>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 100% Free Forever ---------------- */
const FREE = [
  { icon: Box, title: "Free AI Building", body: "Build any Roblox game idea with our AI." },
  { icon: Plug, title: "Free Plugin Sync", body: "Send to Roblox Studio with one click." },
  { icon: Layers, title: "Free Templates", body: "Use and customize powerful templates." },
  { icon: Save, title: "Free Saving", body: "Unlimited saves with auto backup." },
  { icon: FileCode, title: "Free Project Management", body: "Organize, rename, and manage your projects." },
];

function FreeForever() {
  return (
    <section className="mx-auto mt-16 max-w-7xl px-6">
      <div className="bs-panel rounded-3xl border border-white/10 p-8 md:p-12">
        <h2 className="text-center text-3xl font-extrabold tracking-tight md:text-4xl">
          100% <span className="bs-text-grad">FREE</span> FOREVER
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-5">
          {FREE.map(({ icon: Ic, title, body }) => (
            <div key={title} className="relative text-center">
              <span className="absolute right-2 top-0 rounded-md bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">FREE</span>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bs-icon-grad">
                <Ic className="h-7 w-7 text-blue-300" />
              </div>
              <h3 className="mt-4 font-bold">{title}</h3>
              <p className="mt-1.5 text-xs text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- How It Works ---------------- */
const STEPS = [
  { icon: MessageSquare, title: "Describe", body: "Tell AI your game idea in simple words." },
  { icon: Sparkles, title: "AI Builds", body: "BloxSmith builds scripts, maps & systems." },
  { icon: Upload, title: "Send to Studio", body: "One-click export to Roblox Studio." },
  { icon: Settings2, title: "Customize", body: "Edit, tweak, and make it your own." },
  { icon: Rocket, title: "Publish", body: "Publish to Roblox and share!" },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto mt-16 max-w-7xl px-6">
      <div className="bs-panel rounded-3xl border border-white/10 p-8 md:p-10">
        <div className="text-center text-xs uppercase tracking-[0.3em] text-slate-400">— How It Works —</div>
        <div className="mt-8 flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex flex-1 items-center gap-4">
              <div className="flex-1 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bs-icon-grad ring-1 ring-blue-400/40">
                  <s.icon className="h-7 w-7 text-blue-300" />
                </div>
                <div className="mt-3 text-sm font-bold">{i + 1}. {s.title}</div>
                <div className="mt-1 text-xs text-slate-400">{s.body}</div>
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="hidden h-6 w-6 shrink-0 text-blue-400/60 md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Previews (chat + templates + plugin) ---------------- */
function Previews() {
  return (
    <section id="templates" className="mx-auto mt-16 max-w-7xl px-6">
      <div className="grid gap-5 lg:grid-cols-3">
        <ChatPreview />
        <TemplatesCard />
        <PluginPreview />
      </div>
    </section>
  );
}

function ChatPreview() {
  return (
    <div className="bs-panel rounded-3xl border border-white/10 p-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Chat Preview</div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        {["Thinking", "Planning", "Building", "Sending to Studio"].map((s, i) => (
          <span key={s} className={`rounded-md px-2 py-1 ${i === 3 ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-slate-300"}`}>
            {i === 0 && <Check className="mr-1 inline h-3 w-3" />}{s}
          </span>
        ))}
        <span className="ml-auto rounded-md bg-emerald-400/15 px-2 py-1 text-[11px] font-bold text-emerald-300">● Done</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="ml-auto max-w-[80%] rounded-2xl bs-btn-grad px-3.5 py-2 text-xs text-white">
          Create a pet adventure game with quests, leveling, and coin system.
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-xs text-slate-200">
          Great idea! I'll build your game with pets, quests, levels, and a coin economy.
          <ul className="mt-2 space-y-1 text-slate-300">
            {["Generating map & environment", "Creating pet system", "Building quest system", "Adding coin & shop", "Creating leaderboards"].map(t => (
              <li key={t} className="flex items-center gap-2"><Check className="h-3 w-3 text-emerald-400" /> {t}</li>
            ))}
          </ul>
          <div className="mt-3 text-[11px] text-slate-400">Sending to Roblox Studio…</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[93%] bs-btn-grad" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
        <input className="flex-1 bg-transparent text-xs text-slate-300 outline-none" placeholder="Ask BloxSmith anything..." readOnly />
        <button className="bs-btn-grad grid h-7 w-7 place-items-center rounded-lg"><ArrowRight className="h-3.5 w-3.5 text-white" /></button>
      </div>
    </div>
  );
}

const TEMPLATES = [
  { name: "Tycoon Empire", grad: "from-amber-500/40 to-orange-600/40" },
  { name: "Obby Challenge", grad: "from-fuchsia-500/40 to-violet-600/40" },
  { name: "Survival Island", grad: "from-emerald-500/40 to-teal-600/40" },
  { name: "Dungeon Quest", grad: "from-rose-600/40 to-red-700/40" },
  { name: "Racing Circuit", grad: "from-red-500/40 to-amber-500/40" },
  { name: "Fighting Arena", grad: "from-sky-500/40 to-indigo-600/40" },
];

function TemplatesCard() {
  return (
    <div className="bs-panel rounded-3xl border border-white/10 p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Featured Templates</div>
        <a href="#" className="text-[11px] text-blue-400 hover:text-blue-300">View All Templates →</a>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {TEMPLATES.map(t => (
          <div key={t.name} className={`group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${t.grad}`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,rgba(255,255,255,0.2),transparent_60%)]" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <div className="text-[11px] font-bold text-white">{t.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PluginPreview() {
  return (
    <div id="plugin" className="bs-panel rounded-3xl border border-white/10 p-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Roblox Studio Plugin Preview</div>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
        <div className="flex items-center gap-2 border-b border-white/10 bg-slate-900/60 px-3 py-2">
          <img src={bloxLogo.url} alt="" className="h-4 w-4" />
          <div className="text-[11px] font-semibold">BloxSmith</div>
          <div className="ml-auto flex gap-1.5">
            <div className="h-2 w-2 rounded-full bg-slate-600" />
            <div className="h-2 w-2 rounded-full bg-slate-600" />
          </div>
        </div>
        <div className="grid grid-cols-[110px_1fr] text-[11px]">
          <div className="border-r border-white/10 bg-slate-900/40 p-2">
            {["Home", "Build", "Templates", "Projects", "Systems", "Assets", "Settings"].map((it, i) => (
              <div key={it} className={`mb-1 rounded-md px-2 py-1.5 ${i === 1 ? "bg-blue-500/20 text-blue-300" : "text-slate-400"}`}>{it}</div>
            ))}
          </div>
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Send to Studio</div>
            <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/60 p-2.5">
              <div className="text-xs font-semibold">Pet Adventure</div>
              <div className="text-[10px] text-slate-400">Last saved 2m ago</div>
              <button className="mt-2 w-full rounded-md bs-btn-grad py-1.5 text-[11px] font-semibold text-white">Send to Roblox Studio</button>
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">Export Settings</div>
            <div className="mt-1.5 space-y-1.5">
              {["Scripts", "Maps", "Models", "UI"].map(it => (
                <div key={it} className="flex items-center justify-between rounded-md bg-slate-900/60 px-2 py-1 text-[11px]">
                  <span>{it}</span>
                  <div className="h-3.5 w-6 rounded-full bg-blue-500 relative">
                    <div className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-emerald-400">● Connected</div>
      </div>
    </div>
  );
}

/* ---------------- Final CTA ---------------- */
function FinalCTA() {
  return (
    <section id="community" className="mx-auto mt-16 max-w-7xl px-6 pb-16">
      <div className="bs-panel relative overflow-hidden rounded-3xl border border-white/10 p-10 text-center md:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.25),transparent_60%)]" />
        <div className="relative">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            READY TO BUILD YOUR <span className="bs-text-grad">DREAM ROBLOX GAME?</span>
          </h2>
          <p className="mt-3 text-sm text-slate-300 md:text-base">
            Free forever. No credit card. Built for Roblox creators who want to ship.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth" className="bs-btn-grad inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white">
              <Zap className="h-4 w-4" /> Start Building Free
            </Link>
            <a href="https://discord.gg/lovable-dev" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">
              <MessageSquare className="h-4 w-4" /> Join Discord
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-blue-400" /> 100% Free Forever</span>
            <span className="flex items-center gap-1.5"><Shield className="h-3 w-3 text-blue-400" /> No Credit Card</span>
            <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-blue-400" /> No Limits</span>
            <span className="flex items-center gap-1.5"><Wand2 className="h-3 w-3 text-blue-400" /> Built for Roblox Creators</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/40">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <img src={bloxLogo.url} alt="BloxSmith" className="h-8 w-8 rounded-lg" />
              <span className="font-bold">BloxSmith</span>
            </div>
            <p className="mt-3 max-w-xs text-xs text-slate-400">
              The free AI Roblox game builder. Built for Roblox creators.
            </p>
          </div>
          <FootCol title="Product" links={[["Features", "/#features"], ["How It Works", "/#how"], ["Plugin", "/#plugin"]]} />
          <FootCol title="Resources" links={[["Docs", "/docs"], ["Support", "/support"], ["Contact", "/contact"]]} />
          <FootCol title="Legal" links={[["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Discord", "https://discord.gg/lovable-dev"]]} />
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500">
          <div>Made for Roblox creators. 100% free.</div>
          <div>© {new Date().getFullYear()} BloxSmith. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}

function FootCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</div>
      <ul className="mt-3 space-y-2 text-xs text-slate-400">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("http") || href.startsWith("/#") ? (
              <a href={href} className="hover:text-white transition" target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>{label}</a>
            ) : (
              <Link to={href} className="hover:text-white transition">{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- BG fx ---------------- */
function BgFx() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_20%_-10%,rgba(59,130,246,0.25),transparent_60%),radial-gradient(900px_500px_at_100%_10%,rgba(139,92,246,0.15),transparent_60%),#070b16]" />
      {/* floating cubes */}
      {[
        ["top-24 left-8", "from-blue-500 to-indigo-600", 0],
        ["top-60 right-10", "from-amber-400 to-orange-500", 0.6],
        ["top-[55%] left-6", "from-violet-500 to-fuchsia-600", 1.2],
        ["top-[70%] right-16", "from-emerald-400 to-teal-500", 1.8],
        ["top-[30%] right-[20%]", "from-blue-400 to-cyan-500", 2.4],
      ].map(([pos, grad, d], i) => (
        <div
          key={i}
          className={`bs-float absolute ${pos} h-8 w-8 rounded-lg bg-gradient-to-br ${grad} opacity-30 shadow-2xl`}
          style={{ animationDelay: `${d as number}s` }}
        />
      ))}
    </div>
  );
}

/* ---------------- Local CSS ---------------- */
function LandingCss() {
  return (
    <style>{`
      .bs-land { background: #070b16; color: #fff; font-family: var(--font-display), Inter, sans-serif; }
      .bs-h1 { font-size: clamp(2.25rem, 5vw, 4.25rem); line-height: 1.05; }
      .bs-text-grad {
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 60%, #fbbf24 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
      }
      .bs-btn-grad {
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 60%, #8b5cf6 100%);
        background-size: 200% 200%;
        box-shadow: 0 12px 32px -10px rgba(59,130,246,0.55);
        transition: transform .2s ease, box-shadow .2s ease, background-position .4s ease;
      }
      .bs-btn-grad:hover { transform: translateY(-1px); background-position: 100% 0%; box-shadow: 0 16px 40px -10px rgba(99,102,241,0.7); }
      .bs-panel {
        background:
          linear-gradient(180deg, rgba(15,23,42,0.7), rgba(10,14,28,0.85));
        box-shadow: 0 30px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04);
        backdrop-filter: blur(8px);
      }
      .bs-prompt {
        background: linear-gradient(180deg, rgba(20,30,55,0.8), rgba(12,18,38,0.9));
        border: 1px solid rgba(59,130,246,0.35);
        box-shadow: 0 0 0 4px rgba(59,130,246,0.08), 0 30px 60px -20px rgba(59,130,246,0.35);
      }
      .bs-icon-grad {
        background: linear-gradient(135deg, rgba(59,130,246,0.18), rgba(139,92,246,0.12));
        border: 1px solid rgba(59,130,246,0.35);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 20px -10px rgba(59,130,246,0.5);
      }
      .bs-tile { transition: transform .3s ease; }
      .bs-tile:hover { transform: translateY(-4px) rotate(-1deg); }
      .bs-tile-title { font-family: var(--font-display), Inter, sans-serif; }
      @keyframes bs-land-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-8px) rotate(2deg); } }
      .bs-float { animation: bs-land-float 6s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .bs-float, .bs-btn-grad { animation: none !important; transition: none !important; } }
    `}</style>
  );
}
