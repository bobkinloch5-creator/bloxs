// Lazy wrapper around the 3D asset viewer.
//
// three.js + @react-three/fiber + @react-three/drei is the largest chunk in the
// bundle, and it is only needed when someone actually opens a model preview.
// Importing it through React.lazy keeps it out of the initial page load for
// every other route (and out of the 3D Models page until a preview is opened).
import { Suspense, lazy } from "react";
import { Loader2, X } from "lucide-react";

const Asset3DPreviewImpl = lazy(() =>
  import("@/components/models/Asset3DPreview").then((m) => ({ default: m.Asset3DPreview })),
);

type Props = { assetId: number; name: string; onClose: () => void };

function ViewerSkeleton({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative flex h-[70vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-md border border-white/15 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          <p className="text-xs font-medium">Loading 3D viewer...</p>
        </div>
      </div>
    </div>
  );
}

export function Asset3DPreviewLazy({ assetId, name, onClose }: Props) {
  return (
    <Suspense fallback={<ViewerSkeleton name={name} onClose={onClose} />}>
      <Asset3DPreviewImpl assetId={assetId} name={name} onClose={onClose} />
    </Suspense>
  );
}
