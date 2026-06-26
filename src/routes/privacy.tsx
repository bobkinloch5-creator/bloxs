import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalShell } from "./terms";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — BloxSmith" },
      { name: "description", content: "How BloxSmith collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — BloxSmith" },
      { property: "og:description", content: "How we handle your data." },
          { property: "og:url", content: "https://bloxsmith.pro/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/privacy" }],
  }),
  component: () => (
    <LegalShell title="Privacy Policy" updated="June 25, 2026">
      <p>This page is maintained by BloxSmith to explain what data we collect and why. We aim to collect as little as possible to make the product work.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> email and a chosen username when you sign up (via email/password or Google/Apple sign-in).</li>
        <li><strong>Projects:</strong> Roblox project names, chat messages with the AI, generated scripts, and queued plugin actions.</li>
        <li><strong>Usage:</strong> credit balance, AI model selection, plugin connection status.</li>
      </ul>

      <h2>What we don't collect</h2>
      <ul>
        <li>We don't sell your data.</li>
        <li>We don't use your projects or prompts to train third-party models.</li>
      </ul>

      <h2>Where data lives</h2>
      <p>Account data and projects are stored in our managed Postgres database (via Lovable Cloud). AI chat requests are routed through the non-Lovable provider gateway shown in the model picker.</p>

      <h2>Cookies</h2>
      <p>We use a small number of cookies / local storage entries to keep you signed in. No third-party advertising trackers.</p>

      <h2>Your rights</h2>
      <p>You can delete your account from Settings at any time. Deleting your account removes your profile, projects, and chat history.</p>

      <h2>Children</h2>
      <p>BloxSmith is not directed at children under 13. If you believe a child has created an account, contact us and we will remove it.</p>

      <h2>Contact</h2>
      <p>Privacy questions: <Link to="/contact" className="text-blue-400 hover:underline">Contact</Link>.</p>
    </LegalShell>
  ),
});
