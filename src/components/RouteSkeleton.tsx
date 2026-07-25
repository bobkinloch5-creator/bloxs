// Shared loading skeletons for heavy authenticated routes.
//
// Heavy pages (3D Models, Game Builder, UI Generator) used to show a bare
// spinner while their data and chunks loaded. A skeleton that matches the real
// layout makes the wait feel far shorter and stops the page from jumping.

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function RouteSkeleton({
  title,
  columns = 2,
  cards = 6,
}: {
  title?: string;
  columns?: 1 | 2 | 3;
  cards?: number;
}) {
  const grid = columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">{title ? `Loading ${title}` : "Loading"}</span>
      <Shimmer className="h-7 w-56" />
      <Shimmer className="mt-3 h-4 w-80" />

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="mt-4 h-24 w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Shimmer key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <Shimmer className="mt-5 h-11 w-44" />
      </div>

      <div className={`mt-6 grid gap-4 ${grid}`}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <Shimmer className="h-32 w-full" />
            <Shimmer className="mt-3 h-4 w-3/4" />
            <Shimmer className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
