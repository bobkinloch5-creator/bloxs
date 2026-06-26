import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Heart, Crown, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitDonationClaim, listMyDonationClaims } from "@/lib/donations.functions";

export const Route = createFileRoute("/donate")({
  head: () => ({
    meta: [
      { title: "Donate — Support BloxSmith" },
      { name: "description", content: "BloxSmith is free. If it helps you, donate any amount via PayPal and get the Donator role on your account." },
      { property: "og:title", content: "Donate to BloxSmith" },
      { property: "og:description", content: "Anything helps keep this going. Donators receive a Donator role on their account." },
      { property: "og:url", content: "https://bloxsmith.pro/donate" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/donate" }],
  }),
  component: DonatePage,
});

function DonatePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold text-slate-200 hover:text-white">← BloxSmith</Link>
          <Link to="/docs" className="text-xs text-slate-400 hover:text-white">Docs</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
          <Heart className="h-3.5 w-3.5 fill-amber-300" /> Support BloxSmith
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Anything helps keep this going</h1>
        <p className="mt-3 max-w-xl text-slate-300">
          BloxSmith is free and ad-free. Donations cover the AI bill, plugin servers, and keep new features shipping.
          As a thank you, donators receive the <span className="font-semibold text-amber-300">Donator</span> role on their account.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6">
            <div className="flex items-center gap-2 text-amber-300">
              <Heart className="h-4 w-4 fill-amber-300" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Step 1 — Donate via PayPal</h2>
            </div>
            <p className="mt-3 text-sm text-slate-300">Donate any amount, in any currency. Even $1 helps.</p>
            <a
              href="https://paypal.me/kinloch930"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300"
            >
              <Heart className="h-4 w-4 fill-slate-950" /> Open paypal.me/kinloch930
            </a>
            <p className="mt-4 text-xs text-slate-400">
              Tip: include your BloxSmith username in the PayPal note so we can match it instantly.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-2 text-blue-300">
              <Crown className="h-4 w-4" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Step 2 — Claim the Donator role</h2>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              After donating, submit your PayPal transaction ID (or the email/note you used). An admin reviews and grants
              the Donator role to your account — usually within 24 hours.
            </p>
            <ClaimSection />
          </section>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Donations are voluntary and non-refundable. They do not unlock paid features (BloxSmith is fully free) — the Donator role is a visible thank-you on your profile.
        </p>
      </main>
    </div>
  );
}

function ClaimSection() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => { if (alive) setSignedIn(!!data.user); });
    return () => { alive = false; };
  }, []);

  if (signedIn === null) {
    return <div className="mt-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>;
  }
  if (!signedIn) {
    return (
      <div className="mt-5 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm">
        <p className="text-slate-300">Sign in to claim your Donator role.</p>
        <Link to="/auth" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-400">
          Sign in
        </Link>
      </div>
    );
  }
  return <ClaimForm />;
}

function ClaimForm() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyDonationClaims);
  const submitFn = useServerFn(submitDonationClaim);
  const { data, isLoading } = useQuery({ queryKey: ["myDonationClaims"], queryFn: () => listFn() });
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => submitFn({ data: { paypalReference: ref, amountNote: note } }),
    onSuccess: () => {
      setRef(""); setNote(""); setErr(null);
      qc.invalidateQueries({ queryKey: ["myDonationClaims"] });
    },
    onError: (e: any) => setErr(e?.message || "Could not submit. Please try again."),
  });

  return (
    <div className="mt-5 space-y-4">
      {data?.isDonator && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-300">
          <Crown className="h-4 w-4" /> You already have the Donator role — thank you!
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-3"
      >
        <div>
          <label className="text-xs font-semibold text-slate-300">PayPal transaction ID, email, or note</label>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            required
            placeholder="e.g. 9XK12345AB6789012 or your PayPal email"
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-300">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Amount, date, or anything to help us match the donation"
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
          />
        </div>
        {err && <p className="text-xs text-red-300">{err}</p>}
        <button
          type="submit"
          disabled={submit.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-400 disabled:opacity-60"
        >
          {submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}
          Submit claim
        </button>
      </form>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your claims</div>
        {isLoading ? (
          <div className="mt-2 text-xs text-slate-500">Loading…</div>
        ) : !data?.claims?.length ? (
          <div className="mt-2 text-xs text-slate-500">No claims yet.</div>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.claims.map((c: any) => (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs">
                <div>
                  <div className="font-mono text-slate-200">{c.paypal_reference}</div>
                  {c.amount_note && <div className="text-slate-400">{c.amount_note}</div>}
                  {c.admin_note && <div className="mt-1 text-slate-400">Admin: {c.admin_note}</div>}
                </div>
                <StatusPill status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "approved") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
  if (status === "rejected") return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-semibold text-red-300"><XCircle className="h-3 w-3" /> Rejected</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300"><Clock className="h-3 w-3" /> Pending</span>;
}
