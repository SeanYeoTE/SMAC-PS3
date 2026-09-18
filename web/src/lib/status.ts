export type Tone = "good" | "bad" | "warn" | "neutral";

export const badgeTone: Record<Tone, string> = {
  good: "border-emerald-600/25 bg-emerald-600/10 text-emerald-700",
  bad: "border-red-600/25 bg-red-600/10 text-red-700",
  warn: "border-amber-600/25 bg-amber-500/15 text-amber-700",
  neutral: "border-border bg-muted text-foreground",
};

export const dotTone: Record<Tone, string> = {
  good: "bg-emerald-600",
  bad: "bg-red-600",
  warn: "bg-amber-600",
  neutral: "bg-muted-foreground",
};

export const textTone: Record<Tone, string> = {
  good: "text-emerald-700",
  bad: "text-red-700",
  warn: "text-amber-700",
  neutral: "text-foreground",
};

export const barTone: Record<Tone, string> = {
  good: "bg-emerald-600",
  bad: "bg-red-600",
  warn: "bg-amber-500",
  neutral: "bg-primary",
};

export const ringTone: Record<Tone, string> = {
  good: "border-emerald-600/25",
  bad: "border-red-600/25",
  warn: "border-amber-600/25",
  neutral: "border-border",
};

export const leftBarTone: Record<Tone, string> = {
  good: "before:bg-emerald-600",
  bad: "before:bg-red-600",
  warn: "before:bg-amber-600",
  neutral: "before:bg-border",
};

export function confidenceTone(level: "high" | "medium" | "low"): Tone {
  return level === "high" ? "good" : level === "medium" ? "warn" : "bad";
}
