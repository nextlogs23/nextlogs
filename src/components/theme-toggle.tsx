"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("dmb-theme");
    const enabled = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", enabled);
    setDark(enabled);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("dmb-theme", next ? "dark" : "light");
  }

  return (
    <button type="button" onClick={toggle} aria-label={dark ? "Use light mode" : "Use dark mode"} className={`theme-toggle ${compact ? "theme-toggle-compact" : ""}`}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {!compact && <span>{dark ? "Light" : "Dark"}</span>}
    </button>
  );
}
