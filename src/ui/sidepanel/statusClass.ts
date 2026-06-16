import type { StatusTone } from "./status";

export function statusToneClass(tone: StatusTone, baseClass: string): string {
  return [
    baseClass,
    tone === "saved" ? "is-saved" : "",
    tone === "pending" ? "is-pending" : "",
    tone === "unknown" ? "is-unknown" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
