import fs from "fs";
import path from "path";

export type DumpSixArgs = {
  /**
   * Optional timestamp in milliseconds. If not provided, Date.now() will be used.
   */
  baseTimestampMilliseconds?: number;

  /**
   * RPC method name. Will be sanitized for filesystem usage.
   */
  methodName: string;

  /**
   * Raw request / response payloads (usually base64 or hex strings).
   */
  rawRequest?: any;
  rawResponse?: any;

  /**
   * Results of the legacy "unparsed" decoder.
   */
  unparserRequest?: any;
  unparserResponse?: any;

  /**
   * Results of the newer "parsed" decoder.
   */
  parserRequest?: any;
  parserResponse?: any;
};

/**
 * Root directory for all dumps.
 * Structure:
 *  <DUMP_ROOT>/
 *    raw/
 *    unparser/
 *    parser/
 */
const DUMP_ROOT = path.resolve(process.cwd(), "dumps");

function ensureDirectoryExists(directoryPath: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function safeMethodName(methodName: string): string {
  if (!methodName) {
    return "METHOD_unknown";
  }
  return methodName.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function formatUtcTimestamp(milliseconds: number): string {
  const date = new Date(milliseconds);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
  // Compact UTC style, similar to 20250101T235959123
  return `${year}${month}${day}T${hours}${minutes}${seconds}${millis}`;
}

function buildBaseFilename(methodName: string, milliseconds: number): string {
  const safeName = safeMethodName(methodName);
  const timestamp = formatUtcTimestamp(milliseconds);
  return `${safeName}_${timestamp}`;
}

function buildFilenames(
  methodName: string,
  milliseconds: number
): {
  requestFilename: string;
  responseFilename: string;
} {
  const base = buildBaseFilename(methodName, milliseconds);
  return {
    requestFilename: `${base}_request.json`,
    responseFilename: `${base}_response.json`,
  };
}

/**
 * Extract only the "data" property out of decoded objects (or arrays of objects),
 * keeping the outer shape as close as possible to the original.
 */
function dataOnly(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => dataOnly(item));
  }

  if (typeof value === "object") {
    if ("data" in value) {
      return (value as any).data;
    }
    const copy: any = {};
    for (const key of Object.keys(value)) {
      copy[key] = dataOnly((value as any)[key]);
    }
    return copy;
  }

  return value;
}

function writeJson(filePath: string, value: any): void {
  const directoryPath = path.dirname(filePath);
  ensureDirectoryExists(directoryPath);
  const json = JSON.stringify(value, null, 2);
  fs.writeFileSync(filePath, json, { encoding: "utf-8" });
}

/**
 * Dump up to six variants of a single RPC.
 */
export function dumpSixVariants(args: DumpSixArgs): void {
  const timestampMs =
    args.baseTimestampMilliseconds !== undefined
      ? args.baseTimestampMilliseconds
      : Date.now();

  const { requestFilename, responseFilename } = buildFilenames(
    args.methodName,
    timestampMs
  );

  const rawDir = path.join(DUMP_ROOT, "raw");
  const unparserDir = path.join(DUMP_ROOT, "unparser");
  const parserDir = path.join(DUMP_ROOT, "parser");

  if (args.rawRequest !== undefined) {
    writeJson(path.join(rawDir, requestFilename), args.rawRequest);
  }
  if (args.rawResponse !== undefined) {
    writeJson(path.join(rawDir, responseFilename), args.rawResponse);
  }

  if (args.unparserRequest !== undefined) {
    writeJson(
      path.join(unparserDir, requestFilename),
      dataOnly(args.unparserRequest)
    );
  }
  if (args.unparserResponse !== undefined) {
    writeJson(
      path.join(unparserDir, responseFilename),
      dataOnly(args.unparserResponse)
    );
  }

  if (args.parserRequest !== undefined) {
    writeJson(
      path.join(parserDir, requestFilename),
      dataOnly(args.parserRequest)
    );
  }
  if (args.parserResponse !== undefined) {
    writeJson(
      path.join(parserDir, responseFilename),
      dataOnly(args.parserResponse)
    );
  }
}
