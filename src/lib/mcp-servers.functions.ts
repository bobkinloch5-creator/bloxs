// User-facing MCP server registry: list / add / test / toggle / remove.
// Each row stores the connection details and cached tools returned by the
// remote server's tools/list JSON-RPC call.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function probeMcpServer(url: string, token?: string | null): Promise<{
  status: "ready" | "failed";
  status_message: string | null;
  tools: Array<{ name: string; description?: string }>;
}> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // MCP Streamable HTTP spec — servers reject without both.
      Accept: "application/json, text/event-stream",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return { status: "failed", status_message: `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`, tools: [] };
    }
    const ct = res.headers.get("content-type") ?? "";
    let payload: any = null;
    if (ct.includes("text/event-stream")) {
      // Read the first data: line that parses as JSON-RPC.
      const text = await res.text();
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        try { payload = JSON.parse(line.slice(5).trim()); break; } catch {}
      }
    } else {
      payload = await res.json().catch(() => null);
    }
    const tools = payload?.result?.tools;
    if (!Array.isArray(tools)) {
      return { status: "failed", status_message: payload?.error?.message ?? "No tools/list result in response.", tools: [] };
    }
    return {
      status: "ready",
      status_message: `Connected — ${tools.length} tool${tools.length === 1 ? "" : "s"}.`,
      tools: tools.map((t: any) => ({ name: String(t.name ?? ""), description: t.description ? String(t.description).slice(0, 400) : undefined })).filter((t) => t.name),
    };
  } catch (e) {
    return { status: "failed", status_message: e instanceof Error ? e.message.slice(0, 200) : "Connection failed.", tools: [] };
  }
}

export const listMcpServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("mcp_servers")
      .select("id, name, url, enabled, tools, status, status_message, last_tested_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const AddInput = z.object({
  name: z.string().min(1).max(80),
  url: z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1"), "Only https:// (or localhost http) URLs are allowed."),
  token: z.string().max(500).optional().nullable(),
});

export const addMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const probe = await probeMcpServer(data.url, data.token);
    const { data: row, error } = await supabase.from("mcp_servers").insert({
      user_id: userId,
      name: data.name.trim(),
      url: data.url.trim(),
      token: data.token?.trim() || null,
      enabled: probe.status === "ready",
      tools: probe.tools as unknown as never,
      status: probe.status,
      status_message: probe.status_message,
      last_tested_at: new Date().toISOString(),
    }).select("id, name, url, enabled, tools, status, status_message, last_tested_at, created_at").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const testMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("mcp_servers").select("id, url, token").eq("id", data.id).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Server not found");
    const probe = await probeMcpServer(row.url, row.token as string | null | undefined);
    const { data: updated, error: upErr } = await supabase.from("mcp_servers").update({
      status: probe.status,
      status_message: probe.status_message,
      tools: probe.tools as unknown as never,
      last_tested_at: new Date().toISOString(),
    }).eq("id", data.id).select("id, name, url, enabled, tools, status, status_message, last_tested_at, created_at").single();
    if (upErr) throw new Error(upErr.message);
    return updated;
  });

export const toggleMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("mcp_servers").update({ enabled: data.enabled }).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const removeMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("mcp_servers").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
