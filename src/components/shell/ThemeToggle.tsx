"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;

    // Suppress colour transitions for the frame the palette swaps in.
    const style = document.createElement("style");
    style.appendChild(
      document.createTextNode("*,*::before,*::after{transition:none!important;animation:none!important}"),
    );
    document.head.appendChild(style);

    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("openigcse-theme", next);
    } catch {
      // Storage may be blocked in private mode; the in-memory state still applies.
    }

    void root.offsetHeight;
    requestAnimationFrame(() => style.remove());

    setTheme(next);
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-[18px]" strokeWidth={2} />
      ) : (
        <Moon aria-hidden="true" className="size-[18px]" strokeWidth={2} />
      )}
    </button>
  );
}
