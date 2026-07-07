import { createFileRoute } from "@tanstack/react-router";
import { SeoLanding, faqJsonLd, breadcrumbJsonLd, type SeoFaq } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/ai-roblox-game-maker";
const FAQS: SeoFaq[] = [
  { q: "Is the AI Roblox game maker really free?", a: "Yes. BloxSmith is 100% free to use. You describe your game, the AI generates scripts, GUIs, and maps, and the Roblox Studio plugin drops them into your place. No credit card, no trial." },
  { q: "Do I need to know Lua to use BloxSmith?", a: "No. You describe the game in plain English (or any language) and BloxSmith writes production-ready Luau for you — server scripts, LocalScripts, ModuleScripts, RemoteEvents, and folder structure included." },
  { q: "How does the Roblox Studio plugin work?", a: "Install the free BloxSmith plugin from the Roblox creator store, click Connect once, and every asset the AI generates streams directly into your open place — scripts into ServerScriptService, GUIs into StarterGui, models into Workspace." },
  { q: "Can BloxSmith build a full game or just parts of it?", a: "Both. Ask for a complete tycoon, obby, simulator, or combat game and BloxSmith wires up every system. Or ask for a single leaderboard, shop, or ability and it drops that in without touching the rest." },
  { q: "Will the code work on real Roblox Studio?", a: "Yes. Every script uses modern Luau, server-authoritative multiplayer patterns, and passes an autofix + scan pass before delivery. It runs as soon as it lands in Studio." },
];

export const Route = createFileRoute("/ai-roblox-game-maker")({
  head: () => ({
    meta: [
      { title: "AI Roblox Game Maker — Build Roblox Games with AI (Free) | BloxSmith" },
      { name: "description", content: "The free AI Roblox game maker. Describe your idea, BloxSmith writes Luau scripts, GUIs, and maps and sends them straight into Roblox Studio. No coding required." },
      { property: "og:title", content: "AI Roblox Game Maker — Build Roblox Games with AI (Free)" },
      { property: "og:description", content: "Describe your idea. AI writes the scripts, GUIs, and maps. Ships into Roblox Studio in seconds." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd(FAQS)) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "AI Roblox Game Maker", url: URL },
      ])) },
    ],
  }),
  component: () => (
    <SeoLanding
      eyebrow="AI Roblox Game Maker"
      h1="Build Roblox games with AI — free, no coding"
      intro="BloxSmith is the free AI Roblox game maker built for Roblox Studio. Describe the game you want in plain English and BloxSmith generates Luau scripts, GUIs, maps, and multiplayer systems — then drops them straight into your Studio place through the official plugin."
      bullets={[
        "100% free — no trials, no credit card",
        "Generates modern Luau (server + client + modules)",
        "Ships into Roblox Studio via the plugin",
        "Builds full games or single systems",
        "Server-authoritative multiplayer out of the box",
        "Autofix + scan pass on every build",
      ]}
      sections={[
        { h2: "How the AI game maker works", body: (
          <>
            <p>Type an idea like <em>"a tycoon where players build cyberpunk cafés with a robot barista"</em>. BloxSmith plans the systems, writes every script, generates the UI, arranges the map, and sends it all into Studio.</p>
            <ol>
              <li><strong>Describe.</strong> One sentence or a full spec — both work.</li>
              <li><strong>Plan.</strong> The AI breaks it into systems (economy, save data, UI, gameplay).</li>
              <li><strong>Build.</strong> Scripts, GUIs, RemoteEvents, folders — all created.</li>
              <li><strong>Ship.</strong> The plugin drops it into your open Roblox Studio place.</li>
            </ol>
          </>
        )},
        { h2: "What kind of Roblox games can you make?", body: (
          <>
            <p>Tycoons, obbys, simulators, fighting games, horror maps, racing circuits, RPGs, tower defense, roleplay hangouts — anything you can describe. BloxSmith has shipped every major Roblox genre.</p>
          </>
        )},
        { h2: "Why creators pick BloxSmith over other AI tools", body: (
          <ul>
            <li><strong>Roblox-native.</strong> Built for Luau and Studio, not generic code.</li>
            <li><strong>Complete solutions.</strong> No half-finished snippets — every RemoteEvent, folder, and dependency ships together.</li>
            <li><strong>Free forever.</strong> No paywall on core features.</li>
          </ul>
        )},
      ]}
      faqs={FAQS}
      relatedLinks={[
        { to: "/roblox-script-generator", label: "Roblox script generator" },
        { to: "/roblox-gui-maker", label: "Roblox GUI maker" },
        { to: "/guides/how-to-make-a-roblox-tycoon", label: "Guide: How to make a Roblox tycoon" },
        { to: "/templates/ui", label: "Free UI templates" },
      ]}
    />
  ),
});
