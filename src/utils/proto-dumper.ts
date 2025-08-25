import fs from "fs";
import path from "path";
export type Direction = "request" | "response";
// ──────────────────────────────────────────────────────────────────────────────
// Time & filesystem helpers (no abbreviations in names)
// ──────────────────────────────────────────────────────────────────────────────
const padTwoDigits = (value: number) => String(value).padStart(2, "0");
const padThreeDigits = (value: number) => String(value).padStart(3, "0");
/**
 * Format milliseconds since epoch to a compact UTC timestamp.
 * Example: 2025-08-24 20:30:54.500Z → "20250824T203054500"
 */
export function formatUtcTimestampCompact(milliseconds: number): string {
  const date = new Date(milliseconds);
  return (
    date.getUTCFullYear().toString() +
    padTwoDigits(date.getUTCMonth() + 1) +
    padTwoDigits(date.getUTCDate()) +
    "T" +
    padTwoDigits(date.getUTCHours()) +
    padTwoDigits(date.getUTCMinutes()) +
    padTwoDigits(date.getUTCSeconds()) +
    padThreeDigits(date.getUTCMilliseconds())
  );
}
/** Sanitize method names for safe filenames. */
export function sanitizeFileName(input?: string): string {
  return (input ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "");
}
/** Ensure a directory exists (create recursively if needed). */
export function ensureDirectory(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}
// ──────────────────────────────────────────────────────────────────────────────
// Dumper interfaces & implementation
// ──────────────────────────────────────────────────────────────────────────────
export interface DumpArguments {
  /** e.g., "GET_QUEST_DETAILS" */
  methodName: string;
  /** "request" | "response" */
  direction: Direction;
  /** Data to write for the parser variant (should be the `data` object only). */
  parserData: any;
  /** Data to write for the unparser variant (should be the `data` object only). */
  unparserData: any;
  /** Optional shared timestamp in milliseconds. If omitted, Date.now() is used. */
  baseTimestampMilliseconds?: number;
  /** Root directory for dumps (default: ./dumps). */
  rootDirectory?: string;
}
export interface DumpResult {
  baseTimestampMilliseconds: number;
  parserFilePath: string;
  unparserFilePath: string;
}
/**
 * Write two JSON files (parser & unparser) for a single decoded method call.
 * Both files:
 *  - use the same compact UTC timestamp in the filename (millisecond precision)
 *  - contain ONLY the `data` object (no methodId/methodName wrapper)
 *  - are separated into subfolders: dumps/parser and dumps/unparser
 *
 * Filename pattern:
 *   <methodName>_<YYYYMMDDTHHMMSSmmm>_<request|response>.json
 */
export function dumpParserAndUnparserData(args: DumpArguments): DumpResult {
  const rootDirectory =
    args.rootDirectory ?? path.resolve(process.cwd(), "dumps");
  const baseTimestampMilliseconds =
    args.baseTimestampMilliseconds ?? Date.now();
  const timestampString = formatUtcTimestampCompact(baseTimestampMilliseconds);
  const safeMethodName = sanitizeFileName(args.methodName || "METHOD_unknown");
  const parserDirectoryPath = path.join(rootDirectory, "parser");
  const unparserDirectoryPath = path.join(rootDirectory, "unparser");
  ensureDirectory(parserDirectoryPath);
  ensureDirectory(unparserDirectoryPath);
  const parserFileName = `${safeMethodName}_${timestampString}_${args.direction}.json`;
  const unparserFileName = `${safeMethodName}_${timestampString}_${args.direction}.json`;
  const parserFilePath = path.join(parserDirectoryPath, parserFileName);
  const unparserFilePath = path.join(unparserDirectoryPath, unparserFileName);
  // Both files write ONLY the corresponding data object
  fs.writeFileSync(
    parserFilePath,
    JSON.stringify(args.parserData, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    unparserFilePath,
    JSON.stringify(args.unparserData, null, 2),
    "utf8"
  );
  return {
    baseTimestampMilliseconds,
    parserFilePath,
    unparserFilePath,
  };
}
