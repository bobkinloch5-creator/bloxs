import { useEffect, useRef, useState, type ReactNode, type ElementType } from "react";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Adds `.is-revealed` to an element the first time it scrolls into view.
 * Uses IntersectionObserver, so it costs nothing while off screen and does not
 * run a scroll listener. Falls back to "immediately visible" when the API is
 * unavailable or the user asked for reduced motion.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const once = options?.once ?? true;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setRevealed(false);
          }
        }
      },
      {
        threshold: options?.threshold ?? 0.12,
        rootMargin: options?.rootMargin ?? "0px 0px -8% 0px",
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.threshold, options?.rootMargin, options?.once]);

  return { ref, revealed } as const;
}

type RevealProps = {
  children: ReactNode;
  /** Direction the content travels in from. */
  variant?: "up" | "left" | "right" | "zoom" | "blur";
  /** Stagger direct children instead of moving the whole block at once. */
  stagger?: boolean;
  /** 0-6, maps to a 60ms step. */
  delay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  as?: ElementType;
  className?: string;
};

const VARIANT: Record<NonNullable<RevealProps["variant"]>, string> = {
  up: "",
  left: "reveal-left",
  right: "reveal-right",
  zoom: "reveal-zoom",
  blur: "reveal-blur",
};

/** Wrapper that fades + slides its content in on scroll. */
export function Reveal({
  children, variant = "up", stagger = false, delay = 0, as: Tag = "div", className = "",
}: RevealProps) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const classes = [
    "reveal",
    VARIANT[variant],
    stagger ? "stagger" : "",
    delay ? `delay-${delay}` : "",
    revealed ? "is-revealed" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <Tag ref={ref} className={classes}>
      {children}
    </Tag>
  );
}

/**
 * Counts a number up when it scrolls into view. Uses requestAnimationFrame with
 * an ease-out curve so it decelerates instead of running at a constant rate.
 */
export function CountUp({
  value, duration = 1100, decimals = 0, prefix = "", suffix = "", className = "",
}: {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const { ref, revealed } = useReveal<HTMLSpanElement>();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!revealed) return;
    if (prefersReducedMotion()) { setDisplay(value); return; }

    let raf = 0;
    const start = performance.now();
    const from = 0;

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [revealed, value, duration]);

  return (
    <span ref={ref} className={`tick-num ${className}`}>
      {prefix}
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/**
 * Tracks the pointer inside a card and exposes it as --mx / --my, which the
 * `.spotlight` and `.tilt` CSS classes read. Pointer tracking is skipped on
 * touch devices, where there is no hover state to speak of.
 */
export function usePointerGlow<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) return;
    if (prefersReducedMotion()) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", String((e.clientX - rect.left) / rect.width));
        el.style.setProperty("--my", String((e.clientY - rect.top) / rect.height));
      });
    };
    const onLeave = () => {
      el.style.setProperty("--mx", "0.5");
      el.style.setProperty("--my", "0.5");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return ref;
}

/** Card surface with a cursor-following spotlight and hover lift. */
export function GlowCard({
  children, className = "", tilt = false,
}: { children: ReactNode; className?: string; tilt?: boolean }) {
  const ref = usePointerGlow<HTMLDivElement>();
  return (
    <div ref={ref} className={`spotlight hover-lift ${tilt ? "tilt" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Three-dot "thinking" indicator for streaming AI responses. */
export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label="Loading">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}
