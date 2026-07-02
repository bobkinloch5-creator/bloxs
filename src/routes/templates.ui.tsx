import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles, Coins, Trophy, Package, ShoppingBag, Users, Settings as SettingsIcon,
  Swords, Heart, Menu, ScrollText, MessageSquare, ArrowRight, Zap, CheckCircle2,
} from "lucide-react";

const CANONICAL = "https://bloxsmith.pro/templates/ui";

type UITemplate = {
  slug: string;
  name: string;
  category: string;
  description: string;
  features: string[];
  icon: typeof Coins;
  accent: string; // tailwind gradient classes
};

const UI_TEMPLATES: UITemplate[] = [
  {
    slug: "shop-gui", name: "Shop GUI", category: "Economy",
    description: "Full-featured item shop with categories, prices, and Robux / in-game currency support. Drops straight into StarterGui.",
    features: ["Category tabs", "Item grid with icons", "Buy confirmation modal", "Coins + Robux support", "DataStore-ready"],
    icon: ShoppingBag, accent: "from-emerald-500/25 to-emerald-500/5",
  },
  {
    slug: "inventory", name: "Inventory UI", category: "Player",
    description: "Grid-based inventory with drag-and-drop, item tooltips, rarity colors, and equip slots — matches every top Roblox RPG.",
    features: ["6×5 slot grid", "Drag & drop", "Rarity tint (Common → Mythic)", "Equip / consume actions", "Hotbar linkage"],
    icon: Package, accent: "from-indigo-500/25 to-indigo-500/5",
  },
  {
    slug: "leaderboard", name: "Leaderboard HUD", category: "HUD",
    description: "Sleek top-right leaderboard with player avatar, cash, level, and rank ribbon. Works with any leaderstats value.",
    features: ["Auto reads leaderstats", "Avatar + name + rank", "Top-3 gold/silver/bronze tint", "Collapse on mobile", "Zero configuration"],
    icon: Trophy, accent: "from-amber-500/25 to-amber-500/5",
  },
  {
    slug: "currency-hud", name: "Currency HUD", category: "HUD",
    description: "Compact coin / gem / robux counter with tween animation on value change and pickup toast popups.",
    features: ["Multi-currency (Coins, Gems, Robux)", "Animated count-up", "Pickup +N toast", "Bindable to any leaderstat", "Mobile-safe area"],
    icon: Coins, accent: "from-yellow-500/25 to-yellow-500/5",
  },
  {
    slug: "settings-menu", name: "Settings Menu", category: "System",
    description: "Modal settings panel with graphics quality, music / SFX sliders, controls hint, and reset. Auto-saves to the client.",
    features: ["Graphics quality selector", "Music + SFX sliders", "Controls diagram", "Keybind rebinding stub", "Local preferences save"],
    icon: SettingsIcon, accent: "from-slate-500/25 to-slate-500/5",
  },
  {
    slug: "main-menu", name: "Main Menu", category: "System",
    description: "Cinematic pre-play menu with Play / Shop / Codes / Settings, animated logo, and background camera pan. First impression sorted.",
    features: ["Animated title reveal", "Cinematic camera pan", "Play / Shop / Codes / Settings", "Music start on click", "Loading transition"],
    icon: Menu, accent: "from-fuchsia-500/25 to-fuchsia-500/5",
  },
  {
    slug: "quest-panel", name: "Quest Panel", category: "RPG",
    description: "Objective tracker with active + completed quests, progress bars, and reward preview — matches Blox Fruits / Anime Adventures style.",
    features: ["Active quest list", "Progress bars", "Reward preview (coin/exp/item)", "Quest turn-in modal", "NPC dialog hook"],
    icon: ScrollText, accent: "from-cyan-500/25 to-cyan-500/5",
  },
  {
    slug: "chat-bubble", name: "Custom Chat Bubbles", category: "Social",
    description: "Replace Roblox's default chat bubbles with rounded, colored bubbles that support emojis, VIP tags, and fade-out.",
    features: ["Rounded pill bubbles", "VIP / Owner color tags", "Emoji support", "Auto fade after 6s", "Team color option"],
    icon: MessageSquare, accent: "from-pink-500/25 to-pink-500/5",
  },
  {
    slug: "combat-hud", name: "Combat HUD", category: "RPG",
    description: "Health, mana, stamina bars with damage flash, low-HP pulse, and hotbar for 6 abilities with cooldown radials.",
    features: ["HP / MP / Stamina bars", "Damage flash + shake", "Low-HP red pulse", "6-slot ability hotbar", "Radial cooldown timers"],
    icon: Swords, accent: "from-rose-500/25 to-rose-500/5",
  },
  {
    slug: "pet-hud", name: "Pet HUD", category: "Simulator",
    description: "Equipped pet strip with rarity glow, boost multiplier, and quick-swap panel — the exact pattern Pet Simulator 99 uses.",
    features: ["Equipped pet slots", "Rarity glow (Common → Rainbow)", "Boost multiplier badge", "Quick swap side panel", "Hatch popup animation"],
    icon: Heart, accent: "from-purple-500/25 to-purple-500/5",
  },
  {
    slug: "team-select", name: "Team Select", category: "System",
    description: "Full-screen team picker with team colors, player counts, and description — perfect for PVP, mini-games, and roleplay hubs.",
    features: ["Team color cards", "Live player counts", "Team description", "Auto-balance option", "Spectator slot"],
    icon: Users, accent: "from-blue-500/25 to-blue-500/5",
  },
  {
    slug: "boost-timer", name: "Boost / Buff Timer", category: "HUD",
    description: "Vertical stack of active buffs with icon, remaining time bar, and stack count. Handles unlimited concurrent effects.",
    features: ["Auto-stack icons", "Countdown radial", "Stack count badge", "Expire fade-out", "Bindable to any effect system"],
    icon: Zap, accent: "from-orange-500/25 to-orange-500/5",
  },
];

const CATEGORIES = Array.from(new Set(UI_TEMPLATES.map((t) => t.category)));

const FAQ: { q: string; a: string }[] = [
  {
    q: "Are these Roblox UI templates free to use?",
    a: "Yes. Every template on this page is generated by BloxSmith and ships free — you can insert them into your Roblox Studio place and modify the Luau however you want, including for paid experiences.",
  },
  {
    q: "How do I add a template to Roblox Studio?",
    a: "Install the free BloxSmith Studio plugin, pair it with your account, and click the template. BloxSmith sends the ScreenGui plus supporting scripts straight into StarterGui — no manual copy-paste, no rbxm downloads.",
  },
  {
    q: "Do the UI templates work on mobile and console?",
    a: "Yes. Every layout uses UIScale + UIAspectRatioConstraint and safe-area padding, and every button has a tap-friendly minimum size (44×44 px) so it works on phones, tablets, Xbox, and PC.",
  },
  {
    q: "Can I edit the design after inserting a template?",
    a: "Absolutely. The templates ship as regular Instances — Frames, TextLabels, ImageLabels — so you can restyle them in Studio's UI editor or ask BloxSmith to recolor, reflow, or rewire them with a follow-up prompt.",
  },
  {
    q: "How is this different from downloading an rbxm?",
    a: "Downloaded rbxm models go stale. BloxSmith generates each UI live against your game — currency names, colors, item lists, and remotes are wired to systems that already exist in your place instead of dummy placeholders.",
  },
];

export const Route = createFileRoute("/templates/ui")({
  head: () => {
    const title = "Roblox UI Templates — Free ScreenGui, HUD & Menu Library | BloxSmith";
    const description =
      "Free library of Roblox UI templates: shop GUI, inventory, leaderboard, main menu, combat HUD, quest panel, pet HUD and more. One-click insert into Roblox Studio with the BloxSmith AI plugin.";
    const ogImage = "https://bloxsmith.pro/opengraph-image.png";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "keywords", content: "roblox ui templates, roblox ui, roblox gui templates, roblox ui library, roblox studio ui, roblox screengui, roblox hud, roblox menu templates" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: CANONICAL },
        { property: "og:type", content: "website" },
        { property: "og:image", content: ogImage },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [{ rel: "canonical", href: CANONICAL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                name: "Roblox UI Templates",
                description,
                url: CANONICAL,
              },
              {
                "@type": "ItemList",
                name: "Roblox UI Template Library",
                numberOfItems: UI_TEMPLATES.length,
                itemListElement: UI_TEMPLATES.map((t, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: `${t.name} — Roblox ${t.category} UI Template`,
                  description: t.description,
                  url: `${CANONICAL}#${t.slug}`,
                })),
              },
              {
                "@type": "FAQPage",
                mainEntity: FAQ.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://bloxsmith.pro/" },
                  { "@type": "ListItem", position: 2, name: "Templates", item: "https://bloxsmith.pro/templates" },
                  { "@type": "ListItem", position: 3, name: "UI Templates", item: CANONICAL },
                ],
              },
            ],
          }),
        },
      ],
    };
  },
  component: UITemplatesPage,
});

function UITemplatesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-slate-100" style={{ fontFamily: "Rubik, ui-sans-serif, system-ui" }}>
      {/* Header */}
      <header className="border-b border-white/5 bg-[#080818]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-bold tracking-wide">BLOXSMITH</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/docs" className="hidden rounded-lg px-3 py-2 text-slate-300 hover:bg-white/5 sm:inline-block">Docs</Link>
            <Link to="/auth" className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white hover:bg-indigo-400">Get BloxSmith Free</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(700px 300px at 30% 0%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(600px 260px at 80% 20%, rgba(217,70,239,0.14), transparent 60%)" }} />
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
            <Sparkles className="h-3.5 w-3.5" /> {UI_TEMPLATES.length} free templates · AI-generated
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Roblox UI Templates — free, live, and one-click into Studio
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            A curated library of production-ready Roblox UI templates: shop GUIs, inventories, leaderboards, main menus, combat HUDs, quest panels and more. Every template is generated by BloxSmith and installs straight into Roblox Studio with one click — no rbxm downloads, no dead placeholders.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-[0_12px_36px_-14px_rgba(99,102,241,0.8)] hover:bg-indigo-400">
              Start building free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/plugin" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]">
              Install the Studio Plugin
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-2 text-xs">
            {CATEGORIES.map((c) => (
              <li key={c}>
                <a href={`#cat-${c.toLowerCase()}`} className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-semibold text-slate-300 hover:bg-white/[0.06]">
                  {c}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Templates grid */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="mb-6 text-2xl font-bold">Every Roblox UI template in the library</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UI_TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <article
                key={t.slug}
                id={t.slug}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] transition hover:-translate-y-0.5 hover:border-indigo-400/30"
              >
                <UIPreview name={t.name} category={t.category} icon={Icon} accent={t.accent} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.category}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-white">{t.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t.description}</p>
                  <ul className="mt-3 space-y-1.5">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Free · Editable</span>
                    <Link
                      to="/auth"
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/25"
                    >
                      Insert to Studio <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-bold">How BloxSmith installs Roblox UI templates</h2>
        <p className="mt-2 max-w-2xl text-slate-400">Three steps from browsing this library to a working ScreenGui in your Roblox Studio place.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { n: "1", title: "Install the plugin", body: "Grab the free BloxSmith Studio plugin from the Roblox marketplace and paste your pairing token." },
            { n: "2", title: "Pick a UI template", body: "Choose any template above (Shop, Inventory, HUD, Main Menu…) — BloxSmith writes the Luau against your place." },
            { n: "3", title: "One-click insert", body: "The ScreenGui, RemoteEvents, and scripts land in StarterGui automatically. Restyle in Studio or ask BloxSmith to iterate." },
          ].map((s) => (
            <li key={s.n} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/15 text-sm font-bold text-indigo-200">{s.n}</span>
              <h3 className="mt-3 text-base font-bold text-white">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why BloxSmith */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-bold">Why AI-generated Roblox UI beats copying a template</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            { title: "Wired to your game, not a demo", body: "Every UI template references your existing leaderstats, remotes, and DataStore keys — no placeholder \"CoinValue\" that never updates." },
            { title: "Mobile + console safe by default", body: "UIScale, UIAspectRatioConstraint, and 44 px touch targets are baked in so your Roblox UI looks correct on phone, tablet, PC, and Xbox." },
            { title: "Editable Luau, not opaque rbxm", body: "You get plain LocalScripts and ModuleScripts. Restyle in Studio, or ask BloxSmith to recolor, reflow, or extend the UI in a follow-up prompt." },
            { title: "Free forever", body: "The whole BloxSmith UI template library is free. No paywalls, no watermarks, no attribution required — use it in monetized Roblox experiences too." },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <h3 className="text-base font-bold text-white">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-14">
        <h2 className="text-2xl font-bold">Roblox UI template FAQ</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-white/8 bg-white/[0.02] p-5 open:border-indigo-400/30">
              <summary className="cursor-pointer list-none text-base font-semibold text-white marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-indigo-300 transition group-open:rotate-45">＋</span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="flex flex-col items-start gap-4 rounded-3xl border border-white/8 bg-gradient-to-br from-indigo-500/15 via-white/[0.02] to-fuchsia-500/15 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="text-2xl font-bold">Build every UI in your Roblox game with AI</h2>
            <p className="mt-2 max-w-xl text-slate-300">Sign in free and BloxSmith writes ScreenGuis, HUDs, menus, and remotes straight into your Studio place — plus everything else your game needs.</p>
          </div>
          <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-[0_12px_36px_-14px_rgba(99,102,241,0.8)] hover:bg-indigo-400">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-[#080818] py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} BloxSmith · <Link to="/" className="underline hover:text-slate-300">Home</Link> · <Link to="/docs" className="underline hover:text-slate-300">Docs</Link>
      </footer>
    </div>
  );
}

/* Lightweight, brand-consistent visual preview of the UI template
   (no external image needed, ships as HTML for fast SSR + crawlability). */
function UIPreview({ name, category, icon: Icon, accent }: { name: string; category: string; icon: typeof Coins; accent: string }) {
  return (
    <div className={`relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br ${accent}`}>
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
        <Icon className="h-3.5 w-3.5" /> {name}
      </div>
      <div className="absolute bottom-4 right-4 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/80">{category}</div>
      <div className="absolute inset-x-6 bottom-10 flex gap-2">
        <div className="h-1.5 w-1/3 rounded-full bg-white/20" />
        <div className="h-1.5 w-1/4 rounded-full bg-white/10" />
        <div className="h-1.5 w-1/5 rounded-full bg-white/10" />
      </div>
    </div>
  );
}
