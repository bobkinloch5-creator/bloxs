import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalShell } from "./terms";

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
