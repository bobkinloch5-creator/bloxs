import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "./terms";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — BloxSmith" },
      { name: "description", content: "Get in touch with the BloxSmith team." },
      { property: "og:title", content: "Contact BloxSmith" },
      { property: "og:description", content: "Reach the BloxSmith team." },
          { property: "og:url", content: "https://bloxsmith.pro/contact" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/contact" }],
  }),
  component: () => (
    <LegalShell title="Contact" updated="June 25, 2026">
      <p>We read every message. The fastest way to reach us is our Discord community.</p>

      <h2>Community</h2>
      <p><a href="https://discord.gg/6QDYT3RUkv" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Discord server</a> — ask other builders, share what you're working on.</p>
    </LegalShell>
  ),
});
