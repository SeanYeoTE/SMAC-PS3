export type Tone = "good" | "bad" | "warn" | "neutral";

export const badgeTone: Record<Tone, string> = {
  good: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  bad: "border-transparent bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  warn: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  neutral: "border-transparent bg-muted text-foreground",
};

export const barTone: Record<Tone, string> = {
  good: "bg-emerald-500",
  bad: "bg-red-500",
  warn: "bg-amber-500",
  neutral: "bg-primary",
};

export const ringTone: Record<Tone, string> = {
  good: "border-emerald-200 dark:border-emerald-900",
  bad: "border-red-200 dark:border-red-900",
  warn: "border-amber-200 dark:border-amber-900",
  neutral: "border-border",
};

export function confidenceTone(level: "high" | "medium" | "low"): Tone {
  return level === "high" ? "good" : level === "medium" ? "warn" : "bad";
}
