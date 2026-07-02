// Knowledge-base seeder + status. Idempotent — re-running only embeds new
// or changed source_hash rows. Surfaces friendly errors for the UI.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KB_CORPUS } from "@/lib/kb-corpus";

type StatusResult = { indexed: number; target: number };
type SeedResult = {
  ok: boolean;
  inserted: number;
  failed: number;
  alreadyIndexed: number;
  total: number;
  message: string;
  firstError?: string;
};

export const getKbStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StatusResult> => {
    try {
      const sb = context.supabase as unknown as {
        from: (t: string) => {
          select: (cols: string, opts?: { count?: "exact"; head?: boolean }) =>
            Promise<{ count: number | null; error: { message: string } | null }>;
        };
      };
      const { count, error } = await sb.from("kb_chunks").select("id", { count: "exact", head: true });
      if (error) {
        // Don't crash the page — UI just shows 0/target.
        return { indexed: 0, target: KB_CORPUS.length };
      }
      return { indexed: count ?? 0, target: KB_CORPUS.length };
    } catch {
      return { indexed: 0, target: KB_CORPUS.length };
    }
  });

export const seedKnowledgeBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SeedResult> => {
    let admin: {
      from: (t: string) => {
        select: (cols: string) =>
          Promise<{ data: Array<{ source_hash: string }> | null; error: { message: string } | null }>;
        upsert: (
          rows: Array<Record<string, unknown>>,
          opts: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    let embedText: (input: string) => Promise<number[]>;
    let toPgVector: (vec: number[]) => string;

    try {
      const mod = await import("@/integrations/supabase/client.server");
      admin = mod.supabaseAdmin as unknown as typeof admin;
      const emb = await import("@/lib/embeddings.server");
      embedText = emb.embedText;
      toPgVector = emb.toPgVector;
    } catch (e) {
      return {
        ok: false,
        inserted: 0,
        failed: KB_CORPUS.length,
        alreadyIndexed: 0,
        total: KB_CORPUS.length,
        message: "Server isn't configured for indexing yet. Please contact support.",
        firstError: e instanceof Error ? e.message : String(e),
      };
    }

    const { data: existing, error: selErr } = await admin.from("kb_chunks").select("source_hash");
    if (selErr) {
      return {
        ok: false,
        inserted: 0,
        failed: 0,
        alreadyIndexed: 0,
        total: KB_CORPUS.length,
        message: "Couldn't read the knowledge base table.",
        firstError: selErr.message,
      };
    }
    const have = new Set((existing ?? []).map((r) => r.source_hash));
    const todo = KB_CORPUS.filter((c) => !have.has(c.source_hash));

    let inserted = 0;
    let failed = 0;
    let firstError: string | undefined;
    let creditExhausted = false;

    for (const chunk of todo) {
      try {
        const vec = await embedText(`${chunk.title}\n\n${chunk.content}`);
        const { error } = await admin.from("kb_chunks").upsert(
          [
            {
              topic: chunk.topic,
              title: chunk.title,
              content: chunk.content,
              source: chunk.source,
              source_hash: chunk.source_hash,
              embedding: toPgVector(vec),
            },
          ],
          { onConflict: "source_hash" },
        );
        if (error) {
          failed += 1;
          if (!firstError) firstError = `DB: ${error.message}`;
        } else {
          inserted += 1;
        }
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        if (!firstError) firstError = msg;
        // Stop early on credit exhaustion — no point burning more requests.
        if (msg.toLowerCase().includes("credits are exhausted")) {
          creditExhausted = true;
          break;
        }
      }
    }

    const remaining = todo.length - inserted - failed;
    const message = creditExhausted
      ? `Stopped — AI credits exhausted after indexing ${inserted}. Add credits and retry.`
      : failed > 0
        ? `Indexed ${inserted}, ${failed} failed${remaining > 0 ? `, ${remaining} skipped` : ""}.`
        : inserted > 0
          ? `Indexed ${inserted} new chunks.`
          : "Already up to date.";

    return {
      ok: failed === 0 && !creditExhausted,
      inserted,
      failed: failed + (creditExhausted ? remaining : 0),
      alreadyIndexed: have.size,
      total: KB_CORPUS.length,
      message,
      firstError,
    };
  });
