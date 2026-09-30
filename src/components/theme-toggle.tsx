"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

// The theme lives on <html data-theme>, set before paint by the script in the root layout.
// Every toggle on the page reads it from there, so two toggles never disagree.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const isDark = () => document.documentElement.dataset.theme === "dark";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = isDark() ? "light" : "dark";
    try {
      localStorage.setItem("sb-theme", next);
    } catch {}
    const apply = () => {
      document.documentElement.dataset.theme = next;
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduce) document.startViewTransition(apply);
    else apply();
  }

  return (
    <button type="button" className={`theme-sw ${className}`} role="switch" aria-checked={dark} aria-label="מצב כהה" title="מעבר בין מצב בהיר לכהה" onClick={toggle}>
      <span className="knob" />
      <span className="ic sun"><Sun size={17} weight="fill" /></span>
      <span className="ic moon"><Moon size={17} weight="fill" /></span>
    </button>
  );
}
