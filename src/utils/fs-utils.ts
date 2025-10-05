import fs from "fs";
export function sanitizeFileName(s: string): string {
  const cleaned = (s || "unknown")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
  return cleaned.slice(0, 120) || "unknown";
}
export function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
