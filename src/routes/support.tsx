import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalShell } from "./terms";

const SUPPORT_FAQ = [
  {
    q: "Is BloxSmith really free?",
    a: "Yes — BloxSmith is 100% free to use. No credit card, no trial, no hidden caps. You can build, save, and export to Roblox Studio without paying.",
  },
  {
    q: "The Roblox Studio plugin won't connect.",
    a: "Make sure HTTP requests are enabled in Studio (Game Settings → Security → Allow HTTP Requests) and that you signed in to the same BloxSmith account inside the plugin. See the Docs for the full troubleshooting walkthrough.",
  },
  {
    q: "An AI model isn't responding or returns an error.",
    a: "Switch to a different model from the picker in the chat composer. If errors persist, the upstream provider may be rate-limited — wait a minute and try again, or let us know on Discord.",
  },
  {
    q: "How do I delete my BloxSmith account?",
    a: "Open Settings while signed in and use the Delete account action. This removes your profile, projects, and any cached data from our backend.",
  },
];

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — BloxSmith" },
      { name: "description", content: "Get help with BloxSmith: plugin issues, AI errors, account questions." },
      { property: "og:title", content: "BloxSmith Support" },
      { property: "og:description", content: "Help with plugin, AI, and account." },
      { property: "og:url", content: "https://bloxsmith.pro/support" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/support" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: SUPPORT_FAQ.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }),
      },
    ],
  }),
  component: () => (
    <LegalShell title="Support" updated="June 25, 2026">
      <p>Need help? Start here.</p>

      <h2>Common questions</h2>
      <ul>
        <li><strong>Is BloxSmith really free?</strong> Yes. Free to use, no credit card.</li>
        <li><strong>The plugin won't connect.</strong> See the troubleshooting section in <Link to="/docs" className="text-blue-400 hover:underline">Docs</Link>.</li>
        <li><strong>An AI model isn't responding.</strong> Switch models from the picker. If it persists, let us know.</li>
        <li><strong>I want to delete my account.</strong> Open Settings while signed in and use <em>Delete account</em>.</li>
      </ul>

      <h2>Get in touch</h2>
      <p>The fastest way to reach us is the <Link to="/contact" className="text-blue-400 hover:underline">Contact</Link> page. We typically reply within a few days.</p>

      <h2>Community</h2>
      <p>Join other BloxSmith builders on <a href="https://discord.gg/6QDYT3RUkv" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Discord</a>.</p>
    </LegalShell>
  ),
});
