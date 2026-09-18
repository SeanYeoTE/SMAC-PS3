export type Tone = "good" | "bad" | "warn" | "neutral";

export const badgeTone: Record<Tone, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  bad: "border-red-500/30 bg-red-500/10 text-red-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  neutral: "border-border bg-muted text-foreground",
};

export const dotTone: Record<Tone, string> = {
  good: "bg-emerald-400",
  bad: "bg-red-400",
  warn: "bg-amber-400",
  neutral: "bg-muted-foreground",
};

export const barTone: Record<Tone, string> = {
  good: "bg-emerald-400 shadow-[0_0_10px_theme(colors.emerald.400/60%)]",
  bad: "bg-red-400 shadow-[0_0_10px_theme(colors.red.400/60%)]",
  warn: "bg-amber-400 shadow-[0_0_10px_theme(colors.amber.400/60%)]",
  neutral: "bg-primary shadow-[0_0_10px_theme(colors.cyan.400/40%)]",
};

export const ringTone: Record<Tone, string> = {
  good: "border-emerald-500/30",
  bad: "border-red-500/30",
  warn: "border-amber-500/30",
  neutral: "border-border",
};

export const leftBarTone: Record<Tone, string> = {
  good: "before:bg-emerald-400",
  bad: "before:bg-red-400",
  warn: "before:bg-amber-400",
  neutral: "before:bg-border",
};

export function confidenceTone(level: "high" | "medium" | "low"): Tone {
  return level === "high" ? "good" : level === "medium" ? "warn" : "bad";
}
