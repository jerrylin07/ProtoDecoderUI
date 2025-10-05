import fs from "fs";
import path from "path";
import { formatUtcTimestampCompact } from "./date-utils";
import { sanitizeFileName, ensureDirectory } from "./fs-utils";
import { sanitizeBinaryishStringsDeep } from "./sanitize-utils";

/* ========== 本文件内自包含的小工具，确保运行期有实现 ========== */

/** 深拷贝 + 清理 */
function sanitizeAndClone<T>(input: T): T {
  const clone: any = JSON.parse(JSON.stringify(input));
  sanitizeBinaryishStringsDeep(clone);
  return clone as T;
}

/** 通过环境变量控制是否额外输出 raw（未清洗）文件 */
const writeRaw: boolean = process.env.DUMP_RAW === "1";

/* ========== 对外导出的 API ========== */

export interface DumpArguments {
  rootDirectory?: string;
  baseTimestampMilliseconds?: number;
  methodName?: string;
  direction: "request" | "response" | string;
  parserData: any;
  unparserData: any;
}
export interface DumpResult {
  baseTimestampMilliseconds: number;
  parserFilePath: string;
  unparserFilePath: string;
}

export function dumpParserAndUnparserData(args: DumpArguments): DumpResult {
  const rootDirectory =
    args.rootDirectory ?? path.resolve(process.cwd(), "dumps");
  const baseTimestampMilliseconds =
    args.baseTimestampMilliseconds ?? Date.now();
  const timestampString = formatUtcTimestampCompact(baseTimestampMilliseconds);
  const safeMethodName = sanitizeFileName(args.methodName ?? "METHOD_unknown");

  const parserDirectoryPath = path.join(rootDirectory, "parser");
  const unparserDirectoryPath = path.join(rootDirectory, "unparser");
  ensureDirectory(parserDirectoryPath);
  ensureDirectory(unparserDirectoryPath);

  const fileName = `${safeMethodName}_${timestampString}_${args.direction}.json`;
  const parserFilePath = path.join(parserDirectoryPath, fileName);
  const unparserFilePath = path.join(unparserDirectoryPath, fileName);

  // （可选）输出 raw 版本，便于对比清洗前/后
  if (writeRaw) {
    const rawParserPath = parserFilePath.replace(/\.json$/, ".raw.json");
    const rawUnparserPath = unparserFilePath.replace(/\.json$/, ".raw.json");
    fs.writeFileSync(
      rawParserPath,
      JSON.stringify(args.parserData, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      rawUnparserPath,
      JSON.stringify(args.unparserData, null, 2),
      "utf8"
    );
  }

  // 清洗后写入正式文件
  const sanitizedParser = sanitizeAndClone(args.parserData);
  fs.writeFileSync(
    parserFilePath,
    JSON.stringify(sanitizedParser, null, 2),
    "utf8"
  );

  const sanitizedUnparser = sanitizeAndClone(args.unparserData);
  fs.writeFileSync(
    unparserFilePath,
    JSON.stringify(sanitizedUnparser, null, 2),
    "utf8"
  );

  return {
    baseTimestampMilliseconds,
    parserFilePath,
    unparserFilePath,
  };
}
