// Free referral system — invite friends, both get a credit boost.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // profiles is intentionally locked down at the Data API grant layer, so
    // own referral reads must go through the server admin client and stay
    // scoped to the authenticated user here.
    let { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("referral_code")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    // Safety net: if the code is still null (older accounts / trigger race),
    // mint one now so the UI never sits on "loading…".
    if (!profile?.referral_code) {
      for (let attempt = 0; attempt < 5 && !profile?.referral_code; attempt += 1) {
        const gen = "BS" + Math.random().toString(36).slice(2, 10).toUpperCase();
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ referral_code: gen })
          .eq("id", ctx.userId)
          .is("referral_code", null)
          .select("referral_code")
          .maybeSingle();
        if (updateError && !/duplicate|unique/i.test(updateError.message)) throw new Error(updateError.message);
        if (updated?.referral_code) profile = updated;
      }

      if (!profile?.referral_code) {
        // Someone else beat us to it, or a unique-code retry lost the race — re-read.
        const { data: reread, error: rereadError } = await supabaseAdmin
          .from("profiles")
          .select("referral_code")
          .eq("id", ctx.userId)
          .maybeSingle();
        if (rereadError) throw new Error(rereadError.message);
        profile = reread ?? profile;
      }
    }

    const { data: mine } = await ctx.supabase
      .from("referrals")
      .select("referred_user_id,created_at")
      .eq("referrer_user_id", ctx.userId)
      .order("created_at", { ascending: false });

    const { data: incoming } = await ctx.supabase
      .from("referrals")
      .select("referrer_user_id, code, created_at")
      .eq("referred_user_id", ctx.userId)
      .maybeSingle();

    const rows = (mine ?? []).slice(0, 25);
    const ids = Array.from(new Set(rows.map((r: any) => r.referred_user_id).filter(Boolean)));
    let profiles: any[] = [];
    if (ids.length) {
      const { data: ps, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids as string[]);
      if (profilesError) throw new Error(profilesError.message);
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

// Bonus credits awarded to BOTH the referrer and the new referred user
// when a valid referral code is applied.
export const REFERRAL_BONUS_CREDITS = 25;

export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(24) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bonusCredits = 25;

    // Look up the referrer profile by code.
    const { data: refProfile, error } = await supabaseAdmin
      .from("profiles")
      .select("id,referral_code")
      .eq("referral_code", data.code.trim().toUpperCase())
      .maybeSingle();
    if (error || !refProfile) throw new Error("Invalid referral code");
    if (refProfile.id === ctx.userId) throw new Error("You can't refer yourself.");

    const { error: insErr } = await ctx.supabase
      .from("referrals")
      .insert({
        referrer_user_id: refProfile.id,
        referred_user_id: ctx.userId,
        code: refProfile.referral_code ?? data.code,
      });
    if (insErr) {
      if (/duplicate|conflict/i.test(insErr.message)) throw new Error("You've already used a referral code.");
      throw new Error(insErr.message);
    }

    // Grant bonus credits to BOTH sides. Bump max_credits so the extra credits
    // are not clipped by the daily reset, and top up current credits so the
    // reward is immediately usable. Owner/Unlimited plans skip the bump.
    async function grantBonus(uid: string) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("credits, max_credits, plan")
        .eq("id", uid)
        .maybeSingle();
      if (!p) return;
      const plan = (p as any).plan ?? "Free";
      if (plan === "Owner" || plan === "Unlimited") return;
      const newMax = Number(p.max_credits ?? 0) + bonusCredits;
      const newCredits = Number(p.credits ?? 0) + bonusCredits;
      await supabaseAdmin
        .from("profiles")
        .update({ credits: newCredits, max_credits: newMax })
        .eq("id", uid);
    }
    await Promise.all([grantBonus(refProfile.id), grantBonus(ctx.userId)]);

    return { ok: true, referrer: refProfile.id, bonus: bonusCredits };
  });

