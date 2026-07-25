import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { Wrench, ShieldCheck } from "lucide-react";

// Paths that MUST remain accessible even when maintenance mode is on.
// Admins/owners need to sign in and reach the admin panel to toggle it off.
const ALLOWED_PATHS = ["/auth", "/admin"];
// Assets/API always pass through (this component only wraps page routes)

function isAllowedPath(pathname: string) {
  if (ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (pathname.startsWith("/_authenticated/admin")) return true;
  return false;
}

/** Floating Roblox-style block cube SVG */
function RobloxBlock({ style }: { style: React.CSSProperties }) {
  return (
    <div className="rblx-block" style={style}>
      <div className="rblx-block-face rblx-block-top" />
      <div className="rblx-block-face rblx-block-front" />
      <div className="rblx-block-face rblx-block-right" />
    </div>
  );
}

const BLOCKS = [
  { top: "8%",  left: "5%",  size: 32, delay: 0,    dur: 9,  color: "#2563eb" },
  { top: "15%", left: "88%", size: 24, delay: 1.5,  dur: 11, color: "#7c3aed" },
  { top: "72%", left: "8%",  size: 28, delay: 0.8,  dur: 8,  color: "#0891b2" },
  { top: "80%", left: "85%", size: 36, delay: 2.2,  dur: 12, color: "#1d4ed8" },
  { top: "40%", left: "93%", size: 20, delay: 3.0,  dur: 10, color: "#6d28d9" },
  { top: "55%", left: "2%",  size: 22, delay: 1.2,  dur: 9,  color: "#0e7490" },
  { top: "25%", left: "50%", size: 16, delay: 4.0,  dur: 13, color: "#3b82f6" },
  { top: "90%", left: "45%", size: 26, delay: 0.3,  dur: 7,  color: "#8b5cf6" },
  { top: "5%",  left: "65%", size: 18, delay: 2.5,  dur: 11, color: "#06b6d4" },
  { top: "60%", left: "60%", size: 14, delay: 5.0,  dur: 14, color: "#2563eb" },
];

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ enabled: boolean; message: string } | null>(null);
  const [isPrivileged, setIsPrivileged] = useState<boolean>(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/public/maintenance", { cache: "no-store" });
        const data = res.ok ? await res.json() : { enabled: false, message: "" };
        if (cancelled) return;
        setStatus({ enabled: !!data.enabled, message: data.message ?? "" });

        if (data.enabled) {
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            const { data: sess } = await supabase.auth.getSession();
            const uid = sess.session?.user?.id;
            if (uid) {
              const { data: roles } = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", uid)
                .in("role", ["admin", "owner"]);
              if (!cancelled) setIsPrivileged((roles ?? []).length > 0);
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled) setStatus({ enabled: false, message: "" });
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    check();
    const t = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!checked || !status) return <>{children}</>;

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : router.state.location.pathname;

  const shouldBlock = status.enabled && !isPrivileged && !isAllowedPath(pathname);
  if (!shouldBlock) return <>{children}</>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');

        .maint-root {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
          background: #05061a;
          font-family: 'Nunito', sans-serif;
        }

        /* === Roblox sky-gradient background === */
        .maint-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(37,99,235,0.45) 0%, transparent 70%),
            radial-gradient(ellipse 60% 50% at 90% 80%, rgba(109,40,217,0.30) 0%, transparent 65%),
            radial-gradient(ellipse 50% 40% at 10% 80%, rgba(8,145,178,0.25) 0%, transparent 65%),
            linear-gradient(160deg, #05061a 0%, #0a0f2e 40%, #0c0828 70%, #05061a 100%);
        }

        /* Subtle grid overlay */
        .maint-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        /* Horizon glow line */
        .maint-horizon {
          position: absolute;
          left: 0; right: 0;
          top: 65%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(59,130,246,0.3), rgba(139,92,246,0.3), transparent);
          box-shadow: 0 0 60px 20px rgba(59,130,246,0.12);
        }

        /* === Floating isometric blocks === */
        @keyframes floatBlock {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.7; }
          33%       { transform: translateY(-18px) rotate(4deg); opacity: 0.9; }
          66%       { transform: translateY(-8px) rotate(-3deg); opacity: 0.75; }
        }

        .rblx-block {
          position: absolute;
          transform-style: preserve-3d;
          transform: rotateX(30deg) rotateY(45deg);
          animation: floatBlock var(--dur, 10s) ease-in-out infinite;
          animation-delay: var(--delay, 0s);
          pointer-events: none;
        }

        .rblx-block-face {
          position: absolute;
          border-radius: 3px;
        }

        .rblx-block-top {
          width: var(--sz, 32px);
          height: var(--sz, 32px);
          background: var(--c-top, #3b82f6);
          transform: rotateX(90deg) translateZ(calc(var(--sz, 32px) / 2));
          box-shadow: inset 0 0 8px rgba(255,255,255,0.2);
        }

        .rblx-block-front {
          width: var(--sz, 32px);
          height: var(--sz, 32px);
          background: var(--c-front, #2563eb);
          transform: translateZ(calc(var(--sz, 32px) / 2));
          box-shadow: inset 0 0 6px rgba(0,0,0,0.25);
        }

        .rblx-block-right {
          width: var(--sz, 32px);
          height: var(--sz, 32px);
          background: var(--c-right, #1d4ed8);
          transform: rotateY(90deg) translateZ(calc(var(--sz, 32px) / 2));
          box-shadow: inset 0 0 6px rgba(0,0,0,0.4);
        }

        /* === Particle dots === */
        @keyframes particleDrift {
          0%   { transform: translateY(100vh) scale(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-10vh) scale(1.5); opacity: 0; }
        }

        .maint-particle {
          position: absolute;
          border-radius: 50%;
          animation: particleDrift linear infinite;
          pointer-events: none;
        }

        /* === Main card === */
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(32px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .maint-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 480px;
          border-radius: 24px;
          padding: 40px 36px;
          text-align: center;
          animation: cardIn 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
          background: rgba(10, 14, 40, 0.80);
          border: 1px solid rgba(99, 102, 241, 0.30);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04),
            0 40px 80px rgba(0,0,0,0.6),
            0 0 60px rgba(37,99,235,0.15),
            inset 0 1px 0 rgba(255,255,255,0.06);
          backdrop-filter: blur(18px);
        }

        /* Top glow stripe */
        .maint-card::before {
          content: '';
          position: absolute;
          top: 0; left: 10%; right: 10%;
          height: 2px;
          border-radius: 2px;
          background: linear-gradient(90deg, transparent, #6366f1, #3b82f6, #6366f1, transparent);
        }

        /* Wrench icon orb */
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234,179,8,0.4), 0 0 30px rgba(234,179,8,0.2); }
          50%       { box-shadow: 0 0 0 10px rgba(234,179,8,0), 0 0 50px rgba(234,179,8,0.35); }
        }

        .maint-icon-orb {
          margin: 0 auto 20px;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle, rgba(234,179,8,0.25) 0%, rgba(234,179,8,0.08) 70%);
          border: 1px solid rgba(234,179,8,0.35);
          animation: pulse-glow 2.5s ease-in-out infinite;
        }

        .maint-title {
          font-size: 28px;
          font-weight: 900;
          color: #fff;
          letter-spacing: -0.5px;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 60%, #818cf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .maint-subtitle {
          font-size: 14px;
          line-height: 1.65;
          color: #94a3b8;
          margin-bottom: 28px;
        }

        .maint-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(234,179,8,0.1);
          border: 1px solid rgba(234,179,8,0.25);
          border-radius: 99px;
          padding: 4px 12px;
          font-size: 11px;
          font-weight: 700;
          color: #fbbf24;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 24px;
        }

        .maint-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #fbbf24;
          animation: pulse-dot 1.4s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }

        .maint-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }

        .maint-btn-staff {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 20px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          color: #e2e8f0;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          text-decoration: none;
          transition: background 0.2s, border-color 0.2s;
          cursor: pointer;
        }

        .maint-btn-staff:hover {
          background: rgba(255,255,255,0.11);
          border-color: rgba(255,255,255,0.22);
        }

        .maint-btn-discord {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 22px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
          border: 1px solid rgba(88,101,242,0.5);
          text-decoration: none;
          box-shadow: 0 4px 20px rgba(88,101,242,0.35);
          transition: box-shadow 0.2s, transform 0.15s;
        }

        .maint-btn-discord:hover {
          box-shadow: 0 6px 28px rgba(88,101,242,0.55);
          transform: translateY(-1px);
        }

        .maint-divider {
          width: 100%;
          height: 1px;
          background: rgba(255,255,255,0.06);
          margin: 20px 0 14px;
        }

        .maint-footer {
          font-size: 11px;
          color: #475569;
        }

        /* Roblox logo-style "R" badge */
        .maint-roblox-badge {
          position: absolute;
          top: 18px;
          right: 20px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(255,255,255,0.15);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
      `}</style>

      <div className="maint-root">
        {/* Background layers */}
        <div className="maint-bg" />
        <div className="maint-grid" />
        <div className="maint-horizon" />

        {/* Floating Roblox blocks */}
        {BLOCKS.map((b, i) => (
          <div
            key={i}
            className="rblx-block"
            style={{
              top: b.top,
              left: b.left,
              "--sz": `${b.size}px`,
              "--c-top": b.color,
              "--c-front": b.color + "cc",
              "--c-right": b.color + "88",
              "--dur": `${b.dur}s`,
              "--delay": `${b.delay}s`,
            } as React.CSSProperties}
          >
            <div className="rblx-block-face rblx-block-top" />
            <div className="rblx-block-face rblx-block-front" />
            <div className="rblx-block-face rblx-block-right" />
          </div>
        ))}

        {/* Particle dots */}
        {[...Array(12)].map((_, i) => (
          <div
            key={`p${i}`}
            className="maint-particle"
            style={{
              left: `${(i * 8.5) % 100}%`,
              width: `${3 + (i % 3)}px`,
              height: `${3 + (i % 3)}px`,
              background: i % 3 === 0 ? "#6366f1" : i % 3 === 1 ? "#3b82f6" : "#06b6d4",
              animationDuration: `${8 + (i * 1.3) % 7}s`,
              animationDelay: `${(i * 0.9) % 6}s`,
              opacity: 0.5 + (i % 4) * 0.1,
            }}
          />
        ))}

        {/* Main card */}
        <div className="maint-card">
          <div className="maint-roblox-badge">BloxSmith Pro</div>

          <div className="maint-badge">
            <span className="maint-badge-dot" />
            Maintenance in progress
          </div>

          <div className="maint-icon-orb">
            <Wrench style={{ width: 32, height: 32, color: "#fbbf24" }} />
          </div>

          <h1 className="maint-title">We&apos;re under maintenance</h1>

          <p className="maint-subtitle">
            {status.message ||
              "BloxSmith is being updated. We're adding new features and improvements. We'll be back online shortly — thanks for your patience!"}
          </p>

          <div className="maint-actions">
            <a
              href="https://discord.gg/YJ8xPFNSSX"
              target="_blank"
              rel="noopener noreferrer"
              className="maint-btn-discord"
            >
              {/* Discord icon */}
              <svg width="18" height="14" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.7a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0 37.6 37.6 0 0 0-1.8-3.7.22.22 0 0 0-.2-.1A58.3 58.3 0 0 0 10.7 4.9a.2.2 0 0 0-.1.1C1.6 18.3-.9 31.3.3 44.1a.24.24 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 8.9.22.22 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.21.21 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.22.22 0 0 1 0-.4l1.1-.9a.21.21 0 0 1 .2 0c11.6 5.3 24.1 5.3 35.5 0a.21.21 0 0 1 .2 0l1.1.9a.22.22 0 0 1 0 .4 36.2 36.2 0 0 1-5.5 2.6.22.22 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.21.21 0 0 0 .2.1 58.7 58.7 0 0 0 17.7-8.9.22.22 0 0 0 .1-.2C73.7 29.2 70.5 16.3 60.2 5a.15.15 0 0 0-.1-.1ZM23.7 36.4c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z" fill="#fff"/>
              </svg>
              Join our Discord for updates
            </a>

            <a href="/auth" className="maint-btn-staff">
              <ShieldCheck style={{ width: 14, height: 14 }} />
              Staff sign in
            </a>
          </div>

          <div className="maint-divider" />
          <div className="maint-footer">discord.gg/YJ8xPFNSSX · BloxSmith Pro © 2026</div>
        </div>
      </div>
    </>
  );
}
