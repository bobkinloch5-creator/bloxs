import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Plus, Trash2, Loader2 } from "lucide-react";
import { listProjectMemory, setProjectMemory, deleteProjectMemory } from "@/lib/project-memory.functions";
import { WhyDidItPanel } from "@/components/WhyDidItPanel";

type Memory = {
  id: string;
  key: string;
  value: string;
  kind: string;
  importance: number;
  updated_at: string;
};

const KIND_TINTS: Record<string, string> = {
  lore: "#8b5cf6",
  rule: "#ef4444",
  decision: "#3b82f6",
  character: "#f59e0b",
  system: "#22c55e",
  style: "#ec4899",
};

export function ProjectMemoryCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newKind, setNewKind] = useState<keyof typeof KIND_TINTS>("lore");

  const listFn = useServerFn(listProjectMemory);
  const setFn = useServerFn(setProjectMemory);
  const delFn = useServerFn(deleteProjectMemory);

  const { data } = useQuery({
    queryKey: ["project-memory", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  const addMutation = useMutation({
    mutationFn: async () =>
      setFn({
        data: {
          projectId,
          key: newKey.trim(),
          value: newValue.trim(),
          kind: newKind,
          importance: 7,
        },
      }),
    onSuccess: () => {
      setNewKey("");
      setNewValue("");
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["project-memory", projectId] });
    },
  });

  const delMutation = useMutation({
    mutationFn: async (id: string) => delFn({ data: { projectId, id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-memory", projectId] });
    },
  });

  const memories = (data?.memories ?? []) as Memory[];

  return (
    <div className="bs-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--bs-grad)" }}>
          <Brain className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Project Memory</div>
          <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            {memories.length} fact{memories.length === 1 ? "" : "s"} the AI reads every turn
          </div>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-lg text-white"
          style={{ background: "var(--bs-grad)" }}
          title="Add memory"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg p-2" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))" }}>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="key (e.g. hero_name)"
            className="bs-input w-full rounded-md px-2 py-1.5 text-[11px]"
          />
          <textarea
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value (e.g. Kael, the wandering swordsman)"
            rows={2}
            className="bs-input w-full resize-none rounded-md px-2 py-1.5 text-[11px]"
          />
          <div className="flex items-center gap-2">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as keyof typeof KIND_TINTS)}
              className="bs-input rounded-md px-1.5 py-1 text-[10.5px]"
            >
              {Object.keys(KIND_TINTS).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newKey.trim() || !newValue.trim() || addMutation.isPending}
              className="flex-1 rounded-md py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--bs-grad)" }}
            >
              {addMutation.isPending ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : "Save"}
            </button>
          </div>
          {addMutation.isError && (
            <div className="rounded bg-red-500/10 px-1.5 py-1 text-[10px] text-red-500">
              {(addMutation.error as Error).message}
            </div>
          )}
        </div>
      )}

      {memories.length > 0 && (
        <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
          {memories.map((m) => {
            const tint = KIND_TINTS[m.kind] ?? "#94a3b8";
            return (
              <div
                key={m.id}
                className="flex items-start gap-1.5 rounded-lg px-2 py-1.5"
                style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))" }}
              >
                <span
                  className="mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase"
                  style={{ background: `${tint}22`, color: tint }}
                >
                  {m.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold">{m.key}</div>
                  <div className="line-clamp-2 text-[10.5px]" style={{ color: "var(--bs-muted-fg)" }}>
                    {m.value}
                  </div>
                </div>
                <button
                  onClick={() => delMutation.mutate(m.id)}
                  className="opacity-60 hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3 text-red-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!adding && memories.length === 0 && (
        <div className="mt-3 rounded-lg px-2 py-2 text-[11px]" style={{ background: "var(--bs-card-2, rgba(255,255,255,0.03))", color: "var(--bs-muted-fg)" }}>
          No memories yet — the AI will add them automatically when you state durable facts ("hero name is Kael", "combat is melee-only").
        </div>
      )}
    </div>
  );
}
