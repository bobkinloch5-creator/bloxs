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
      <p>We read every message. Choose the channel that fits.</p>

      <h2>General questions & support</h2>
      <p>Email: <a href="mailto:hello@bloxsmith.app" className="text-blue-400 hover:underline">hello@bloxsmith.app</a></p>

      <h2>Privacy & account requests</h2>
      <p>Email: <a href="mailto:privacy@bloxsmith.app" className="text-blue-400 hover:underline">privacy@bloxsmith.app</a></p>

      <h2>Community</h2>
      <p><a href="https://discord.gg/6QDYT3RUkv" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Discord server</a> — ask other builders, share what you're working on.</p>

      <p className="mt-8 text-xs text-slate-500">Email addresses above are placeholders that the project owner should replace before launch.</p>
    </LegalShell>
  ),
});
