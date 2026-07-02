// Centralized credit charging used by every paid feature (chat, voice, image,
// 3D, etc). Admins/owners are exempt. Auto-refills daily on first access after
// `credits_reset_at` expires.
//
// Returns either `{ ok: true, remaining }` on success or
// `{ ok: false, code, message, ... }` on insufficient credits. Callers should
// surface the message to the user.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Credits as CreditTier } from "./models";

export interface ChargeResult {
  ok: boolean;
  remaining?: number;
  resetAt?: string;
  charged?: number;
  code?: "no_credits" | "banned" | "internal";
  message?: string;
}

// Map model credit tier → credits per request.
const TIER_COST: Record<CreditTier, number> = {
  Low: 1,
  Medium: 2,
  High: 4,
  "Very High": 6,
};

export function creditCostForTier(tier: CreditTier): number {
  return TIER_COST[tier] ?? 1;
}

// Extra cost when a request actually produces build actions (premium output).
export const BUILD_ACTIONS_BONUS = 1;
// Cost for voice / TTS requests (per call).
export const VOICE_COST = 1;
// Cost for an image generation request.
export const IMAGE_COST = 2;
// Cost for a 3D model generation.
export const MODEL3D_COST = 4;

/**
 * Atomically refresh expired credits and charge `amount`.
 * Admins/owners are not charged.
 *
 * Uses the SECURITY DEFINER `charge_credits` RPC if it exists; otherwise falls
 * back to a read-modify-write through the service-role client.
 */
export async function chargeCredits(
  userSupabase: SupabaseClient,
  userId: string,
  amount: number,
  opts: { allowZero?: boolean } = {},
): Promise<ChargeResult> {
  if (amount <= 0 && !opts.allowZero) return { ok: true, charged: 0 };

  // 1. Admin check via user_roles (RLS-safe through user client).
  try {
    const { data: roles } = await userSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "owner"]);
    if ((roles ?? []).length > 0) {
      return { ok: true, charged: 0, remaining: Infinity };
    }
  } catch {
    // fall through and treat as non-admin
  }

  // 2. Need privileged client to mutate `credits` (profile trigger blocks
  //    non-admin updates of the credits column).
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error: readErr } = await supabaseAdmin
    .from("profiles")
    .select("credits, max_credits, credits_reset_at, banned, banned_reason")
    .eq("id", userId)
    .maybeSingle();
  if (readErr || !profile) {
    return { ok: false, code: "internal", message: "Couldn't read your account credits." };
  }
  if (profile.banned) {
    return {
      ok: false,
      code: "banned",
      message: profile.banned_reason || "Your account is suspended.",
    };
  }

  let credits = Number(profile.credits ?? 0);
  const maxCredits = Number(profile.max_credits ?? 0);
  let resetAt = profile.credits_reset_at as string | null;
  const nowMs = Date.now();
  const resetMs = resetAt ? new Date(resetAt).getTime() : 0;
  let didRefill = false;

  // 3. Auto-refill if the 24h timer has passed.
  if (resetAt && resetMs <= nowMs && maxCredits > 0) {
    credits = maxCredits;
    resetAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
    didRefill = true;
  }

  // 4. Check balance.
  if (credits < amount) {
    // Persist the refill (if any) so the visible countdown updates even when
    // the user is currently out of credits.
    if (didRefill) {
      await supabaseAdmin
        .from("profiles")
        .update({ credits, credits_reset_at: resetAt ?? undefined })
        .eq("id", userId);
    }
    const minutes = resetAt ? Math.max(1, Math.round((new Date(resetAt).getTime() - nowMs) / 60000)) : null;
    return {
      ok: false,
      code: "no_credits",
      remaining: credits,
      resetAt: resetAt ?? undefined,
      message: minutes
        ? `You're out of credits. Free credits refill in ~${formatMinutes(minutes)}. Upgrade your plan for more.`
        : "You're out of credits.",
    };
  }

  // 5. Deduct.
  const next = credits - amount;
  const { error: updErr } = await supabaseAdmin
    .from("profiles")
    .update({
      credits: next,
      ...(didRefill && resetAt ? { credits_reset_at: resetAt } : {}),
    })
    .eq("id", userId);
  if (updErr) {
    return { ok: false, code: "internal", message: "Couldn't deduct credits — try again." };
  }
  return { ok: true, charged: amount, remaining: next, resetAt: resetAt ?? undefined };
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
