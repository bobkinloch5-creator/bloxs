import { createFileRoute } from "@tanstack/react-router";
import { SeoLanding, faqJsonLd, breadcrumbJsonLd, type SeoFaq } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/ai-roblox-map-generator";
const FAQS: SeoFaq[] = [
  { q: "Can AI really design a Roblox map?", a: "Yes. BloxSmith arranges Parts, terrain, spawns, and props based on your description — obby courses, tycoon plots, arenas, lobbies, dungeons — and ships the whole layout into Workspace through the Studio plugin." },
  { q: "Is the AI Roblox map generator free?", a: "Yes. 100% free with unlimited generations. No credit card, no trial." },
  { q: "How detailed can the maps get?", a: "You can go from a rough sketch (\"5 lobby platforms with a fountain in the middle\") to full mini-games (\"20-stage obby with rotating platforms, lava rivers, and checkpoints every 4 stages\")." },
  { q: "Does it use Roblox terrain or Parts?", a: "Both. BloxSmith uses Parts for gameplay geometry that needs precise collisions and can call terrain generation for organic landscapes when you ask for hills, water, or forests." },
  { q: "Can I edit the generated map afterwards?", a: "Yes. Everything is standard Roblox instances — Parts, MeshParts, terrain — and you can move, group, or delete anything after it lands in Studio." },
];

export const Route = createFileRoute("/ai-roblox-map-generator")({
  head: () => ({
    meta: [
      { title: "AI Roblox Map Generator — Free Map Design AI | BloxSmith" },
      { name: "description", content: "Design Roblox maps with AI for free. Describe the layout — obby, arena, lobby, dungeon — and BloxSmith arranges parts, terrain, spawns, and props directly in Roblox Studio." },
      { property: "og:title", content: "AI Roblox Map Generator — Free Map Design AI" },
      { property: "og:description", content: "Free AI Roblox map designer. Ships full layouts into Studio." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd(FAQS)) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "AI Roblox Map Generator", url: URL },
      ])) },
    ],
  }),
  component: () => (
    <SeoLanding
      eyebrow="AI Roblox Map Generator"
      h1="AI Roblox map generator — free map design in Studio"
      intro="BloxSmith is the free AI Roblox map generator. Describe a lobby, obby, arena, or dungeon and BloxSmith arranges parts, terrain, spawns, and props inside your open Roblox Studio place — no manual placement, no asset hunting."
      bullets={[
        "100% free — unlimited maps",
        "Obbys, arenas, lobbies, dungeons, tycoon plots",
        "Roblox terrain + parts",
        "Spawns, checkpoints, and props placed automatically",
        "Ships into Workspace via plugin",
        "Fully editable after generation",
      ]}
      sections={[
        { h2: "What kinds of Roblox maps you can generate", body: (
          <ul>
            <li>Obby courses with checkpoints and moving parts</li>
            <li>PvP arenas with cover, spawns, and killzones</li>
            <li>Lobbies with portals to mini-games</li>
            <li>Tycoon plots with dropper and building zones</li>
            <li>Dungeons and horror maps with lighting cues</li>
            <li>Racing tracks with waypoints</li>
          </ul>
        )},
        { h2: "From prompt to map in three steps", body: (
          <ol>
            <li>Describe the map in plain English.</li>
            <li>BloxSmith plans the layout — dimensions, spawns, gameplay flow.</li>
            <li>The Studio plugin places every part directly in Workspace.</li>
          </ol>
        )},
        { h2: "Design tips that make AI maps great", body: (
          <ul>
            <li>Include vibe words ("neon cyberpunk", "cozy medieval", "sci-fi minimal").</li>
            <li>Give dimensions when they matter ("100×100 plot", "20 obby stages").</li>
            <li>Name gameplay features ("mid-map power-up", "sniper tower on north hill").</li>
          </ul>
        )},
      ]}
      faqs={FAQS}
      relatedLinks={[
        { to: "/ai-roblox-game-maker", label: "AI Roblox game maker" },
        { to: "/roblox-gui-maker", label: "Roblox GUI maker" },
        { to: "/guides/how-to-make-a-roblox-obby", label: "Guide: How to make a Roblox obby" },
        { to: "/templates/ui", label: "Free UI templates" },
      ]}
    />
  ),
});
