import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMyReferral, applyReferralCode } from "@/lib/referrals.functions";
import { friendlyError } from "@/lib/friendly-error";
import { Copy, Users, Gift } from "lucide-react";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals — BloxSmith" }] }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const getFn = useServerFn(getMyReferral);
  const applyFn = useServerFn(applyReferralCode);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-referral"], queryFn: () => getFn() });
  const [input, setInput] = useState("");

  const applyMut = useMutation({
    mutationFn: (code: string) => applyFn({ data: { code } }),
    onSuccess: () => {
      toast.success("Referral applied. Thanks for supporting a friend!");
      qc.invalidateQueries({ queryKey: ["my-referral"] });
      setInput("");
    },
    onError: (e) => toast.error(friendlyError(e, { fallback: "Couldn't apply code." })),
  });

  const shareUrl = typeof window !== "undefined" && data?.code
    ? `${window.location.origin}/auth?ref=${data.code}`
    : "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Refer friends — all free</h1>
        <p className="mt-2 text-sm text-slate-300">
          Share your code. When friends join with it, you both get recognized in your referrals list.
        </p>
      </header>

      <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-100">
          <Gift className="h-3.5 w-3.5" /> Your referral code
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-black/40 px-3 py-2 font-mono text-xl font-black tracking-wider">
            {data?.code ?? "Loading…"}
          </code>
          {shareUrl ? (
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl).then(() => toast.success("Link copied!"));
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/[0.12]"
            >
              <Copy className="h-3.5 w-3.5" /> Copy invite link
            </button>
          ) : null}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-300">
          <Users className="h-3.5 w-3.5" /> {data?.count ?? 0} friend{(data?.count ?? 0) === 1 ? "" : "s"} joined via your code
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.04] p-5">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">Got a code from a friend?</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="BS12345678"
            className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-indigo-400/60"
          />
          <button
            onClick={() => applyMut.mutate(input.trim())}
            disabled={!input.trim() || applyMut.isPending}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            Apply
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          You can only apply one code, and only once. BloxSmith is 100% free — this just credits the friend who invited you.
        </p>
      </div>
    </div>
  );
}
