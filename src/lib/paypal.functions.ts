import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface TopUpPack {
  id: "starter" | "pro" | "mega" | "ultimate";
  name: string;
  credits: number;
  priceUsd: number;
  popular?: boolean;
  badge?: string;
}

export const TOP_UP_PACKS: TopUpPack[] = [
  {
    id: "starter",
    name: "Starter Top-Up",
    credits: 100,
    priceUsd: 1.99,
    badge: "100 Credits • Bargain",
  },
  {
    id: "pro",
    name: "Pro Top-Up",
    credits: 350,
    priceUsd: 4.99,
    popular: true,
    badge: "350 Credits • Most Popular",
  },
  {
    id: "mega",
    name: "Mega Top-Up",
    credits: 850,
    priceUsd: 9.99,
    badge: "850 Credits • Best Value",
  },
  {
    id: "ultimate",
    name: "Ultimate Studio Top-Up",
    credits: 2000,
    priceUsd: 19.99,
    badge: "2,000 Credits • Studio Bundle",
  },
];

/**
 * Instantly credit account upon successful PayPal checkout.
 */
export const addCreditsFromPayPal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      packId: z.enum(["starter", "pro", "mega", "ultimate"]),
      paypalOrderId: z.string().min(1).max(200),
      paypalPayerId: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pack = TOP_UP_PACKS.find((p) => p.id === data.packId);
    if (!pack) throw new Error("Invalid top-up pack selected.");

    const { data: profile, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("credits, max_credits")
      .eq("id", ctx.userId)
      .maybeSingle();

    if (readErr || !profile) throw new Error("Could not find user profile.");

    const currentCredits = Number(profile.credits ?? 0);
    const newCredits = currentCredits + pack.credits;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ credits: newCredits } as never)
      .eq("id", ctx.userId)
      .select("credits, max_credits")
      .single();

    if (updateErr) throw new Error("Failed to update credit balance.");

    // Log transaction
    try {
      await supabaseAdmin
        .from("donation_claims")
        .insert({
          user_id: ctx.userId,
          paypal_reference: `PAYPAL_${data.paypalOrderId}`,
          amount_note: `PayPal Top-Up: ${pack.name} ($${pack.priceUsd.toFixed(2)} for +${pack.credits} Credits)`,
          status: "approved",
          admin_note: `Auto-credited +${pack.credits} credits via PayPal Top-Up`,
        } as never);
    } catch {}

    return {
      success: true,
      creditsAdded: pack.credits,
      totalCredits: updated.credits,
      packName: pack.name,
    };
  });

/**
 * Submit manual PayPal.me top-up claim for admin verification.
 */
export const submitPayPalTopUpClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      paypalReference: z.string().min(3, "Please provide your PayPal Transaction ID or Email").max(200),
      packId: z.enum(["starter", "pro", "mega", "ultimate"]),
      note: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pack = TOP_UP_PACKS.find((p) => p.id === data.packId);
    if (!pack) throw new Error("Invalid top-up pack.");

    const { data: claim, error } = await supabaseAdmin
      .from("donation_claims")
      .insert({
        user_id: ctx.userId,
        paypal_reference: data.paypalReference.trim(),
        amount_note: `PayPal Top-Up Claim: ${pack.name} ($${pack.priceUsd.toFixed(2)} for +${pack.credits} Credits)${data.note ? ` — Note: ${data.note}` : ""}`,
        status: "pending",
      } as never)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, claim, packName: pack.name };
  });
