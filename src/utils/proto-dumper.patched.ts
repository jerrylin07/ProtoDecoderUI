import fs from "fs";
import path from "path";
import { formatUtcTimestampCompact } from "./date-utils";
import { sanitizeFileName, ensureDirectory } from "./fs-utils";
import { sanitizeBinaryishStringsDeep } from "./sanitize-utils";
function sanitizeAndClone<T>(input: T): T {
  const clone: any = JSON.parse(JSON.stringify(input));
  sanitizeBinaryishStringsDeep(clone);
  return clone as T;
}
const writeRaw: boolean = process.env.DUMP_RAW === "1";
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
