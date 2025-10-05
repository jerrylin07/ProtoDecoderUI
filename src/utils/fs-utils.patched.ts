import fs from "fs";
import path from "path";
export function sanitizeFileName(s: string): string {
  const cleaned = (s || "unknown")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
  return cleaned.slice(0, 120) || "unknown";
}
export function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
export function writeFileAtomicSync(
  finalPath: string,
  data: string | Buffer,
  options?: {
    encoding?: BufferEncoding;
    mode?: number;
    fsyncDirectory?: boolean;
    maxRenameRetries?: number;
  }
): void {
  const opts = {
    encoding: (options?.encoding ??
      (typeof data === "string" ? "utf8" : undefined)) as
      | BufferEncoding
      | undefined,
    mode: options?.mode ?? 0o666,
    fsyncDirectory: options?.fsyncDirectory ?? false,
    maxRenameRetries: options?.maxRenameRetries ?? 5,
  };
  const dir = path.dirname(finalPath);
  const base = path.basename(finalPath);
  const tmpPath = path.join(
    dir,
    `.${base}.tmp-${process.pid}-${Date.now()}-${Math.floor(
      Math.random() * 1e9
    )}`
  );
  ensureDirectory(dir);
  const fd = fs.openSync(tmpPath, "wx", opts.mode);
  try {
    if (typeof data === "string") {
      fs.writeFileSync(fd, data, { encoding: opts.encoding });
    } else {
      fs.writeFileSync(fd, data);
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  let attempts = 0;
  const maxAttempts = Math.max(1, opts.maxRenameRetries);
  let lastErr: unknown = null;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      fs.renameSync(tmpPath, finalPath);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const backoffMs = 5 * 2 ** (attempts - 1);
      const start = Date.now();
      while (Date.now() - start < backoffMs) {
        /* spin-wait */
      }
    }
  }
  if (lastErr) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw lastErr;
  }
  if (opts.fsyncDirectory) {
    try {
      const dfd = fs.openSync(dir, "r");
      try {
        fs.fsyncSync(dfd);
      } finally {
        fs.closeSync(dfd);
      }
    } catch {}
  }
}
