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
  .inputValidator((data: { paypalReference: string; amountNote?: string }) => {
    const ref = (data?.paypalReference ?? "").trim();
    if (ref.length < 3 || ref.length > 200) throw new Error("Enter a valid PayPal reference (transaction ID, email, or note).");
    const note = (data?.amountNote ?? "").trim().slice(0, 300);
    return { paypalReference: ref, amountNote: note };
  })
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("donation_claims")
      .insert({
        user_id: context.userId,
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
    const { data, error } = await context.supabase
      .from("donation_claims")
      .select("id, paypal_reference, amount_note, status, admin_note, created_at, decided_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isDonator = (roles ?? []).some((r: any) => r.role === "donator");
    return { claims: data ?? [], isDonator };
  });

export const listPendingDonationClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await callerIsAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
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
  .inputValidator((data: { id: string; approve: boolean; note?: string }) => {
    if (!data?.id) throw new Error("Missing id");
    return { id: data.id, approve: !!data.approve, note: (data.note ?? "").trim().slice(0, 300) };
  })
  .handler(async ({ data, context }) => {
    if (!(await callerIsAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: claim, error: cErr } = await supabaseAdmin
      .from("donation_claims")
      .select("id, user_id, status")
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
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    if (data.approve) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: claim.user_id, role: "donator" }, { onConflict: "user_id,role" });
    }

    return { ok: true, status: newStatus };
  });
