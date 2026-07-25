import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();

// ---------- Rename / update settings ----------
export const updateProjectSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: uuid,
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(2000).optional(),
    thumbnail_url: z.string().max(1_500_000).nullable().optional(), // allow data URLs
    is_public: z.boolean().optional(),
    default_build_mode: z.enum(["fast", "smart", "deep"]).optional(),
    default_execution_mode: z.enum(["safe", "fast", "owner"]).optional(),
    default_model: z.string().max(80).nullable().optional(),
    default_language: z.string().max(20).nullable().optional(),
    roblox_place_id: z.number().int().nullable().optional(),
    roblox_universe_id: z.number().int().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error, data: row } = await context.supabase
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Toggle flags ----------
export const toggleProjectFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid, value: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ is_favorite: data.value })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleProjectPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid, value: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ pinned_at: data.value ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleProjectArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid, value: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ archived_at: data.value ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Duplicate ----------
export const duplicateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("projects").select("*").eq("id", data.id).maybeSingle();
    if (e1 || !src) throw new Error(e1?.message ?? "Project not found");

    const { data: copy, error: e2 } = await context.supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        name: `${src.name} (Copy)`,
        description: src.description ?? "",
        game_type: src.game_type,
        thumbnail_url: src.thumbnail_url,
        default_build_mode: src.default_build_mode,
        default_execution_mode: src.default_execution_mode,
        default_model: src.default_model,
        default_language: src.default_language,
      })
      .select().single();
    if (e2) throw new Error(e2.message);

    // Copy assets + memory (not chat/history)
    const { data: assets } = await context.supabase
      .from("project_assets").select("kind, prompt, data_url, meta").eq("project_id", data.id);
    if (assets?.length) {
      await (context.supabase.from("project_assets") as any).insert(
        assets.map((a: any) => ({ ...a, project_id: copy.id, user_id: context.userId })),
      );
    }
    const { data: memory } = await context.supabase
      .from("project_memory").select("key, value, kind, importance").eq("project_id", data.id);
    if (memory?.length) {
      await (context.supabase.from("project_memory") as any).insert(
        memory.map((m: any) => ({ ...m, project_id: copy.id, user_id: context.userId })),
      );
    }
    return copy;
  });

// ---------- Export / Import ----------
export const exportProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const [proj, assets, memory, builds] = await Promise.all([
      context.supabase.from("projects").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("project_assets").select("*").eq("project_id", data.id),
      context.supabase.from("project_memory").select("*").eq("project_id", data.id),
      context.supabase.from("build_history").select("*").eq("project_id", data.id).limit(200),
    ]);
    if (proj.error || !proj.data) throw new Error(proj.error?.message ?? "Project not found");
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      project: proj.data,
      assets: assets.data ?? [],
      memory: memory.data ?? [],
      builds: builds.data ?? [],
    };
  });

export const importProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    payload: z.object({
      project: z.record(z.any()),
      assets: z.array(z.record(z.any())).optional().default([]),
      memory: z.array(z.record(z.any())).optional().default([]),
    }),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const src: any = data.payload.project;
    const { data: copy, error } = await context.supabase.from("projects").insert({
      user_id: context.userId,
      name: `${src.name ?? "Imported project"} (Imported)`,
      description: src.description ?? "",
      game_type: src.game_type ?? "custom",
      thumbnail_url: src.thumbnail_url ?? null,
      default_build_mode: src.default_build_mode ?? "smart",
      default_execution_mode: src.default_execution_mode ?? "safe",
    }).select().single();
    if (error) throw new Error(error.message);

    if (data.payload.assets.length) {
      await (context.supabase.from("project_assets") as any).insert(
        data.payload.assets.map((a: any) => ({
          project_id: copy.id, user_id: context.userId,
          kind: String(a.kind ?? "asset"),
          prompt: String(a.prompt ?? ""),
          data_url: String(a.data_url ?? a.url ?? ""),
          meta: a.meta ?? {},
        })),
      );
    }
    if (data.payload.memory.length) {
      await (context.supabase.from("project_memory") as any).insert(
        data.payload.memory.map((m: any) => ({
          project_id: copy.id, user_id: context.userId,
          key: String(m.key ?? "note"),
          value: String(m.value ?? ""),
          kind: m.kind ?? undefined,
          importance: typeof m.importance === "number" ? m.importance : undefined,
        })),
      );
    }
    return copy;
  });

// ---------- Statistics ----------
type CountableTable =
  | "build_history" | "chat_messages" | "plugin_actions" | "project_assets"
  | "model_generations" | "ui_generations" | "studio_errors" | "build_milestones";

export const getProjectStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const pid = data.id;
    const count = async (table: CountableTable, extra?: (q: any) => any) => {
      let q: any = context.supabase.from(table).select("id", { count: "exact", head: true }).eq("project_id", pid);
      if (extra) q = extra(q);
      const { count: c } = await q;
      return c ?? 0;
    };
    const [
      builds, messages, actions, scripts, assets, models, uiGens, errors, milestones,
    ] = await Promise.all([
      count("build_history"),
      count("chat_messages"),
      count("plugin_actions"),
      count("plugin_actions", (q) => q.in("kind", ["script", "localscript", "modulescript"])),
      count("project_assets"),
      count("model_generations"),
      count("ui_generations"),
      count("studio_errors"),
      count("build_milestones"),
    ]);
    const { data: proj } = await context.supabase
      .from("projects").select("created_at, updated_at").eq("id", pid).maybeSingle();
    return {
      builds, messages, actions, scripts, assets, models, uiGens, errors, milestones,
      created_at: proj?.created_at ?? null,
      updated_at: proj?.updated_at ?? null,
    };
  });

// ---------- Live Project Files ----------
export const listProjectFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: actions, error } = await context.supabase
      .from("plugin_actions")
      .select("id, kind, name, parent_path, payload, created_at, status")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const fileMap = new Map<string, {
      id: string;
      name: string;
      className: string;
      parentPath: string;
      source: string;
      updatedAt: string;
      actionKind: string;
    }>();

    const normalizeParent = (rawParent: string | undefined, className: string): string => {
      let p = (rawParent || "").trim();
      p = p.replace(/^game\./i, "");
      if (p.toLowerCase() === "game") p = "";
      if (!p) {
        if (className === "LocalScript") return "StarterPlayerScripts";
        if (className === "ModuleScript") return "ReplicatedStorage";
        if (className === "ScreenGui") return "StarterGui";
        if (className === "RemoteEvent" || className === "RemoteFunction") return "ReplicatedStorage";
        if (["Part", "Model", "Folder", "MeshPart"].includes(className)) return "Workspace";
        return "ServerScriptService";
      }
      return p;
    };

    // 1. Process plugin_actions
    for (const a of actions ?? []) {
      const p = (a.payload ?? {}) as Record<string, any>;
      const kind = (a.kind ?? "").toLowerCase();
      const rawName = a.name || p.name || p.asset_id || "Untitled";

      let className = "Script";
      if (kind === "localscript" || p.className === "LocalScript") className = "LocalScript";
      else if (kind === "modulescript" || p.className === "ModuleScript") className = "ModuleScript";
      else if (kind === "screengui" || p.className === "ScreenGui") className = "ScreenGui";
      else if (kind === "remoteevent" || p.className === "RemoteEvent") className = "RemoteEvent";
      else if (kind === "remotefunction" || p.className === "RemoteFunction") className = "RemoteFunction";
      else if (kind === "folder" || p.className === "Folder") className = "Folder";
      else if (kind === "part" || p.className === "Part") className = "Part";
      else if (kind === "insert_asset" || kind === "model" || p.className === "Model") className = "Model";
      else if (kind === "terrain" || p.className === "Terrain") className = "Terrain";
      else if (p.className) className = p.className;

      const parentPath = normalizeParent(a.parent_path || p.parentPath || p.parent_path, className);

      const source = typeof p.source === "string" ? p.source :
                     typeof p.code === "string" ? p.code :
                     typeof p.script === "string" ? p.script :
                     typeof p.lua === "string" ? p.lua :
                     typeof p.luau === "string" ? p.luau : "";

      const key = `${parentPath}.${rawName}`;

      if (kind.includes("delete") || kind.includes("remove")) {
        fileMap.delete(key);
      } else {
        fileMap.set(key, {
          id: a.id,
          name: rawName,
          className,
          parentPath,
          source: source || `-- Roblox Studio Instance: ${rawName} (${className})\n-- Location: ${parentPath}.${rawName}`,
          updatedAt: a.created_at,
          actionKind: a.kind,
        });
      }
    }

    // 2. Check chat_messages for assistant action blocks to capture any generated scripts or objects
    const { data: messages } = await context.supabase
      .from("chat_messages")
      .select("id, content, created_at")
      .eq("project_id", data.projectId)
      .eq("role", "assistant")
      .order("created_at", { ascending: true })
      .limit(30);

    for (const msg of messages ?? []) {
      const content = msg.content || "";
      const blocks = content.match(/```bloxsmith-actions([\s\S]*?)```/g);
      if (!blocks) continue;

      for (const block of blocks) {
        const jsonStr = block.replace(/```bloxsmith-actions\s*/, "").replace(/```$/, "").trim();
        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed)) {
            for (const act of parsed) {
              const kind = (act.kind || "").toLowerCase();
              const p = act.payload || {};
              const rawName = act.name || p.name || p.asset_id;
              if (!rawName) continue;

              let className = "Script";
              if (kind === "localscript" || p.className === "LocalScript") className = "LocalScript";
              else if (kind === "modulescript" || p.className === "ModuleScript") className = "ModuleScript";
              else if (kind === "screengui" || p.className === "ScreenGui") className = "ScreenGui";
              else if (kind === "remoteevent" || p.className === "RemoteEvent") className = "RemoteEvent";
              else if (kind === "remotefunction" || p.className === "RemoteFunction") className = "RemoteFunction";
              else if (kind === "folder" || p.className === "Folder") className = "Folder";
              else if (kind === "part" || p.className === "Part") className = "Part";
              else if (kind === "insert_asset" || kind === "model" || p.className === "Model") className = "Model";
              else if (p.className) className = p.className;

              const parentPath = normalizeParent(act.parent_path || p.parentPath || p.parent_path, className);
              const source = typeof p.source === "string" ? p.source :
                             typeof p.code === "string" ? p.code :
                             typeof p.script === "string" ? p.script : "";

              const key = `${parentPath}.${rawName}`;
              if (!fileMap.has(key)) {
                fileMap.set(key, {
                  id: `chat-${msg.id}-${rawName}`,
                  name: rawName,
                  className,
                  parentPath,
                  source: source || `-- Roblox Studio Instance: ${rawName} (${className})\n-- Location: ${parentPath}.${rawName}`,
                  updatedAt: msg.created_at,
                  actionKind: act.kind || "chat_action",
                });
              }
            }
          }
        } catch {}
      }
    }

    // 3. Check plugin_sessions for live Roblox Studio scene scan tree
    const { data: session } = await context.supabase
      .from("plugin_sessions")
      .select("last_scan, last_scan_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (session?.last_scan) {
      let rawScan = session.last_scan;
      if (typeof rawScan === "string") {
        try {
          rawScan = JSON.parse(rawScan);
        } catch {}
      }

      let rootNodes: any[] = [];
      if (Array.isArray(rawScan)) {
        rootNodes = rawScan;
      } else if (rawScan && typeof rawScan === "object") {
        if (Array.isArray((rawScan as any).roots)) {
          rootNodes = (rawScan as any).roots;
        } else {
          rootNodes = [rawScan];
        }
      }

      const ROBLOX_SERVICES = new Set([
        "Workspace",
        "ServerScriptService",
        "ServerStorage",
        "ReplicatedStorage",
        "ReplicatedFirst",
        "StarterGui",
        "StarterPack",
        "StarterPlayer",
        "Lighting",
        "SoundService",
        "Teams",
        "Players",
        "TextChatService",
        "StarterPlayerScripts",
        "StarterCharacterScripts",
      ]);

      const walkNode = (node: any, currentParent = "") => {
        if (!node || typeof node !== "object") return;
        const name = node.name || node.Name || "Instance";
        const cls = node.className || node.ClassName || node.class || "Instance";

        const rawPath = node.path || node.Path || (currentParent ? `${currentParent}.${name}` : name);
        const cleanPath = rawPath.replace(/^game\./i, "");

        if (!ROBLOX_SERVICES.has(cleanPath)) {
          const parts = cleanPath.split(".");
          const itemName = parts.pop() || name;
          let parentPath = parts.join(".");

          if (!parentPath) {
            if (cls === "LocalScript") parentPath = "StarterPlayerScripts";
            else if (cls === "ModuleScript") parentPath = "ReplicatedStorage";
            else if (cls === "ScreenGui") parentPath = "StarterGui";
            else if (cls === "RemoteEvent" || cls === "RemoteFunction") parentPath = "ReplicatedStorage";
            else if (["Part", "Model", "Folder", "MeshPart", "Terrain"].includes(cls)) parentPath = "Workspace";
            else parentPath = "ServerScriptService";
          }

          const source =
            typeof node.source === "string"
              ? node.source
              : typeof node.code === "string"
              ? node.code
              : typeof node.script === "string"
              ? node.script
              : typeof node.Source === "string"
              ? node.Source
              : `-- Live Roblox Studio Instance: ${itemName} (${cls})\n-- Path: ${cleanPath}`;

          const key = `${parentPath}.${itemName}`;
          const existing = fileMap.get(key);
          if (!existing || (typeof node.source === "string" && node.source.trim())) {
            fileMap.set(key, {
              id: `scan-${cleanPath}`,
              name: itemName,
              className: cls,
              parentPath,
              source,
              updatedAt: session.last_scan_at || new Date().toISOString(),
              actionKind: "live_scan",
            });
          }
        }

        const children = node.children || node.Children;
        if (Array.isArray(children)) {
          for (const child of children) {
            walkNode(child, cleanPath);
          }
        }
      };

      for (const root of rootNodes) {
        walkNode(root, "");
      }
    }

    return Array.from(fileMap.values());
  });

// ---------- Save / Edit Script File & Sync to Roblox Studio ----------
export const saveScriptFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: uuid,
    name: z.string().min(1).max(200),
    parentPath: z.string().max(300),
    className: z.string().max(100),
    source: z.string().max(500000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const clsLower = data.className.toLowerCase();
    const kind = clsLower.includes("local") ? "localscript" : clsLower.includes("module") ? "modulescript" : "script";

    const { error } = await context.supabase.from("plugin_actions").insert({
      user_id: context.user.id,
      project_id: data.projectId,
      kind,
      name: data.name,
      parent_path: data.parentPath,
      payload: {
        source: data.source,
        className: data.className,
        updated_at: new Date().toISOString(),
      },
      status: "pending",
    });

    if (error) {
      console.error("[saveScriptFile] Failed to queue script action:", error);
      throw new Error(error.message);
    }

    return { ok: true, synced: true };
  });


