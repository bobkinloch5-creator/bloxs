import { createFileRoute } from "@tanstack/react-router";
import { SeoLanding, faqJsonLd, breadcrumbJsonLd, type SeoFaq } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/free-roblox-studio-ai";
const FAQS: SeoFaq[] = [
  { q: "Is there a truly free Roblox Studio AI?", a: "Yes — BloxSmith. Every core feature (script generation, UI generation, map generation, plugin, autofix) is free to use with no credit card." },
  { q: "How is it different from Roblox's built-in Assistant?", a: "BloxSmith builds complete systems — every Script, LocalScript, RemoteEvent, folder, and GUI wired together — instead of one snippet at a time. And it ships into your place through a plugin without copy-paste." },
  { q: "Do I need to install anything?", a: "One plugin: the free BloxSmith Studio plugin. It connects your Studio session to bloxsmith.pro so generated assets stream in automatically." },
];

export const Route = createFileRoute("/free-roblox-studio-ai")({
  head: () => ({
    meta: [
      { title: "Free Roblox Studio AI — 100% Free AI Assistant for Roblox | BloxSmith" },
      { name: "description", content: "Free Roblox Studio AI. Generate scripts, GUIs, maps, and full games with AI — zero cost, no credit card, ships straight into Studio through the BloxSmith plugin." },
      { property: "og:title", content: "Free Roblox Studio AI — 100% Free AI Assistant" },
      { property: "og:description", content: "The 100% free AI assistant for Roblox Studio." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd(FAQS)) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "Free Roblox Studio AI", url: URL },
      ])) },
    ],
  }),
  component: () => (
    <SeoLanding
      eyebrow="Free Roblox Studio AI"
      h1="The free AI assistant for Roblox Studio"
      intro="BloxSmith is a 100% free AI assistant that works with Roblox Studio. Describe what you need — a full game, a system, a UI, a script — and BloxSmith builds and ships it into your place. No paywall, no trial, no credit card."
      bullets={[
        "Free forever on all core features",
        "Works with any Roblox Studio place",
        "Full-system builds, not snippets",
        "Autofix + scan on every generation",
        "One-click plugin install",
      ]}
      sections={[
        { h2: "What you can build for free", body: (
          <ul>
            <li>Complete tycoons, obbys, simulators, and fighting games</li>
            <li>DataStore save systems, leaderstats, currency</li>
            <li>Combat and ability systems</li>
            <li>Shop, inventory, quest, and menu UIs</li>
            <li>Maps, spawns, checkpoints, teleporters</li>
          </ul>
        )},
      ]}
      faqs={FAQS}
      relatedLinks={[
        { to: "/ai-roblox-game-maker", label: "AI Roblox game maker" },
        { to: "/roblox-script-generator", label: "Roblox script generator" },
        { to: "/roblox-gui-maker", label: "Roblox GUI maker" },
      ]}
    />
  ),
});
