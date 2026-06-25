// Plugin → server: create a short-lived pair code. The plugin shows the user
// a link like https://bloxsmith.pro/link?code=ABC123 ; once the signed-in
// user approves it on the website, /pair/poll returns the real plugin token.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

export const Route = createFileRoute("/api/public/plugin/pair/start")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const sb = admin();
          // try up to 5 times to avoid extremely unlikely code collisions
          for (let i = 0; i < 5; i++) {
            const code = makeCode();
            const { error } = await sb.from("plugin_pair_codes").insert({ code });
            if (!error) {
              const origin = new URL(request.url).origin;
              return json({
                code,
                link_url: `${origin}/link?code=${code}`,
                expires_in: 600,
              });
            }
          }
          return json({ error: "could not allocate code" }, 500);
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "error" }, 500);
        }
      },
    },
  },
});
