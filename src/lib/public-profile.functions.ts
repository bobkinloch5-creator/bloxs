// Public developer profile fetch (server function).
// Anonymous users can view non-private profiles by username.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function serverClient() {
  let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://ogedshfupxmopvlrqmwd.supabase.co";
  if (!url || url.includes("ochawirueourilkwkhon")) url = "https://ogedshfupxmopvlrqmwd.supabase.co";

  let key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWRzaGZ1cHhtb3B2bHJxbXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzgyNDksImV4cCI6MjEwMDc1NDI0OX0.WIuGbCTZ2lDQUFhtrRx-O2Bi2hOaIsi4T2BufoHovZ0";
  if (!key || key.includes("sb_publishable_PM-t7lpIIRhgddB8FaXS9A_Bay6O1nz")) {
    key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWRzaGZ1cHhtb3B2bHJxbXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzgyNDksImV4cCI6MjEwMDc1NDI0OX0.WIuGbCTZ2lDQUFhtrRx-O2Bi2hOaIsi4T2Bi2hOaIsi4T2BufoHovZ0";
  }

  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string;
  roblox_username: string;
  plan: string;
  created_at: string;
  badges: Array<{ badge_key: string; earned_at: string }>;
  stats: {
    projects: number;
    scripts_generated: number;
    assets_inserted: number;
    errors_fixed: number;
    playtests: number;
  };
  projects: Array<{ id: string; name: string; description: string | null; updated_at: string }>;
};

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ username: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data }): Promise<PublicProfile | null> => {
    const supabase = serverClient();
    const { data: profileRaw } = await supabase
      .from("profiles_public" as any)
      .select("id, username, display_name, avatar_url, bio, roblox_username, plan, created_at, is_private")
      .eq("username", data.username)
      .maybeSingle();
    const profile = profileRaw as any;
    if (!profile || profile.is_private) return null;

    const uid = (profile as any).id as string;
    const [badgesRes, projectsRes, actionsRes, playtestsRes] = await Promise.all([
      supabase.from("user_badges").select("badge_key, earned_at").eq("user_id", uid),
      supabase.from("projects").select("id, name, description, updated_at").eq("user_id", uid).order("updated_at", { ascending: false }).limit(6),
      supabase.from("plugin_actions").select("kind, status", { count: "exact", head: false }).eq("user_id", uid).limit(2000),
      supabase.from("playtest_reports").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);

    const actions = (actionsRes.data ?? []) as Array<{ kind: string; status: string | null }>;
    const scripts = actions.filter((a) => ["script", "localscript", "modulescript"].includes(a.kind)).length;
    const assets = actions.filter((a) => a.kind === "insert_asset").length;
    const fixes = actions.filter((a) => a.kind === "autofix_project" || a.kind === "scan_project").length;

    return {
      id: uid,
      username: (profile as any).username,
      display_name: (profile as any).display_name,
      avatar_url: (profile as any).avatar_url,
      bio: (profile as any).bio ?? "",
      roblox_username: (profile as any).roblox_username ?? "",
      plan: (profile as any).plan,
      created_at: (profile as any).created_at,
      badges: (badgesRes.data ?? []) as any,
      stats: {
        projects: projectsRes.data?.length ?? 0,
        scripts_generated: scripts,
        assets_inserted: assets,
        errors_fixed: fixes,
        playtests: playtestsRes.count ?? 0,
      },
      projects: (projectsRes.data ?? []) as any,
    };
  });

export const BADGE_CATALOG: Record<string, { label: string; description: string; emoji: string }> = {
  early_builder: { label: "Early Builder", description: "Joined BloxSmith early", emoji: "🌱" },
  first_game: { label: "First Game Created", description: "Shipped your first project", emoji: "🎮" },
  ten_builds: { label: "10 Builds Completed", description: "Ten builds pushed to Studio", emoji: "🏗️" },
  hundred_scripts: { label: "100 Scripts Generated", description: "One hundred scripts generated", emoji: "💻" },
  plugin_connected: { label: "Plugin Connected", description: "Linked Roblox Studio plugin", emoji: "🔌" },
  bug_fixer: { label: "Bug Fixer", description: "Ran autofix on a project", emoji: "🛠️" },
  ui_designer: { label: "UI Designer", description: "Generated a full UI", emoji: "🎨" },
  marketplace_creator: { label: "Marketplace Creator", description: "Published to the Marketplace", emoji: "🛒" },
};
