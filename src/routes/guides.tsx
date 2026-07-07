import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Zap, ArrowRight, BookOpen } from "lucide-react";
import { ALL_GUIDES } from "./guides.$slug";
import { breadcrumbJsonLd } from "@/components/SeoLanding";

const URL = "https://bloxsmith.pro/guides";

export const Route = createFileRoute("/guides")({
  head: () => ({
    meta: [
      { title: "Roblox Game Dev Guides — Build with AI | BloxSmith" },
      { name: "description", content: "Practical guides for making Roblox games with AI — tycoons, obbys, scripting, DataStore, UI. Free tutorials from BloxSmith." },
      { property: "og:title", content: "Roblox Game Dev Guides — Build with AI" },
      { property: "og:description", content: "Free step-by-step guides to build Roblox games with AI." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([
        { name: "Home", url: "https://bloxsmith.pro/" },
        { name: "Guides", url: URL },
      ])) },
    ],
  }),
  component: GuidesIndex,
});

function GuidesIndex() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.18),transparent_55%)]" />
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-xl font-bold">BloxSmith</span>
        </Link>
        <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-semibold">
          <Zap className="h-4 w-4" /> Start Free
        </Link>
      </header>
      <main className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-300">Guides</p>
        <h1 className="mt-3 bg-gradient-to-br from-white via-white to-indigo-200 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
          Build Roblox games with AI — free guides
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Step-by-step tutorials for making Roblox games with BloxSmith. Every guide is written for real Roblox Studio and uses modern Luau.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {ALL_GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                to="/guides/$slug"
                params={{ slug: g.slug }}
                className="group block h-full rounded-xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-indigo-400/40 hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
                  <BookOpen className="h-3.5 w-3.5" /> {g.readMinutes} min read
                </div>
                <h2 className="mt-3 text-xl font-bold text-white group-hover:text-indigo-100">{g.title}</h2>
                <p className="mt-2 text-sm text-slate-300">{g.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-300">
                  Read guide <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
