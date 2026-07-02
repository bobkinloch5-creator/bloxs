import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — BloxSmith" },
      { name: "description", content: "BloxSmith Terms of Service. Read the rules for using our free AI Roblox game builder." },
      { property: "og:title", content: "Terms of Service — BloxSmith" },
      { property: "og:description", content: "The rules for using BloxSmith." },
          { property: "og:url", content: "https://bloxsmith.pro/terms" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return <LegalShell title="Terms of Service" updated="June 25, 2026">
    <p>This page is maintained by BloxSmith to answer common questions about using the BloxSmith service ("BloxSmith", "we", "us"). By creating an account or using BloxSmith, you agree to these Terms.</p>

    <h2>1. Who can use BloxSmith</h2>
    <p>You must be old enough to consent to Roblox's own Terms of Use. BloxSmith is not affiliated with, endorsed by, or sponsored by Roblox Corporation.</p>

    <h2>2. Your account</h2>
    <p>You're responsible for keeping your login credentials safe. One account per person — alt accounts created to bypass limits may be suspended.</p>

    <h2>3. Acceptable use</h2>
    <ul>
      <li>Do not use BloxSmith to generate hateful, harassing, sexual, or illegal content.</li>
      <li>Do not attempt to abuse, exploit, spam, or reverse-engineer the AI gateway or plugin.</li>
      <li>Do not use BloxSmith to violate Roblox's Terms of Use, Community Standards, or DMCA policy.</li>
    </ul>

    <h2>4. Your content</h2>
    <p>You keep ownership of game ideas, scripts, and projects you build with BloxSmith. By using the service, you grant us a limited license to store and process that content so the product can function.</p>

    <h2>5. AI output disclaimer</h2>
    <p>AI-generated scripts and assets may contain bugs, security issues, or errors. Review everything before publishing a game on Roblox. BloxSmith is not liable for issues in your published games.</p>

    <h2>6. Free service</h2>
    <p>BloxSmith is currently free. We may introduce optional paid features in the future. We will not silently charge existing free accounts.</p>

    <h2>7. Termination</h2>
    <p>We may suspend accounts that violate these Terms. You may delete your account at any time from Settings.</p>

    <h2>8. Changes</h2>
    <p>We may update these Terms. Material changes will be announced in-app. Continued use after a change means you accept it.</p>

    <h2>9. Contact</h2>
    <p>Questions? See <Link to="/contact" className="text-blue-400 hover:underline">Contact</Link>.</p>
  </LegalShell>;
}

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-slate-200">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-sm font-bold text-white hover:text-blue-300">← BloxSmith</Link>
          <div className="text-xs text-slate-500">Last updated {updated}</div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{title}</h1>
        <article className="prose prose-invert mt-8 max-w-none text-sm leading-relaxed text-slate-300 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mt-3 [&_li]:mt-1">
          {children}
        </article>
      </main>
    </div>
  );
}
