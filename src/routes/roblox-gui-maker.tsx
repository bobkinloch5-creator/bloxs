import { createFileRoute } from "@tanstack/react-router";
import { SeoLanding, faqJsonLd, breadcrumbJsonLd, type SeoFaq } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/roblox-gui-maker";
const FAQS: SeoFaq[] = [
  { q: "Is the Roblox GUI maker free?", a: "Yes. Generate unlimited ScreenGuis, HUDs, shops, inventories, and menus for free. No watermark, no export limit." },
  { q: "Does it generate the ScreenGui and LocalScripts?", a: "Yes. BloxSmith creates the ScreenGui, every Frame / TextButton / ImageLabel, and the LocalScript that drives it — mobile-safe and controller-ready." },
  { q: "Can I edit the UI after it's generated?", a: "Absolutely. Everything lands in StarterGui as real Roblox instances — tweak colors, size, and layout in Studio like any hand-built UI." },
  { q: "Will it look good on mobile?", a: "Yes. BloxSmith uses UIAspectRatioConstraint, UIListLayout, and safe areas so the UI scales cleanly on phone, tablet, PC, and console." },
];

export const Route = createFileRoute("/roblox-gui-maker")({
  head: () => ({
    meta: [
      { title: "Roblox GUI Maker — Free AI UI Generator for Roblox Studio | BloxSmith" },
      { name: "description", content: "Free AI Roblox GUI maker. Generate shops, inventories, HUDs, and menus in seconds — mobile-safe ScreenGuis dropped straight into Roblox Studio." },
      { property: "og:title", content: "Roblox GUI Maker — Free AI UI Generator" },
      { property: "og:description", content: "AI-generated Roblox UI: shops, HUDs, inventories, menus. Ships into Studio." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd(FAQS)) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "Roblox GUI Maker", url: URL },
      ])) },
    ],
  }),
  component: () => (
    <SeoLanding
      eyebrow="Roblox GUI Maker"
      h1="Free AI Roblox GUI maker — shops, HUDs, menus in seconds"
      intro="BloxSmith is the AI-powered Roblox GUI maker. Describe the UI you want, get a fully-built ScreenGui with layout, styling, animations, and a LocalScript — dropped straight into StarterGui."
      bullets={[
        "Ready-made shops, inventories, HUDs, menus",
        "Mobile + console safe (aspect ratio constraints)",
        "Animated tweens + hover states",
        "Real Roblox instances — edit in Studio anytime",
        "Fully free, no watermark",
        "Delivered by the BloxSmith plugin",
      ]}
      sections={[
        { h2: "Popular UI templates", body: (
          <ul>
            <li>Shop GUI with categories, prices, Robux + coins</li>
            <li>Grid inventory with drag-and-drop and rarity tint</li>
            <li>Currency HUD with animated count-up</li>
            <li>Main menu with cinematic camera pan</li>
            <li>Settings menu with graphics + audio sliders</li>
            <li>Quest tracker matching Blox Fruits / Anime Adventures style</li>
          </ul>
        )},
      ]}
      faqs={FAQS}
      relatedLinks={[
        { to: "/templates/ui", label: "Browse all UI templates" },
        { to: "/ai-roblox-game-maker", label: "AI Roblox game maker" },
        { to: "/roblox-script-generator", label: "Roblox script generator" },
      ]}
    />
  ),
});
