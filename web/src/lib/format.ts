const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Backend format is "Y-M-D-H-M-S-ms" with no zero padding -> "25-Dec-2026-134530". */
export function formatDoorTimestamp(raw: string): string {
  const [y, mo, d, h, mi, s] = raw.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}-${MONTHS[mo - 1]}-${y}-${pad(h)}${pad(mi)}${pad(s)}`;
}

/** Same DD-Mon-YYYY-HHMMSS style, for the current moment (e.g. a download filename). */
export function formatNowTimestamp(): string {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(t.getDate())}-${MONTHS[t.getMonth()]}-${t.getFullYear()}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
}
