import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", ["admin", "owner"]);
  if (error) throw new Error(error.message);
  const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
  if (!ok) throw new Error("Forbidden");
  return { supabaseAdmin };
}

export const auditReferralCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await requireAdmin(context);

    const [totalRes, withRes, missingRes, recentMissingRes, dupRes, sampleRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).not("referral_code", "is", null),
      supabaseAdmin.from("profiles").select("id, username, display_name, created_at").is("referral_code", null).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).is("referral_code", null).gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabaseAdmin.rpc as any,
      supabaseAdmin.from("profiles").select("id, username, referral_code, created_at").not("referral_code", "is", null).order("created_at", { ascending: false }).limit(5),
    ]);

    // duplicates check via raw fetch
    const { data: allCodes } = await supabaseAdmin.from("profiles").select("referral_code").not("referral_code", "is", null);
    const counts = new Map<string, number>();
    for (const r of allCodes ?? []) {
      const c = (r as any).referral_code as string;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([code, n]) => ({ code, count: n }));

    const total = totalRes.count ?? 0;
    const withCode = withRes.count ?? 0;
    const missing = missingRes.count ?? 0;
    const missingRecent24h = recentMissingRes.count ?? 0;

    return {
      generatedAt: new Date().toISOString(),
      total,
      withCode,
      missing,
      missingRecent24h,
      coveragePct: total === 0 ? 100 : Math.round((withCode / total) * 10000) / 100,
      backfillComplete: missing === 0,
      duplicates,
      missingProfiles: missingRes.data ?? [],
      sampleRecent: sampleRes.data ?? [],
    };
  });

export const backfillReferralCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await requireAdmin(context);
    const { data: missing, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .is("referral_code", null);
    if (error) throw new Error(error.message);

    let updated = 0;
    for (const row of missing ?? []) {
      const code = "BS" + Math.random().toString(36).slice(2, 10).toUpperCase();
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ referral_code: code })
        .eq("id", (row as any).id)
        .is("referral_code", null);
      if (!upErr) updated += 1;
    }
    return { attempted: missing?.length ?? 0, updated };
  });
