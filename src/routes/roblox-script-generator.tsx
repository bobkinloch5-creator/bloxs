import { createFileRoute } from "@tanstack/react-router";
import { SeoLanding, faqJsonLd, breadcrumbJsonLd, type SeoFaq } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/roblox-script-generator";
const FAQS: SeoFaq[] = [
  { q: "Is BloxSmith a free Roblox script generator?", a: "Yes. Generate unlimited Luau scripts for free — server Scripts, LocalScripts, and ModuleScripts. No login gates on the AI." },
  { q: "What kinds of Roblox scripts can it generate?", a: "Combat systems, DataStore save/load, leaderstats, admin commands, teleporters, shops, quests, pet systems, tools, GUIs, RemoteEvents — anything you can describe in Luau." },
  { q: "Are the scripts safe and up to date?", a: "Every script uses modern Luau, task.wait instead of legacy wait, typed remotes, and server-authoritative patterns. An autofix + scan pass runs before delivery." },
  { q: "Can I paste the scripts into my own game?", a: "Yes. You can copy them from BloxSmith or let the plugin insert them into the right service (ServerScriptService, StarterPlayerScripts, ReplicatedStorage) automatically." },
  { q: "Does it write ModuleScripts and RemoteEvents too?", a: "Yes. BloxSmith builds the full graph — Scripts, LocalScripts, ModuleScripts, RemoteEvents, RemoteFunctions, and the folders they live in." },
];

export const Route = createFileRoute("/roblox-script-generator")({
  head: () => ({
    meta: [
      { title: "Roblox Script Generator — Free AI Luau Scripts | BloxSmith" },
      { name: "description", content: "Free AI Roblox script generator. Type what you need, get production-ready Luau — Scripts, LocalScripts, ModuleScripts, and RemoteEvents delivered into Roblox Studio." },
      { property: "og:title", content: "Roblox Script Generator — Free AI Luau Scripts" },
      { property: "og:description", content: "Describe a system, get modern Luau scripts in seconds." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd(FAQS)) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "Roblox Script Generator", url: URL },
      ])) },
    ],
  }),
  component: () => (
    <SeoLanding
      eyebrow="Roblox Script Generator"
      h1="Free AI Roblox script generator for Luau"
      intro="BloxSmith writes Roblox scripts for you. Describe the system — a save function, a combat move, a shop, a leaderboard — and get clean, modern Luau you can drop into Roblox Studio right now."
      bullets={[
        "Server Scripts, LocalScripts, ModuleScripts",
        "RemoteEvents + RemoteFunctions wired up",
        "DataStore, ProfileService, save-safe patterns",
        "Free — no per-script paywall",
        "Autofixed + scanned before delivery",
        "Ships into Studio through the plugin",
      ]}
      sections={[
        { h2: "Popular Roblox scripts creators generate", body: (
          <ul>
            <li>DataStore save/load with retry</li>
            <li>leaderstats + currency tracking</li>
            <li>Sword, gun, ability, and combo systems</li>
            <li>Teleporters, checkpoints, spawn logic</li>
            <li>Admin commands and moderator tools</li>
            <li>Pet systems, tool giver, inventory</li>
            <li>Round-based game loops</li>
            <li>Shop, gamepass, developer product handlers</li>
          </ul>
        )},
        { h2: "Modern Luau, not outdated code", body: (
          <p>BloxSmith writes today's Luau: <code>task.wait</code>, typed variables, <code>:GetPropertyChangedSignal</code>, buffer where it matters. No <code>wait()</code>, no deprecated APIs, no free-model spaghetti.</p>
        )},
      ]}
      faqs={FAQS}
      relatedLinks={[
        { to: "/ai-roblox-game-maker", label: "AI Roblox game maker" },
        { to: "/roblox-gui-maker", label: "Roblox GUI maker" },
        { to: "/guides/how-to-script-in-roblox-with-ai", label: "Guide: How to script in Roblox with AI" },
      ]}
    />
  ),
});
