import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function callerIsAdmin(supabase: any, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "owner"]);
  if (error) throw new Error(error.message);
  return (data ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
}

export const submitDonationClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { paypalReference: string; amountNote?: string }) => {
    const ref = (data?.paypalReference ?? "").trim();
    if (ref.length < 3 || ref.length > 200) throw new Error("Enter a valid PayPal reference (transaction ID, email, or note).");
    const note = (data?.amountNote ?? "").trim().slice(0, 300);
    return { paypalReference: ref, amountNote: note };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error, data: row } = await ctx.supabase
      .from("donation_claims")
      .insert({
        user_id: ctx.userId,
        paypal_reference: data.paypalReference,
        amount_note: data.amountNote || null,
      })
      .select("id, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listMyDonationClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data, error } = await ctx.supabase
      .from("donation_claims")
      .select("id, paypal_reference, amount_note, status, admin_note, created_at, decided_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await ctx.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId);
    const isDonator = (roles ?? []).some((r: any) => r.role === "donator");
    return { claims: data ?? [], isDonator };
  });

export const listPendingDonationClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    if (!(await callerIsAdmin(ctx.supabase, ctx.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("donation_claims")
      .select("id, user_id, paypal_reference, amount_note, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    let profilesById: Record<string, { username: string | null; display_name: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username, display_name")
        .in("id", userIds);
      profilesById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { username: p.username, display_name: p.display_name }]));
    }
    return { claims: (data ?? []).map((r: any) => ({ ...r, profile: profilesById[r.user_id] ?? null })) };
  });

export const decideDonationClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; approve: boolean; note?: string; customCreditAmount?: number }) => {
    if (!data?.id) throw new Error("Missing id");
    return {
      id: data.id,
      approve: !!data.approve,
      note: (data.note ?? "").trim().slice(0, 300),
      customCreditAmount: typeof data.customCreditAmount === "number" ? data.customCreditAmount : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    if (!(await callerIsAdmin(ctx.supabase, ctx.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: claim, error: cErr } = await supabaseAdmin
      .from("donation_claims")
      .select("id, user_id, status, amount_note")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!claim) throw new Error("Claim not found");

    const newStatus = data.approve ? "approved" : "rejected";
    const { error: uErr } = await supabaseAdmin
      .from("donation_claims")
      .update({
        status: newStatus,
        admin_note: data.note || null,
        decided_by: ctx.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    if (data.approve) {
      // 1. Assign donator role
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: claim.user_id, role: "donator" }, { onConflict: "user_id,role" });

      // 2. Parse credits to grant from amount_note (e.g. "+350 Credits" -> 350)
      let grantAmount = data.customCreditAmount ?? 100;
      if (data.customCreditAmount === undefined && claim.amount_note) {
        const match = claim.amount_note.match(/\+\s*([\d,]+)\s*Credits/i);
        if (match && match[1]) {
          const parsed = parseInt(match[1].replace(/,/g, ""), 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            grantAmount = parsed;
          }
        }
      }

      // 3. Grant credits to profile balance
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("credits, max_credits, settings, plan")
        .eq("id", claim.user_id)
        .maybeSingle();

      if (prof) {
        const currentCredits = Number(prof.credits ?? 0);
        const currentMax = Number(prof.max_credits ?? 50);
        const newCredits = currentCredits + grantAmount;
        const newMax = Math.max(currentMax, newCredits);
        const existingSettings = (prof.settings && typeof prof.settings === "object" ? prof.settings : {}) as Record<string, unknown>;

        const updatePayload: Record<string, unknown> = {
          credits: newCredits,
          max_credits: newMax,
          settings: { ...existingSettings, has_topup: true },
        };
        if ((prof as any).plan !== "Owner") {
          updatePayload.plan = "Top Supporter";
        }

        await supabaseAdmin
          .from("profiles")
          .update(updatePayload as never)
          .eq("id", claim.user_id);
      }
    }

    return { ok: true, status: newStatus };
  });
