import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Zap, X, Check, ShieldCheck, Heart, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { TOP_UP_PACKS, submitPayPalTopUpClaim, addCreditsFromPayPal, type TopUpPack } from "@/lib/paypal.functions";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentCredits?: number;
}

export function PayPalTopUpModal({ isOpen, onClose, currentCredits = 0 }: Props) {
  const [selectedPack, setSelectedPack] = useState<TopUpPack>(TOP_UP_PACKS[1]); // Default to 300 credits Pro pack
  const [paypalRef, setPaypalRef] = useState("");
  const [userNote, setUserNote] = useState("");
  const [simulatingInstant, setSimulatingInstant] = useState(false);
  const queryClient = useQueryClient();

  const claimFn = useServerFn(submitPayPalTopUpClaim);
  const instantFn = useServerFn(addCreditsFromPayPal);

  const claimMut = useMutation({
    mutationFn: async () => claimFn({ data: { paypalReference: paypalRef, packId: selectedPack.id, note: userNote } }),
    onSuccess: (res) => {
      toast.success(`Top-Up request submitted for ${res.packName}! An admin will approve your credits shortly.`);
      setPaypalRef("");
      setUserNote("");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["myDonationClaims"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to submit top-up claim. Please try again.");
    },
  });

  const instantMut = useMutation({
    mutationFn: async (orderId: string) => instantFn({ data: { packId: selectedPack.id, paypalOrderId: orderId } }),
    onSuccess: (res) => {
      toast.success(`🎉 Success! Added +${res.creditsAdded} Credits to your account!`);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to apply instant credits.");
    },
  });

  if (!isOpen) return null;

  const handlePayPalDirectClick = () => {
    // Open paypal.me directly with pre-selected amount
    const paypalMeUrl = `https://paypal.me/kinloch930/${selectedPack.priceUsd}USD`;
    window.open(paypalMeUrl, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-[#0b0b24] via-[#09091b] to-[#04040d] p-6 text-slate-100 shadow-[0_0_80px_rgba(34,211,238,0.25)] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-indigo-500/30 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-purple-600 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.4)]">
              <Zap className="h-5 w-5 fill-slate-950 stroke-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white">PayPal Credit Top-Up</h2>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-300">
                  Instant Access
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Top up your AI credits directly with PayPal to keep generating Luau scripts & Studio builds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-400 hover:border-cyan-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Discord Requirement Alert Banner */}
        <div className="my-3 rounded-2xl border border-indigo-400/40 bg-gradient-to-r from-indigo-950/80 via-purple-950/80 to-indigo-950/80 p-3.5 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white font-black text-xs">
              1
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                Join our Discord Server First!
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.2 text-[9px] font-bold text-emerald-300 border border-emerald-500/40">Required</span>
              </h4>
              <p className="text-[11px] text-indigo-200/90 leading-tight">
                Before paying on the site, join our Discord server so admins can verify & deliver your credits immediately.
              </p>
            </div>
            <a
              href="https://discord.gg/6QDYT3RUkv"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-400 transition shadow-md"
            >
              Join Discord <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Current Balance Banner */}
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-indigo-500/30 bg-indigo-950/40 px-4 py-2.5">
          <span className="text-xs font-semibold text-slate-300">Current Account Balance</span>
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-cyan-300">
            <Zap className="h-4 w-4 text-cyan-300 animate-pulse" />
            {currentCredits} Credits (50 Free Credits Monthly + 1 Free Model)
          </span>
        </div>

        {/* Pack Selection Grid */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOP_UP_PACKS.map((pack) => {
            const isSelected = selectedPack.id === pack.id;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelectedPack(pack)}
                className={`relative flex flex-col justify-between rounded-2xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-cyan-400 bg-gradient-to-b from-indigo-900/60 to-purple-950/80 shadow-[0_0_25px_rgba(34,211,238,0.35)] ring-2 ring-cyan-400/40"
                    : "border-indigo-500/20 bg-[#0d0d26]/80 hover:border-cyan-400/50 hover:bg-[#121236]"
                }`}
              >
                {pack.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[9px] font-black uppercase text-slate-950 shadow-sm">
                    Popular
                  </span>
                )}
                <div>
                  <div className="text-[11px] font-extrabold text-cyan-300">{pack.name}</div>
                  <div className="mt-1 text-lg font-black text-white">+{pack.credits}</div>
                  <div className="text-[10px] text-slate-400">Credits</div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2">
                  <span className="text-sm font-extrabold text-emerald-400">${pack.priceUsd.toFixed(2)}</span>
                  {isSelected && <Check className="h-4 w-4 text-cyan-300" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Package Action Box */}
        <div className="rounded-2xl border border-cyan-400/30 bg-[#0e0e2e]/90 p-4 space-y-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2">
            <span className="font-extrabold text-white">Selected Top-Up Pack:</span>
            <span className="font-extrabold text-cyan-300">
              {selectedPack.name} (+{selectedPack.credits} Credits for ${selectedPack.priceUsd.toFixed(2)})
            </span>
          </div>

          {/* Step 2: Open PayPal.me */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Step 2: Pay via PayPal</label>
            <button
              type="button"
              onClick={handlePayPalDirectClick}
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 py-2.5 text-xs font-black text-slate-950 hover:brightness-110 shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition active:scale-[0.99]"
            >
              <Heart className="h-4 w-4 fill-slate-950" />
              Pay ${selectedPack.priceUsd.toFixed(2)} via paypal.me/kinloch930
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Step 3: Input Transaction Reference */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!paypalRef.trim()) {
                toast.error("Please enter your PayPal transaction ID or PayPal email.");
                return;
              }
              claimMut.mutate();
            }}
            className="space-y-2.5 pt-1"
          >
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
              Step 3: Enter PayPal Transaction ID or Email
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={paypalRef}
                onChange={(e) => setPaypalRef(e.target.value)}
                placeholder="e.g. 9XK12345AB6789012 or your PayPal email"
                required
                className="flex-1 rounded-xl border border-indigo-500/50 bg-[#070718] px-3 py-2 text-xs font-semibold text-white placeholder-slate-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
              <button
                type="submit"
                disabled={claimMut.isPending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-xs font-extrabold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50 transition"
              >
                {claimMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Confirm Top-Up
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Tip: Include your Discord handle or BloxSmith username in the PayPal note for instant automated crediting!
            </p>
          </form>
        </div>

        {/* Security & Money-Back Note */}
        <div className="mt-4 flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Secure transaction via PayPal
          </span>
          <span>Credits add directly to your BloxSmith profile</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
