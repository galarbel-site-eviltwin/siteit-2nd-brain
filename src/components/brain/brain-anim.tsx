"use client";

import { useEffect, useRef } from "react";
import { mountBrain } from "./brain-engine";

type Props = { fit?: "contain" | "cover"; glow?: number; className?: string; label?: string };

// The brain needs a dark stage behind it: its glow is drawn in "screen" blend mode.
export function BrainAnim({ fit = "contain", glow = 1, className = "", label }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return mountBrain(ref.current, { src: "/brand/brain.webp", brightSrc: "/brand/brain-bright.webp", fit, glow });
  }, [fit, glow]);

  return <div ref={ref} className={`brain ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
