// Public developer profile — /u/:username
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPublicProfile, BADGE_CATALOG, type PublicProfile } from "@/lib/public-profile.functions";
import { Award, Calendar, Code2, Gamepad2, Sparkles, Trophy, Wrench, Zap } from "lucide-react";

const profileQuery = (username: string) =>
  queryOptions({
    queryKey: ["public-profile", username],
    queryFn: () => getPublicProfile({ data: { username } }) as Promise<PublicProfile | null>,
  });

export const Route = createFileRoute("/u/$username")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(profileQuery(params.username));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.display_name || loaderData.username} — BloxSmith Developer` },
          { name: "description", content: loaderData.bio || `${loaderData.username}'s Roblox development profile on BloxSmith.` },
          { property: "og:title", content: `${loaderData.display_name || loaderData.username} — BloxSmith` },
          { property: "og:description", content: loaderData.bio || "BloxSmith developer profile" },
        ]
      : [{ title: "Profile not found — BloxSmith" }],
  }),
  errorComponent: () => (
    <div className="grid min-h-[60vh] place-items-center p-8 text-center">
      <div><h1 className="font-display text-2xl font-bold">Couldn&apos;t load this profile</h1><p className="mt-2 text-sm text-muted-foreground">Try again in a moment.</p></div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="grid min-h-[60vh] place-items-center p-8 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This developer profile is private or doesn&apos;t exist.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">← Back home</Link>
      </div>
    </div>
  ),
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const { data: p } = useSuspenseQuery(profileQuery(username));
  if (!p) return null;

  const initials = (p.display_name || p.username).slice(0, 2).toUpperCase();
  const joined = new Date(p.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" });

  const statItems = [
    { icon: Gamepad2, label: "Projects", value: p.stats.projects },
    { icon: Code2, label: "Scripts", value: p.stats.scripts_generated },
    { icon: Sparkles, label: "Assets", value: p.stats.assets_inserted },
    { icon: Wrench, label: "Fixes", value: p.stats.errors_fixed },
    { icon: Zap, label: "Playtests", value: p.stats.playtests },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header card */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-xl">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            {p.avatar_url ? (
              <img src={p.avatar_url} alt={p.username} className="h-24 w-24 rounded-2xl border-2 border-primary/30 object-cover shadow-lg" />
            ) : (
              <div className="grid h-24 w-24 place-items-center rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary to-accent text-3xl font-bold text-primary-foreground shadow-lg">
                {initials}
              </div>
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-3xl font-bold tracking-tight">{p.display_name || p.username}</h1>
                {p.plan !== "Free" && (
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {p.plan}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">@{p.username}</div>
              {p.bio && <p className="mt-3 max-w-lg text-sm leading-relaxed text-foreground/90">{p.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Joined {joined}</span>
                {p.roblox_username && (
                  <span className="inline-flex items-center gap-1"><Gamepad2 className="h-3.5 w-3.5" /> Roblox: {p.roblox_username}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {statItems.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
                <Icon className="h-4 w-4 text-primary" />
                <div className="mt-2 font-display text-2xl font-bold">{s.value}</div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Badges */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Badges</h2>
            <span className="text-xs text-muted-foreground">({p.badges.length})</span>
          </div>
          {p.badges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No badges yet — keep building!
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {p.badges.map((b) => {
                const meta = BADGE_CATALOG[b.badge_key] ?? { label: b.badge_key, description: "", emoji: "🏅" };
                return (
                  <div key={b.badge_key} className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
                    <div className="text-2xl">{meta.emoji}</div>
                    <div className="mt-2 text-sm font-semibold">{meta.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{meta.description}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Featured projects */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Recent Projects</h2>
          </div>
          {p.projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No public projects yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.projects.map((proj) => (
                <div key={proj.id} className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md">
                  <div className="font-semibold">{proj.name}</div>
                  {proj.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{proj.description}</div>}
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Updated {new Date(proj.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          Built on <Link to="/" className="text-primary hover:underline">BloxSmith</Link>
        </div>
      </div>
    </div>
  );
}
