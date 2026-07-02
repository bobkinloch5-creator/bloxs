// Interactive 3D preview for a Roblox toolbox asset. Loads the OBJ+MTL
// bundle Roblox exposes via thumbnails.roblox.com and renders it inside a
// react-three-fiber canvas with OrbitControls (drag = orbit, scroll = zoom,
// right-drag = pan).
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Center, Bounds, useBounds } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { TextureLoader } from "three";
import { Loader2, X, RotateCcw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAsset3D } from "@/lib/asset-3d.functions";

function Model({ obj, mtl }: { obj: string; mtl: string | null }) {
  // Preload textures via MTL when available so materials come out right.
  const materials = mtl
    ? useLoader(MTLLoader, mtl, (loader) => {
        (loader as unknown as { setCrossOrigin: (v: string) => void }).setCrossOrigin("anonymous");
      })
    : null;
  const scene = useLoader(OBJLoader, obj, (loader) => {
    if (materials) {
      materials.preload();
      (loader as OBJLoader).setMaterials(materials);
    }
  });
  return <primitive object={scene} />;
}

function FitToView() {
  const bounds = useBounds();
  useEffect(() => { bounds.refresh().clip().fit(); }, [bounds]);
  return null;
}

export function Asset3DPreview({ assetId, name, onClose }: { assetId: number; name: string; onClose: () => void }) {
  const fetchFn = useServerFn(getAsset3D);
  const q = useQuery({
    queryKey: ["asset3d", assetId],
    queryFn: () => fetchFn({ data: { assetId } }),
    staleTime: 5 * 60_000,
  });

  const controlsRef = useRef<any>(null);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl h-[70vh] rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-black overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 p-3 bg-gradient-to-b from-black/70 to-transparent">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{name}</div>
            <div className="text-[10.5px] text-muted-foreground">Drag to rotate · Scroll to zoom · Right-drag to pan</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => controlsRef.current?.reset?.()}
              title="Reset view"
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/[0.12]"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.06] p-1.5 text-white hover:bg-white/[0.12]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {q.isLoading && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Preparing 3D preview…</div>
          </div>
        )}

        {!q.isLoading && (!q.data?.ready || !q.data.obj) && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-muted-foreground">
            Roblox hasn't baked a 3D preview for this asset yet. Try again in a few seconds, or open it on the Creator Store.
          </div>
        )}

        {q.data?.ready && q.data.obj && (
          <Canvas
            key={assetId}
            camera={{ position: [4, 3, 6], fov: 40 }}
            dpr={[1, 2]}
            gl={{ antialias: true, preserveDrawingBuffer: false }}
            className="!absolute !inset-0"
          >
            <color attach="background" args={["#0b1220"]} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={1.1} />
            <directionalLight position={[-5, -3, -5]} intensity={0.35} />
            <Suspense fallback={null}>
              <Bounds fit clip observe margin={1.25}>
                <Center>
                  <Model obj={q.data.obj} mtl={q.data.mtl ?? null} />
                </Center>
                <FitToView />
              </Bounds>
              <Environment preset="city" />
            </Suspense>
            <OrbitControls
              ref={controlsRef}
              makeDefault
              enableDamping
              dampingFactor={0.08}
              minDistance={0.5}
              maxDistance={200}
            />
            <gridHelper args={[40, 40, "#1f2937", "#111827"]} position={[0, -0.001, 0]} />
          </Canvas>
        )}
      </div>
    </div>
  );
}
