import { createFileRoute } from "@tanstack/react-router";
import { SeoLanding, faqJsonLd, breadcrumbJsonLd, type SeoFaq } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/roblox-studio-ai-helper";
const FAQS: SeoFaq[] = [
  { q: "How do I get an AI helper in Roblox Studio?", a: "Install the free BloxSmith plugin from the Roblox creator store, sign in to bloxsmith.pro, and click Connect. Every prompt in BloxSmith ships scripts, GUIs, and models straight into your open place." },
  { q: "Is BloxSmith the same as Roblox's built-in AI assistant?", a: "No — BloxSmith is independent, works with any Studio setup, and generates complete multi-file systems (Scripts, LocalScripts, ModuleScripts, RemoteEvents, folders) instead of single snippets." },
  { q: "Does the Roblox Studio AI helper cost anything?", a: "No. Both the website and the Studio plugin are free. Unlimited generations, no trial, no credit card." },
  { q: "Can the AI helper edit my existing place?", a: "Yes. It can insert into any parent path you specify — ServerScriptService, StarterGui, ReplicatedStorage, Workspace — and it respects existing folder structure." },
  { q: "Does it work with Team Create?", a: "Yes. Everyone with the plugin sees the assets appear in real time as they land." },
];

export const Route = createFileRoute("/roblox-studio-ai-helper")({
  head: () => ({
    meta: [
      { title: "Roblox Studio AI Helper — Free AI Assistant Plugin | BloxSmith" },
      { name: "description", content: "The free Roblox Studio AI helper bot. Chat with AI, generate scripts, GUIs, and full systems, and watch them appear in Studio through the BloxSmith plugin. No cost, no signup wall." },
      { property: "og:title", content: "Roblox Studio AI Helper — Free AI Assistant Plugin" },
      { property: "og:description", content: "Free AI helper that builds directly inside Roblox Studio." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd(FAQS)) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "Roblox Studio AI Helper", url: URL },
      ])) },
    ],
  }),
  component: () => (
    <SeoLanding
      eyebrow="Roblox Studio AI Helper"
      h1="Roblox Studio AI helper — free plugin, unlimited builds"
      intro="BloxSmith is the free AI helper for Roblox Studio. Chat with it on the website, install the plugin once, and every asset the AI generates — scripts, GUIs, RemoteEvents, models — appears live in your open Studio place."
      bullets={[
        "Free plugin from the Roblox creator store",
        "Real-time inject into any service",
        "Works with Team Create",
        "Undo-safe — every insert is one undo",
        "Chat, autofix, scan, organize commands",
        "No trial, no credit card",
      ]}
      sections={[
        { h2: "How the plugin AI helper works", body: (
          <ol>
            <li>Install the free BloxSmith plugin from the Roblox creator store.</li>
            <li>Sign in on bloxsmith.pro (Google or email).</li>
            <li>In Studio, open the BloxSmith panel and click Connect — a one-time pairing.</li>
            <li>Type prompts on the website; scripts, GUIs, and models appear in your open place instantly.</li>
          </ol>
        )},
        { h2: "Commands the helper can run in Studio", body: (
          <ul>
            <li><strong>Scan</strong> — inspects your place and reports issues.</li>
            <li><strong>Autofix</strong> — repairs deprecated APIs and broken references.</li>
            <li><strong>Organize</strong> — moves scripts to the right services and cleans folders.</li>
            <li><strong>Build</strong> — inserts new systems (shop, tycoon plot, save data, etc.).</li>
          </ul>
        )},
        { h2: "Why creators pick BloxSmith over the built-in assistant", body: (
          <p>Roblox's built-in Studio AI writes one function at a time. BloxSmith plans the whole system, writes every script, wires RemoteEvents, and drops each file into the right service — one prompt, complete build.</p>
        )},
      ]}
      faqs={FAQS}
      relatedLinks={[
        { to: "/free-roblox-studio-ai", label: "Free Roblox Studio AI" },
        { to: "/roblox-script-generator", label: "Roblox script generator" },
        { to: "/ai-roblox-game-maker", label: "AI Roblox game maker" },
        { to: "/docs", label: "Install the Studio plugin" },
      ]}
    />
  ),
});
