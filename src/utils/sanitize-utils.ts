export function stripControlCharactersKeepVisible(input: string): string {
  return typeof input === "string"
    ? input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "")
    : (input as any);
}

export function sanitizeBinaryishStringsDeep(target: any): void {
  if (target == null) return;
  if (Array.isArray(target)) {
    target.forEach(sanitizeBinaryishStringsDeep);
    return;
  }
  if (typeof target !== "object") return;

  for (const key of Object.keys(target)) {
    const value = (target as any)[key];
    if (typeof value === "string") {
      if (key === "stamp_color") {
        const hex = value.match(/#[0-9A-Fa-f]{6}/);
        if (hex) {
          (target as any)[key] = hex[0];
          continue;
        }
      }
      (target as any)[key] = stripControlCharactersKeepVisible(value);
    } else if (Array.isArray(value)) {
      value.forEach(sanitizeBinaryishStringsDeep);
    } else if (value && typeof value === "object") {
      sanitizeBinaryishStringsDeep(value);
    }
  }
}

export function sanitizeAndCloneForUI<T>(obj: T): T {
  if (obj == null) return obj as any; // 直接返回 null/undefined
  const clone: any = JSON.parse(JSON.stringify(obj));
  sanitizeBinaryishStringsDeep(clone);
  return clone as T;
}
