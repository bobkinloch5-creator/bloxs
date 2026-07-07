import { Link } from "@tanstack/react-router";
import { Zap, Check, ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export type SeoFaq = { q: string; a: string };

export type SeoLandingProps = {
  eyebrow: string;
  h1: string;
  intro: string;
  bullets: string[];
  sections: Array<{ h2: string; body: ReactNode }>;
  faqs: SeoFaq[];
  ctaLabel?: string;
  relatedLinks?: Array<{ to: string; label: string }>;
};

export function SeoLanding(p: SeoLandingProps) {
  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(217,70,239,0.12),transparent_55%)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 shadow-[0_0_22px_rgba(59,130,246,0.35)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-xl font-bold tracking-tight">BloxSmith</span>
        </Link>
        <Link
          to="/auth"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:brightness-110"
        >
          <Zap className="h-4 w-4" /> Start Free
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-300">{p.eyebrow}</p>
        <h1 className="mt-3 bg-gradient-to-br from-white via-white to-indigo-200 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
          {p.h1}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-300">{p.intro}</p>

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {p.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-200">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-3 text-sm font-bold shadow-lg shadow-indigo-500/30 hover:brightness-110"
          >
            <Zap className="h-4 w-4" /> {p.ctaLabel ?? "Start Building Free"}
          </Link>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold hover:bg-white/[0.08]"
          >
            Read the docs <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {p.sections.map((s) => (
          <section key={s.h2} className="mt-14">
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{s.h2}</h2>
            <div className="prose prose-invert mt-4 max-w-none text-slate-300">
              {s.body}
            </div>
          </section>
        ))}

        <section className="mt-14">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.03]">
            {p.faqs.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none text-base font-semibold text-white marker:hidden">
                  <span className="inline-block mr-2 transition group-open:rotate-90">▶</span>
                  {f.q}
                </summary>
                <p className="mt-3 pl-6 text-sm leading-relaxed text-slate-300">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {p.relatedLinks && p.relatedLinks.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-bold">Keep exploring</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {p.relatedLinks.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm hover:bg-white/[0.06]">
                    <span>{l.label}</span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-14 rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/15 via-sky-500/10 to-transparent p-8 text-center">
          <h2 className="text-2xl font-black">Build your Roblox game in minutes</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-300">100% free. No credit card. Works right inside Roblox Studio.</p>
          <Link
            to="/auth"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-bold text-slate-900 hover:bg-slate-100"
          >
            <Zap className="h-4 w-4" /> Start Building Free
          </Link>
        </section>
      </main>
    </div>
  );
}

export function faqJsonLd(faqs: SeoFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
