// Free referral system — invite friends, both get a credit boost.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("referral_code")
      .eq("id", context.userId)
      .single();
    const { data: mine } = await context.supabase
      .from("referrals")
      .select("referred_user_id,created_at")
      .eq("referrer_user_id", context.userId)
      .order("created_at", { ascending: false });

    const { data: incoming } = await context.supabase
      .from("referrals")
      .select("referrer_user_id, code, created_at")
      .eq("referred_user_id", context.userId)
      .maybeSingle();

    const rows = (mine ?? []).slice(0, 25);
    const ids = Array.from(new Set(rows.map((r: any) => r.referred_user_id).filter(Boolean)));
    let profiles: any[] = [];
    if (ids.length) {
      const { data: ps } = await context.supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids as string[]);
      profiles = ps ?? [];
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const recent = rows.map((r: any) => ({
      user_id: r.referred_user_id,
      created_at: r.created_at,
      username: byId.get(r.referred_user_id)?.username ?? null,
      display_name: byId.get(r.referred_user_id)?.display_name ?? null,
      avatar_url: byId.get(r.referred_user_id)?.avatar_url ?? null,
    }));

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekly = (mine ?? []).filter((r: any) => new Date(r.created_at).getTime() >= weekAgo).length;

    return {
      code: profile?.referral_code ?? null,
      count: (mine ?? []).length,
      weekly,
      recent,
      applied: !!incoming,
    };
  });

export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(24) }).parse(d))
  .handler(async ({ data, context }) => {
    // Look up the referrer profile by code.
    const { data: refProfile, error } = await context.supabase
      .from("profiles")
      .select("id,referral_code")
      .eq("referral_code", data.code.trim().toUpperCase())
      .single();
    if (error || !refProfile) throw new Error("Invalid referral code");
    if (refProfile.id === context.userId) throw new Error("You can't refer yourself.");

    const { error: insErr } = await context.supabase
      .from("referrals")
      .insert({
        referrer_user_id: refProfile.id,
        referred_user_id: context.userId,
        code: refProfile.referral_code ?? data.code,
      });
    if (insErr) {
      if (/duplicate|conflict/i.test(insErr.message)) throw new Error("You've already used a referral code.");
      throw new Error(insErr.message);
    }
    return { ok: true, referrer: refProfile.id };
  });
