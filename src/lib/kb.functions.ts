// Knowledge-base seeder + status. Owner/admin-only. Batched for progress UI.
// Each batch writes to admin_audit_logs so seeding is auditable.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KB_CORPUS } from "@/lib/kb-corpus";

type StatusResult = { indexed: number; target: number };

export type SeedBatchResult = {
  ok: boolean;
  done: boolean;
  processed: number;   // chunks attempted this batch
  inserted: number;    // chunks successfully embedded this batch
  failed: number;      // chunks that errored this batch
  remaining: number;   // chunks still missing after this batch
  totalIndexed: number;
  target: number;
  message: string;
  firstError?: string;
  currentTitle?: string;
};

export type SeedResult = {
  ok: boolean;
  inserted: number;
  failed: number;
  alreadyIndexed: number;
  total: number;
  message: string;
  firstError?: string;
};

async function requireOwnerOrAdmin(
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise<{ data: boolean | null; error: { message: string } | null }>;
  },
  userId: string,
): Promise<void> {
  const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  if (isOwner) return;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;
  throw new Error("Forbidden: knowledge base seeding is restricted to owners and admins.");
}

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
      if (error) return { indexed: 0, target: KB_CORPUS.length };
      return { indexed: count ?? 0, target: KB_CORPUS.length };
    } catch {
      return { indexed: 0, target: KB_CORPUS.length };
    }
  });

// Process ONE batch of missing chunks, then return. UI loops this call to
// drive a live progress bar and cancel between batches if needed.
export const seedKnowledgeBaseBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { batchSize?: number } | undefined) => ({
    batchSize: Math.max(1, Math.min(20, data?.batchSize ?? 5)),
  }))
  .handler(async ({ data, context }): Promise<SeedBatchResult> => {
    const { userId, claims } = context as unknown as {
      userId: string;
      claims: { email?: string } | null;
    };
    await requireOwnerOrAdmin(
      context.supabase as unknown as Parameters<typeof requireOwnerOrAdmin>[0],
      userId,
    );

    let admin: {
      from: (t: string) => {
        select: (cols: string) =>
          Promise<{ data: Array<{ source_hash: string }> | null; error: { message: string } | null }>;
        upsert: (rows: Array<Record<string, unknown>>, opts: { onConflict: string }) =>
          Promise<{ error: { message: string } | null }>;
        insert: (rows: Array<Record<string, unknown>>) =>
          Promise<{ error: { message: string } | null }>;
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
        ok: false, done: true, processed: 0, inserted: 0, failed: 0,
        remaining: KB_CORPUS.length, totalIndexed: 0, target: KB_CORPUS.length,
        message: "Server isn't configured for indexing yet.",
        firstError: e instanceof Error ? e.message : String(e),
      };
    }

    const { data: existing, error: selErr } = await admin.from("kb_chunks").select("source_hash");
    if (selErr) {
      return {
        ok: false, done: true, processed: 0, inserted: 0, failed: 0,
        remaining: KB_CORPUS.length, totalIndexed: 0, target: KB_CORPUS.length,
        message: "Couldn't read the knowledge base table.",
        firstError: selErr.message,
      };
    }
    const have = new Set((existing ?? []).map((r) => r.source_hash));
    const todo = KB_CORPUS.filter((c) => !have.has(c.source_hash));

    if (todo.length === 0) {
      return {
        ok: true, done: true, processed: 0, inserted: 0, failed: 0,
        remaining: 0, totalIndexed: have.size, target: KB_CORPUS.length,
        message: "Already up to date.",
      };
    }

    const batch = todo.slice(0, data.batchSize);
    let inserted = 0;
    let failed = 0;
    let firstError: string | undefined;
    let creditExhausted = false;
    let currentTitle: string | undefined;

    for (const chunk of batch) {
      currentTitle = chunk.title;
      try {
        const vec = await embedText(`${chunk.title}\n\n${chunk.content}`);
        const { error } = await admin.from("kb_chunks").upsert(
          [{
            topic: chunk.topic,
            title: chunk.title,
            content: chunk.content,
            source: chunk.source,
            source_hash: chunk.source_hash,
            embedding: toPgVector(vec),
          }],
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
        if (msg.toLowerCase().includes("credits are exhausted")) {
          creditExhausted = true;
          break;
        }
      }
    }

    const totalIndexed = have.size + inserted;
    const remaining = KB_CORPUS.length - totalIndexed;
    const done = creditExhausted || remaining <= 0;

    // Audit log — never let logging failure break seeding.
    try {
      await admin.from("admin_audit_logs").insert([{
        actor_id: userId,
        actor_email: claims?.email ?? null,
        action: done ? "kb_seed.complete" : "kb_seed.batch",
        target_type: "kb_chunks",
        metadata: {
          processed: batch.length,
          inserted,
          failed,
          remaining,
          totalIndexed,
          target: KB_CORPUS.length,
          creditExhausted,
          firstError: firstError ?? null,
        },
      }]);
    } catch {
      /* ignore audit failure */
    }

    const message = creditExhausted
      ? `Stopped — AI credits exhausted after ${inserted} in this batch.`
      : failed > 0
        ? `Batch: ${inserted} indexed, ${failed} failed. ${remaining} remaining.`
        : done
          ? `Indexing complete — ${totalIndexed}/${KB_CORPUS.length} chunks.`
          : `Batch: +${inserted} indexed. ${remaining} remaining.`;

    return {
      ok: failed === 0 && !creditExhausted,
      done,
      processed: batch.length,
      inserted,
      failed,
      remaining,
      totalIndexed,
      target: KB_CORPUS.length,
      message,
      firstError,
      currentTitle,
    };
  });

// Legacy one-shot endpoint — kept for backwards compatibility. Loops the
// batch endpoint's logic in a single request. Prefer seedKnowledgeBaseBatch
// for UI-driven progress.
export const seedKnowledgeBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeedResult> => {
    const { userId, claims } = context as unknown as {
      userId: string;
      claims: { email?: string } | null;
    };
    await requireOwnerOrAdmin(
      context.supabase as unknown as Parameters<typeof requireOwnerOrAdmin>[0],
      userId,
    );

    let admin: {
      from: (t: string) => {
        select: (cols: string) =>
          Promise<{ data: Array<{ source_hash: string }> | null; error: { message: string } | null }>;
        upsert: (rows: Array<Record<string, unknown>>, opts: { onConflict: string }) =>
          Promise<{ error: { message: string } | null }>;
        insert: (rows: Array<Record<string, unknown>>) =>
          Promise<{ error: { message: string } | null }>;
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
        ok: false, inserted: 0, failed: KB_CORPUS.length, alreadyIndexed: 0,
        total: KB_CORPUS.length, message: "Server isn't configured for indexing yet.",
        firstError: e instanceof Error ? e.message : String(e),
      };
    }

    const { data: existing, error: selErr } = await admin.from("kb_chunks").select("source_hash");
    if (selErr) {
      return {
        ok: false, inserted: 0, failed: 0, alreadyIndexed: 0,
        total: KB_CORPUS.length, message: "Couldn't read the knowledge base table.",
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
          [{
            topic: chunk.topic,
            title: chunk.title,
            content: chunk.content,
            source: chunk.source,
            source_hash: chunk.source_hash,
            embedding: toPgVector(vec),
          }],
          { onConflict: "source_hash" },
        );
        if (error) { failed += 1; if (!firstError) firstError = `DB: ${error.message}`; }
        else { inserted += 1; }
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        if (!firstError) firstError = msg;
        if (msg.toLowerCase().includes("credits are exhausted")) { creditExhausted = true; break; }
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

    try {
      await admin.from("admin_audit_logs").insert([{
        actor_id: userId,
        actor_email: claims?.email ?? null,
        action: "kb_seed.oneshot",
        target_type: "kb_chunks",
        metadata: {
          inserted, failed: failed + (creditExhausted ? remaining : 0),
          alreadyIndexed: have.size, total: KB_CORPUS.length,
          creditExhausted, firstError: firstError ?? null,
        },
      }]);
    } catch { /* ignore */ }

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

export type KbSeedAuditEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  inserted: number;
  failed: number;
  remaining: number | null;
  totalIndexed: number | null;
  creditExhausted: boolean;
  firstError: string | null;
};

// Recent audit log entries for the seeder — for the panel history view.
export const getKbSeedAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ entries: KbSeedAuditEntry[] }> => {
    const { userId } = context as unknown as { userId: string };
    await requireOwnerOrAdmin(
      context.supabase as unknown as Parameters<typeof requireOwnerOrAdmin>[0],
      userId,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (col: string, vals: string[]) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{
                data: Array<{
                  id: string;
                  action: string;
                  actor_email: string | null;
                  metadata: Record<string, unknown> | null;
                  created_at: string;
                }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    })
      .from("admin_audit_logs")
      .select("id, action, actor_email, metadata, created_at")
      .in("action", ["kb_seed.batch", "kb_seed.complete", "kb_seed.oneshot"])
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !data) return { entries: [] };
    const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
    const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
    const entries: KbSeedAuditEntry[] = data.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        action: r.action,
        actor_email: r.actor_email,
        created_at: r.created_at,
        inserted: num(m.inserted),
        failed: num(m.failed),
        remaining: numOrNull(m.remaining),
        totalIndexed: numOrNull(m.totalIndexed),
        creditExhausted: m.creditExhausted === true,
        firstError: typeof m.firstError === "string" ? m.firstError : null,
      };
    });
    return { entries };
  });

