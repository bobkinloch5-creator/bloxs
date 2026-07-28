import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollabPanel } from "@/components/CollabPanel";
import { Users, Sparkles, Zap, Radio, Shield, Crown } from "lucide-react";

interface CollabModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  ownerId?: string | null;
}

export function CollabModal({ open, onClose, projectId, projectName, ownerId }: CollabModalProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl border-indigo-500/30 bg-[#0d0d21]/95 text-slate-100 backdrop-blur-xl p-0 overflow-hidden shadow-[0_0_50px_rgba(79,70,229,0.3)]">
        {/* Header */}
        <div className="border-b border-indigo-500/20 bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-cyan-900/40 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>{projectName || "Project"} Collaboration</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-400" /> Realtime Synced
                  </span>
                </DialogTitle>
                <p className="text-xs font-medium text-slate-400">
                  Chat with teammates, manage invites, and track project activity live.
                </p>
              </div>
            </div>
          </div>

          {/* Credit notice banner */}
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200">
            <Zap className="h-4 w-4 shrink-0 text-cyan-300" />
            <span>
              <strong className="text-white font-bold">Independent Credits:</strong> All team members share this project, but AI commands consume each user's own credit balance!
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto bs-smooth-scroll">
          <CollabPanel projectId={projectId} ownerId={ownerId ?? null} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
