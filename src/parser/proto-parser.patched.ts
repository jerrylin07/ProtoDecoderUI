import fs from "fs";
import path from "path";

/** 尽量只去掉控制字符，保留可见字符（含日文等）。*/
function stripControlCharactersKeepVisible(input: string): string {
  return typeof input === "string"
    ? input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "")
    : (input as any);
}

/** 自底向上清理对象里的“脏字符串”；对 stamp_color 额外抽 #RRGGBB。*/
function sanitizeBinaryishStringsDeep(target: any): void {
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

export interface DumpArgs {
  baseTimestampMilliseconds: number;
  outputRootDir: string;
  parserData: any;
  unparserData: any;
}

export function dumpProtoParsedJson(args: DumpArgs) {
  const baseTimestampMilliseconds =
    args.baseTimestampMilliseconds || Date.now();
  const dateStr = new Date(baseTimestampMilliseconds)
    .toISOString()
    .replace(/[:.]/g, "");
  const dir = path.join(args.outputRootDir, dateStr);
  fs.mkdirSync(dir, { recursive: true });

  const parserFilePath = path.join(dir, "parser.json");
  const unparserFilePath = path.join(dir, "unparser.json");

  // —— 重要：写盘前统一清理 —— //
  {
    const __sanitized = JSON.parse(JSON.stringify(args.parserData));
    sanitizeBinaryishStringsDeep(__sanitized);
    fs.writeFileSync(
      parserFilePath,
      JSON.stringify(__sanitized, null, 2),
      "utf8"
    );
  }
  {
    const __sanitized = JSON.parse(JSON.stringify(args.unparserData));
    sanitizeBinaryishStringsDeep(__sanitized);
    fs.writeFileSync(
      unparserFilePath,
      JSON.stringify(__sanitized, null, 2),
      "utf8"
    );
  }

  return {
    baseTimestampMilliseconds,
    parserFilePath,
    unparserFilePath,
  };
}
