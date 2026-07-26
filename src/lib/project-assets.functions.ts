import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();

const KIND = z.enum(["logo", "thumbnail", "icon", "loading_screen", "skybox", "npc_portrait", "badge"]);

export const saveProjectAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    project_id: uuid,
    kind: KIND,
    prompt: z.string().min(1).max(2000),
    data_url: z.string().min(20).max(8_000_000),
    meta: z.record(z.string(), z.any()).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;
    const { data: ok } = await sb.rpc("can_access_project", { _project_id: data.project_id, _user_id: ctx.userId });
    if (!ok) throw new Error("No access to this project");

    const { data: row, error } = await sb.from("project_assets").insert({
      project_id: data.project_id,
      user_id: ctx.userId,
      kind: data.kind,
      prompt: data.prompt,
      data_url: data.data_url,
      meta: data.meta ?? {},
    }).select().single();
    if (error) throw new Error(error.message);

    await sb.from("project_activity").insert({
      project_id: data.project_id,
      user_id: ctx.userId,
      kind: "visual.generated",
      summary: `generated a ${data.kind.replace("_", " ")}`,
      meta: { asset_id: row.id, kind: data.kind },
    });
    return row;
  });

export const listProjectAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;
    const { data: rows, error } = await sb
      .from("project_assets")
      .select("id, kind, prompt, data_url, meta, created_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteProjectAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ asset_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;
    const { error } = await sb.from("project_assets").delete().eq("id", data.asset_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
