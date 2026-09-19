"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="flex items-center gap-0.5 rounded-full border border-border bg-background p-[3px]"
    >
      <span className={cn("flex size-6 items-center justify-center rounded-full", theme === "dark" ? "bg-muted text-foreground" : "text-muted-foreground")}>
        <Moon className="size-3.5" aria-hidden="true" />
      </span>
      <span className={cn("flex size-6 items-center justify-center rounded-full", theme === "light" ? "bg-muted text-foreground" : "text-muted-foreground")}>
        <Sun className="size-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}
