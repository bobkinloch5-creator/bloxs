import { createFileRoute } from "@tanstack/react-router";
import { SeoLanding, faqJsonLd, breadcrumbJsonLd, type SeoFaq } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/free-roblox-script-ai";
const FAQS: SeoFaq[] = [
  { q: "Is this Roblox script AI actually free?", a: "Yes. BloxSmith is 100% free — unlimited script generation, no credit card, no trial period, no watermarks. You keep every script you generate." },
  { q: "What kinds of Roblox scripts can I generate?", a: "Anything: kill bricks, teleporters, doors, save systems, leaderstats, admin commands, shops, gamepass handlers, combat, hitboxes, currency, custom chat, GUIs, boss AI, and full game systems." },
  { q: "Do I need a Roblox Studio plugin?", a: "Optional but recommended. The free BloxSmith plugin drops generated scripts directly into ServerScriptService / StarterPlayerScripts so you skip the copy-paste step." },
  { q: "Are the scripts safe to publish?", a: "Every script uses server-authoritative patterns, validates client input, wraps risky calls in pcall, and passes a validation pass before delivery. Safe for public games." },
  { q: "Can I use it on the free Roblox Studio?", a: "Yes. Roblox Studio itself is free and BloxSmith works with it end-to-end. You don't need Robux, Premium, or a paid plan." },
];

export const Route = createFileRoute("/free-roblox-script-ai")({
  head: () => ({
    meta: [
      { title: "Free Roblox Script AI — Generate Luau Scripts Free | BloxSmith" },
      { name: "description", content: "Generate free Roblox scripts with AI. Unlimited Luau scripts — kill bricks, DataStores, leaderstats, GUIs, combat, admin panels. 100% free, no credit card, ships into Studio." },
      { property: "og:title", content: "Free Roblox Script AI — Generate Luau Scripts Free" },
      { property: "og:description", content: "Unlimited AI Roblox scripts. Free, no signup wall, ships to Studio." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd(FAQS)) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "Free Roblox Script AI", url: URL },
      ])) },
    ],
  }),
  component: () => (
    <SeoLanding
      eyebrow="Free Roblox Script AI"
      h1="Free Roblox script AI — generate Luau in seconds"
      intro="BloxSmith is the free Roblox script AI creators use to skip boilerplate. Describe what you want — kill brick, save system, shop, combat, admin panel — and get production-ready Luau you can paste (or auto-inject) into Roblox Studio."
      bullets={[
        "100% free — unlimited generations",
        "Every Roblox script type supported",
        "Ships into Studio via plugin",
        "Autofix on legacy code",
        "Server-authoritative by default",
        "No signup wall to try",
      ]}
      sections={[
        { h2: "What you can generate for free", body: (
          <ul>
            <li>Kill bricks, damage parts, checkpoints, spawn logic</li>
            <li>DataStore save systems with retries and BindToClose</li>
            <li>Leaderstats, currency, XP + level curves</li>
            <li>Shops, inventories, gamepass integration, MarketplaceService</li>
            <li>Combat: sword hitboxes, ranged weapons, cooldowns, ragdoll</li>
            <li>GUIs: HUDs, menus, settings, notifications</li>
            <li>Admin commands, teleporters, custom chat, party systems</li>
          </ul>
        )},
        { h2: "Why free doesn't mean lower quality", body: (
          <p>BloxSmith runs an auto-critique + validation pass on every generated script. Missing services, deprecated APIs, unbound signals, and JSON-style tables get patched before the script reaches you.</p>
        )},
        { h2: "The Roblox Studio plugin — also free", body: (
          <p>Install once from the Roblox creator store. Click Connect. Every script BloxSmith generates lands in the right service in your open place. Undo, edit, republish — you own the code.</p>
        )},
      ]}
      faqs={FAQS}
      relatedLinks={[
        { to: "/roblox-script-generator", label: "Roblox script generator" },
        { to: "/best-roblox-ai-scripter", label: "Best Roblox AI scripter" },
        { to: "/free-roblox-studio-ai", label: "Free Roblox Studio AI" },
        { to: "/guides/how-to-script-in-roblox-with-ai", label: "Guide: How to script in Roblox with AI" },
      ]}
    />
  ),
});
