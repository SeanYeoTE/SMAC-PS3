"use client";

import { Bell, Download, LayoutGrid, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "fleet" | "analyze" | "alerts" | "report";

const TABS: { key: MobileTab; label: string; icon: typeof LayoutGrid }[] = [
  { key: "fleet", label: "Fleet", icon: LayoutGrid },
  { key: "analyze", label: "Analyze", icon: UploadCloud },
  { key: "alerts", label: "Alerts", icon: Bell },
  { key: "report", label: "Report", icon: Download },
];

export function MobileTabBar({ active, onChange }: { active: MobileTab; onChange: (tab: MobileTab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card/95 backdrop-blur md:hidden">
      {TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium",
            active === key ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );
}
