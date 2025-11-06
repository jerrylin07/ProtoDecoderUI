import { sanitizeAndCloneForUI } from "./sanitize-utils";

export class WebStreamBuffer {
  private readers: Array<{ read(data: unknown): void }> = [];
  write(data: unknown): void {
    const out = sanitizeAndCloneForUI(data); // 总是清洗
    for (const r of this.readers) r.read(out);
  }
  addReader(reader: { read(data: unknown): void }): void {
    this.readers.push(reader);
  }
  removeReader(reader: { read(data: unknown): void }): boolean {
    const index = this.readers.indexOf(reader);
    if (index !== -1) {
      this.readers.splice(index, 1);
      return true;
    }
    return false;
  }
}
