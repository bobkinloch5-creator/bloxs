import { createFileRoute } from "@tanstack/react-router";

// Public referral leaderboard. Aggregates referrals via service role and
// returns only display-safe fields (username, display_name, avatar, count).
export const Route = createFileRoute("/api/public/leaderboard")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: refs, error } = await supabaseAdmin
            .from("referrals")
            .select("referrer_user_id")
            .limit(5000);
          if (error) throw new Error(error.message);

          const counts = new Map<string, number>();
          for (const r of refs ?? []) {
            const id = (r as any).referrer_user_id as string | null;
            if (!id) continue;
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
          const top = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25);
          if (top.length === 0) {
            return Response.json({ leaders: [], generated_at: new Date().toISOString() }, {
              headers: { "Cache-Control": "public, max-age=60" },
            });
          }

          const ids = top.map((t) => t[0]);
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", ids);
          const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
          const leaders = top.map(([id, count], i) => {
            const p: any = profMap.get(id) ?? {};
            return {
              rank: i + 1,
              user_id: id,
              username: p.username ?? null,
              display_name: p.display_name ?? p.username ?? "Builder",
              avatar_url: p.avatar_url ?? null,
              referrals: count,
            };
          });

          return Response.json({ leaders, generated_at: new Date().toISOString() }, {
            headers: { "Cache-Control": "public, max-age=60" },
          });
        } catch (e: any) {
          return Response.json({ leaders: [], error: e?.message ?? String(e) }, { status: 200 });
        }
      },
    },
  },
});
