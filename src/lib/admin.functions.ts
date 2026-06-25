import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_EMAIL = "bobkinloch5@gmail.com";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: authUser } = await context.supabase.auth.getUser();
    const email = authUser.user?.email ?? (typeof context.claims.email === "string" ? context.claims.email : "");

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, plan, credits, max_credits, is_admin, created_at")
      .eq("id", context.userId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    const isOwner = email.toLowerCase() === OWNER_EMAIL && !!profile?.is_admin;
    if (!isOwner) throw new Error("Not found");

    const [{ data: roles }, projectCount, messageCount, pendingActions] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("projects").select("id", { count: "exact", head: true }),
      context.supabase.from("chat_messages").select("id", { count: "exact", head: true }),
      context.supabase.from("plugin_actions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    return {
      profile,
      email,
      roles: roles?.map((row) => row.role) ?? [],
      stats: {
        projects: projectCount.count ?? 0,
        messages: messageCount.count ?? 0,
        pendingActions: pendingActions.count ?? 0,
      },
    };
  });