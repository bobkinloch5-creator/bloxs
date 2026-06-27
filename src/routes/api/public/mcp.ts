// BloxSmith MCP Streamable HTTP endpoint (JSON-RPC 2.0).
// Auth: bearer token = user's plugin_token from profiles.
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { normalizePluginActionKind } from "@/lib/plugin-actions";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const SERVER_INFO = { name: "bloxsmith-mcp", version: "1.0.0" };

const TOOLS = [
  {
    name: "list_projects",
    description: "List all BloxSmith projects belonging to the authenticated user.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "studio_status",
    description: "Check whether the user's Roblox Studio plugin is currently online.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "push_script",
    description:
      "Queue a Luau script to be inserted into Roblox Studio by the BloxSmith plugin. " +
      "Returns the action id. The plugin will pick it up on its next poll.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "BloxSmith project id" },
        kind: {
          type: "string",
          enum: ["script", "localscript", "modulescript"],
          description: "Roblox script type",
        },
        parent_path: {
          type: "string",
          description: "Studio parent path, e.g. ServerScriptService or StarterPlayer.StarterPlayerScripts",
        },
        name: { type: "string", description: "Script instance name" },
        source: { type: "string", description: "Luau source code" },
      },
      required: ["project_id", "kind", "parent_path", "name", "source"],
      additionalProperties: false,
    },
  },
  {
    name: "push_part",
    description: "Queue a Roblox Part to be created in Studio Workspace.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        name: { type: "string" },
        size: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        color: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        anchored: { type: "boolean" },
        material: { type: "string" },
      },
      required: ["project_id", "name"],
      additionalProperties: false,
    },
  },
];

async function authUser(req: Request) {
  const sb = admin();
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { sb, user: null as null | { id: string } };
  const { data } = await sb.from("profiles").select("id").eq("plugin_token", token).maybeSingle();
  return { sb, user: data ? { id: data.id } : null };
}

async function callTool(name: string, args: any, sb: ReturnType<typeof admin>, userId: string) {
  switch (name) {
    case "list_projects": {
      const { data, error } = await sb
        .from("projects")
        .select("id, name, description, plugin_connected, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "studio_status": {
      const { data } = await sb
        .from("plugin_sessions")
        .select("online, last_seen, place_id, studio_version, project_id")
        .eq("user_id", userId)
        .maybeSingle();
      const online =
        !!data?.online &&
        !!data?.last_seen &&
        Date.now() - new Date(data.last_seen).getTime() < 30_000;
      return { online, session: data ?? null };
    }
    case "push_script": {
      const { data: proj } = await sb
        .from("projects").select("id").eq("id", args.project_id).eq("user_id", userId).maybeSingle();
      if (!proj) throw new Error("project not found");
      const { data, error } = await sb.from("plugin_actions").insert({
        user_id: userId,
        project_id: args.project_id,
        kind: normalizePluginActionKind(args.kind),
        parent_path: args.parent_path,
        name: args.name,
        payload: { source: args.source },
        status: "pending",
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { queued: true, action_id: data.id };
    }
    case "push_part": {
      const { data: proj } = await sb
        .from("projects").select("id").eq("id", args.project_id).eq("user_id", userId).maybeSingle();
      if (!proj) throw new Error("project not found");
      const { data, error } = await sb.from("plugin_actions").insert({
        user_id: userId,
        project_id: args.project_id,
        kind: "part",
        parent_path: "Workspace",
        name: args.name,
        payload: {
          size: args.size ?? [4, 1, 4],
          position: args.position ?? [0, 5, 0],
          color: args.color ?? [0.4, 0.6, 1],
          anchored: args.anchored ?? true,
          material: args.material ?? "Plastic",
        },
        status: "pending",
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { queued: true, action_id: data.id };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function rpc(id: any, result?: any, error?: { code: number; message: string }) {
  const body: any = { jsonrpc: "2.0", id: id ?? null };
  if (error) body.error = error;
  else body.result = result;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, accept, mcp-session-id",
      "access-control-allow-methods": "POST, GET, OPTIONS",
    },
  });
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "authorization, content-type, accept, mcp-session-id",
            "access-control-allow-methods": "POST, GET, OPTIONS",
          },
        }),
      GET: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed. Use POST." },
            id: null,
          }),
          { status: 405, headers: { "content-type": "application/json", allow: "POST, OPTIONS" } },
        ),
      POST: async ({ request }) => {
        let msg: any;
        try {
          msg = await request.json();
        } catch {
          return rpc(null, undefined, { code: -32700, message: "Parse error" });
        }
        const { id, method, params } = msg ?? {};

        // Initialize / ping don't need auth
        if (method === "initialize") {
          return rpc(id, {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions:
              "BloxSmith MCP. Use list_projects then push_script / push_part to build Roblox games. Studio plugin must be online for changes to appear.",
          });
        }
        if (method === "notifications/initialized" || method === "initialized") {
          return new Response(null, { status: 204 });
        }
        if (method === "ping") return rpc(id, {});

        const { sb, user } = await authUser(request);
        if (!user) {
          return rpc(id, undefined, {
            code: -32001,
            message: "Unauthorized. Pass your BloxSmith plugin token as Authorization: Bearer <token>.",
          });
        }

        if (method === "tools/list") {
          return rpc(id, { tools: TOOLS });
        }
        if (method === "tools/call") {
          const name = params?.name;
          const args = params?.arguments ?? {};
          try {
            const out = await callTool(name, args, sb, user.id);
            return rpc(id, {
              content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
              isError: false,
            });
          } catch (e) {
            return rpc(id, {
              content: [{ type: "text", text: e instanceof Error ? e.message : "error" }],
              isError: true,
            });
          }
        }

        return rpc(id, undefined, { code: -32601, message: `Method not found: ${method}` });
      },
    },
  },
});
