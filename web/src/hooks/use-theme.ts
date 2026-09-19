"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  // Always starts "light" to match the server-rendered markup exactly; the effect below
  // re-syncs to the real DOM class (set by the inline FOUC-prevention script in layout.tsx)
  // right after mount, avoiding a hydration mismatch on the toggle's own rendered output.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-only read; the inline <script> in layout.tsx sets the DOM class before hydration, so state must re-sync once on mount.
    setTheme(readTheme());
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
