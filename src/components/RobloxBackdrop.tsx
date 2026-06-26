/**
 * Global Roblox-inspired backdrop: dark gradient, blue glows, grid, floating cubes.
 * Sits as a fixed -z-10 layer so it covers every page underneath their content.
 */
type Accent = "default" | "chat" | "ideas" | "ui" | "admin" | "mcp" | "history" | "plugin" | "settings" | "collaborators";

const ACCENT_HUE: Record<Accent, string> = {
  default: "var(--bs-primary, #3b82f6)",
  chat: "#60a5fa",
  ideas: "#f59e0b",
  ui: "#a78bfa",
  admin: "#facc15",
  mcp: "#10b981",
  history: "#94a3b8",
  plugin: "#22d3ee",
  settings: "#64748b",
  collaborators: "#ec4899",
};

import robloxBg from "@/assets/roblox-bg.jpg";

export function RobloxBackdrop({ accent = "default" }: { accent?: Accent }) {
  const hue = ACCENT_HUE[accent];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* photographic Roblox-style world */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${robloxBg})`, opacity: 0.8 }}
      />
      {/* color wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 15% 0%, color-mix(in oklab, var(--bs-primary, #3b82f6) 18%, transparent), transparent 60%)," +
            "radial-gradient(900px 600px at 100% 100%, color-mix(in oklab, " + hue + " 18%, transparent), transparent 60%)",
        }}
      />

      {/* grid */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="bs-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bs-grid)" />
      </svg>
      {/* floating cubes */}
      <FloatingCube top="8%" left="6%" size={64} delay="0s" tilt={-12} hue={hue} />
      <FloatingCube top="22%" left="78%" size={92} delay="-2s" tilt={18} hue={hue} />
      <FloatingCube top="62%" left="12%" size={110} delay="-4s" tilt={-6} hue={hue} />
      <FloatingCube top="78%" left="84%" size={72} delay="-1s" tilt={22} hue={hue} />
      <FloatingCube top="44%" left="46%" size={48} delay="-3s" tilt={10} hue={hue} />
      {/* soft vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 0%, transparent 50%, rgba(0,0,0,0.45) 100%)" }} />
      <style>{`
        @keyframes bs-float { 0%,100% { transform: translateY(0) rotate(var(--bs-tilt)); } 50% { transform: translateY(-14px) rotate(calc(var(--bs-tilt) + 4deg)); } }
      `}</style>
    </div>
  );
}

function FloatingCube({ top, left, size, delay, tilt, hue }: { top: string; left: string; size: number; delay: string; tilt: number; hue: string }) {
  return (
    <div
      className="absolute"
      style={{
        top, left, width: size, height: size,
        animation: `bs-float 9s ease-in-out infinite`,
        animationDelay: delay,
        ["--bs-tilt" as any]: `${tilt}deg`,
        filter: "drop-shadow(0 10px 30px rgba(59,130,246,0.25))",
        opacity: 0.55,
      }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <linearGradient id={`cg-${size}-${tilt}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={hue} stopOpacity="0.9" />
            <stop offset="1" stopColor="#1e293b" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {/* iso cube */}
        <polygon points="50,8 92,32 50,56 8,32" fill={hue} opacity="0.85" />
        <polygon points="50,56 92,32 92,76 50,100" fill={`url(#cg-${size}-${tilt})`} />
        <polygon points="50,56 8,32 8,76 50,100" fill="#0f172a" opacity="0.85" />
      </svg>
    </div>
  );
}
