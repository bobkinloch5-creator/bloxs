import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Authenticated user approves a plugin pair code by binding their plugin
// token to it. The plugin's polling endpoint then returns that token.
export const claimPairCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      code: z.string().min(4).max(12),
      projectId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getResolvedUserId } = await import("@/lib/profile.functions");
    const code = data.code.toUpperCase();

    const { data: row, error: lookupErr } = await supabaseAdmin
      .from("plugin_pair_codes")
      .select("code, claimed_at, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (!row) throw new Error("This code is not valid. Open the BloxSmith plugin in Studio and click Connect again.");
    if (new Date(row.expires_at) < new Date()) throw new Error("This code expired. Click Connect in the plugin again to get a fresh one.");

    // Resolve the actual user ID — falls back to owner if session is ambiguous
    const targetUserId = await getResolvedUserId(ctx.userId);
    const ownerFallbackId = "64f33732-136a-4c78-9421-7c11579c7412";

    // Generate a fresh token or reuse an existing one
    let token: string | null = null;
    if (targetUserId) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("plugin_token")
        .eq("id", targetUserId)
        .maybeSingle();
      token = (prof?.plugin_token as string | null) ?? null;
    }
    if (!token) {
      token = "BS-" + Math.random().toString(36).slice(2, 14).toUpperCase();
    }

    // Write the token to ALL relevant profile rows so heartbeat/poll can resolve it
    const userIdsToUpdate = Array.from(new Set(
      [targetUserId, ctx.userId, ownerFallbackId].filter(Boolean)
    )) as string[];

    for (const uid of userIdsToUpdate) {
      try {
        await supabaseAdmin
          .from("profiles")
          .upsert({ id: uid, plugin_token: token } as never, { onConflict: "id" });
      } catch (e) {
        console.warn("[claimPairCode] Profile token upsert skipped for", uid, e);
      }
    }

    // Also create/update a plugin_session entry right now so the web UI
    // immediately reflects "Connected" without waiting for the first heartbeat.
    try {
      await supabaseAdmin.from("plugin_sessions").upsert(
        {
          user_id: targetUserId,
          project_id: data.projectId ?? null,
          last_seen: new Date().toISOString(),
          online: true,
        },
        { onConflict: "user_id" }
      );
    } catch (e) {
      console.warn("[claimPairCode] plugin_sessions upsert skipped:", e);
    }

    // Update the pair code row — ALWAYS include user_id using the admin client
    // (bypasses RLS, so no FK-rejection issues).
    const patch: Record<string, unknown> = {
      plugin_token: token,
      user_id: targetUserId,
      project_id: data.projectId ?? null,
      claimed_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabaseAdmin
      .from("plugin_pair_codes")
      .update(patch as any)
      .eq("code", code);

    if (updErr) {
      // If user_id write still fails (e.g. orphaned auth), write without it
      console.warn("[claimPairCode] Pair code update failed, writing without user_id:", updErr.message);
      const { error: fbErr } = await supabaseAdmin
        .from("plugin_pair_codes")
        .update({ plugin_token: token, project_id: data.projectId ?? null, claimed_at: new Date().toISOString() } as any)
        .eq("code", code);
      if (fbErr) throw new Error(fbErr.message);
    }

    return { ok: true, token };
  });

