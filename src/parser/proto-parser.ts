import fs from "fs";
import path from "path";
import { b64Decode } from "../utils";
import { requestMessagesResponses } from "../constants";
import { DecodedProto } from "../types";
/**
 * Output shape control for decoded results.
 * - "full": { methodId, methodName, data }
 * - "data": just the inner `data` object (matches current dump format)
 */
export type OutputShape = "full" | "data";
// Track the current social action method id between paired request/response.
let currentSocialActionMethodId = 0;
// ──────────────────────────────────────────────────────────────────────────────
//  Utilities — time stamp & file naming
// ──────────────────────────────────────────────────────────────────────────────
const padTwoDigits = (value: number) => String(value).padStart(2, "0");
const padThreeDigits = (value: number) => String(value).padStart(3, "0");
/** UTC compact timestamp: YYYYMMDDTHHMMSSmmm */
function formatUtcTimestampCompact(milliseconds: number): string {
  const dt = new Date(milliseconds);
  return (
    dt.getUTCFullYear().toString() +
    padTwoDigits(dt.getUTCMonth() + 1) +
    padTwoDigits(dt.getUTCDate()) +
    "T" +
    padTwoDigits(dt.getUTCHours()) +
    padTwoDigits(dt.getUTCMinutes()) +
    padTwoDigits(dt.getUTCSeconds()) +
    padThreeDigits(dt.getUTCMilliseconds())
  );
}
function sanitizeFileName(input?: string): string {
  return (input ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "");
}
function ensureDirectory(directoryPath: string) {
  fs.mkdirSync(directoryPath, { recursive: true });
}
/**
 * Write one JSON file per method call (request/response), like the original behavior.
 * Subdirectories separate parser vs unparser versions.
 * Filename: <methodName>_<YYYYMMDDTHHMMSSmmm>_<request|response>.json
 * IMPORTANT: both parser & unparser dumps only write the `data` object, and
 *            share the same baseTimestampMs per call to keep them aligned.
 */
function writePerMethodJsonDump(
  variant: "parser" | "unparser",
  methodName: string,
  baseTimestampMs: number,
  direction: "request" | "response",
  dataOnlyPayload: any
): string {
  const rootDir = path.resolve(process.cwd(), "dumps", variant);
  ensureDirectory(rootDir);
  const safeMethod = sanitizeFileName(methodName || "METHOD_unknown");
  const filename = `${safeMethod}_${formatUtcTimestampCompact(
    baseTimestampMs
  )}_${direction}.json`;
  const filePath = path.join(rootDir, filename);
  // 仅保留 data 字典写入
  fs.writeFileSync(filePath, JSON.stringify(dataOnlyPayload, null, 2), "utf8");
  return filePath;
}
// ──────────────────────────────────────────────────────────────────────────────
//  Helpers — decoding with explicit rules and enum-default synthesis
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Decode a protobuf message instance into a plain JavaScript object with explicit rules:
 * - enums → Number (keep numeric values)
 * - int64 → Number (safe for timestamps; beware of very large ids)
 * - defaults → false (do NOT synthesize default 0/false/"" for missing scalar fields)
 * - bytes → String
 * Then, only for missing enum fields, synthesize value 0 to make them explicit.
 */
export function decodeMessageToPlainObject(
  ProtoType: any,
  base64Payload: string
) {
  const binaryBuffer = b64Decode(base64Payload);
  if (!binaryBuffer || !binaryBuffer.length) return null;
  const message = ProtoType.decode(binaryBuffer);
  const plainObject = ProtoType.toObject(message, {
    enums: Number,
    longs: Number,
    bytes: String,
    defaults: false,
  });
  addMissingEnumZeroDefaultsRecursively(plainObject, ProtoType);
  return plainObject;
}
/**
 * Recursively add explicit 0 only for missing enum fields (do not synthesize defaults for non-enum fields).
 * Handles nested messages, repeated fields, and map fields.
 */
export function addMissingEnumZeroDefaultsRecursively(
  targetObject: any,
  ProtoType: any
): void {
  if (!targetObject || !ProtoType?.fieldsArray) return;
  for (const field of ProtoType.fieldsArray) {
    const fieldName = field.name;
    const currentValue = targetObject[fieldName];
    const resolvedType = (field as any).resolvedType;
    // map<key, value>
    if (field.map) {
      const mapValue = targetObject[fieldName];
      if (mapValue && resolvedType?.fieldsArray) {
        for (const key of Object.keys(mapValue)) {
          addMissingEnumZeroDefaultsRecursively(mapValue[key], resolvedType);
        }
      }
      continue;
    }
    // repeated
    if (field.repeated) {
      if (Array.isArray(currentValue) && resolvedType?.fieldsArray) {
        for (const item of currentValue) {
          addMissingEnumZeroDefaultsRecursively(item, resolvedType);
        }
      }
      continue;
    }
    // enum: if missing, add 0
    if (resolvedType && resolvedType.values && currentValue === undefined) {
      targetObject[fieldName] = 0;
      continue;
    }
    // nested message
    if (
      resolvedType?.fieldsArray &&
      currentValue &&
      typeof currentValue === "object"
    ) {
      addMissingEnumZeroDefaultsRecursively(currentValue, resolvedType);
    }
  }
}
// ──────────────────────────────────────────────────────────────────────────────
//  Social payload decoder (dynamic nested decode)
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Returns decoded proto as JSON-like plain object. Uses tuples by requestMessagesResponses.
 * This function is used for social action payloads (dynamic nested decode).
 */
function DecoderInternalPayloadAsResponse(
  methodId: number,
  base64Data: any
): any {
  let result: any = { Not_Implemented_yet: base64Data };
  for (const [, methodTupleAny] of Object.entries(requestMessagesResponses)) {
    const methodTuple = methodTupleAny as any; // [id, RequestType?, ResponseType?]
    const tupleRequestOrResponseId = methodTuple[0];
    if (tupleRequestOrResponseId === methodId) {
      // Response type exists and payload is decodable.
      if (
        methodTuple[2] != null &&
        typeof base64Data === "string" &&
        base64Data &&
        b64Decode(base64Data)?.length
      ) {
        try {
          result = decodeMessageToPlainObject(methodTuple[2], base64Data);
        } catch (error) {
          console.error(
            `Internal ProxySocial decoder ${tupleRequestOrResponseId} Error: ${error}`
          );
          result = { Error: error, Data: base64Data };
        }
      }
      return result;
    }
  }
  return result;
}
// ──────────────────────────────────────────────────────────────────────────────
//  Name cleanup
// ──────────────────────────────────────────────────────────────────────────────
function remasterOrCleanMethodString(originalName: string) {
  return originalName
    .replace(/^REQUEST_TYPE_/, "")
    .replace(/^METHOD_/, "")
    .replace(/^PLATFORM_/, "")
    .replace(/^SOCIAL_ACTION_/, "")
    .replace(/^GAME_ANTICHEAT_ACTION_/, "")
    .replace(/^GAME_BACKGROUND_MODE_ACTION_/, "")
    .replace(/^GAME_IAP_ACTION_/, "")
    .replace(/^GAME_LOCATION_AWARENESS_ACTION_/, "")
    .replace(/^GAME_ACCOUNT_REGISTRY_ACTION_/, "")
    .replace(/^GAME_FITNESS_ACTION_/, "")
    .replace(/^TITAN_PLAYER_SUBMISSION_ACTION_/, "");
}
// ──────────────────────────────────────────────────────────────────────────────
//  Public API — now supports output shape
// ──────────────────────────────────────────────────────────────────────────────
export const decodePayloadTraffic = (
  methodId: number,
  contentBase64: any,
  dataType: string,
  outputShape: OutputShape = "full"
): any[] => {
  const parsedList: any[] = [];
  const decoded = decodeProto(methodId, contentBase64, dataType, outputShape);
  if (typeof decoded !== "string") parsedList.push(decoded);
  return parsedList;
};
export const decodePayload = (
  batchedContents: any,
  dataType: string,
  outputShape: OutputShape = "full"
): any[] => {
  const parsedList: any[] = [];
  for (const protoEntry of batchedContents) {
    const methodId = protoEntry.method;
    const base64Data = protoEntry.data;
    const decoded = decodeProto(methodId, base64Data, dataType, outputShape);
    if (typeof decoded !== "string") parsedList.push(decoded);
  }
  return parsedList;
};
export const decodeProto = (
  methodId: number,
  base64Data: string,
  dataType: string,
  outputShape: OutputShape = "full"
): DecodedProto | any | string => {
  let returnValue: DecodedProto | any | string = "Not Found";
  for (const [methodKeyName, methodTupleAny] of Object.entries(
    requestMessagesResponses
  )) {
    const methodTuple = methodTupleAny as any; // [id, RequestType?, ResponseType?]
    const tupleRequestOrResponseId = methodTuple[0];
    if (tupleRequestOrResponseId !== methodId) continue;
    // REQUEST branch
    if (methodTuple[1] != null && dataType === "request") {
      try {
        let parsedData = decodeMessageToPlainObject(methodTuple[1], base64Data);
        // Social wrapper: decode inner payload by action id for request
        if (
          tupleRequestOrResponseId === 5012 ||
          tupleRequestOrResponseId === 600005
        ) {
          currentSocialActionMethodId = parsedData?.action ?? 0;
          for (const [, innerTupleAny] of Object.entries(
            requestMessagesResponses
          )) {
            const innerTuple = innerTupleAny as any;
            const innerMethodId = innerTuple[0];
            if (
              innerMethodId === currentSocialActionMethodId &&
              innerTuple[1] != null &&
              typeof parsedData?.payload === "string" &&
              parsedData.payload &&
              b64Decode(parsedData.payload)?.length
            ) {
              parsedData.payload = decodeMessageToPlainObject(
                innerTuple[1],
                parsedData.payload
              );
            }
          }
        }
        const fullResult: DecodedProto = {
          methodId: tupleRequestOrResponseId,
          methodName: remasterOrCleanMethodString(methodKeyName),
          data: parsedData,
        };
        // Per-method JSON dumps: both parser & unparser write ONLY data (same timestamp)
        const baseTimestampMs = Date.now();
        writePerMethodJsonDump(
          "parser",
          fullResult.methodName,
          baseTimestampMs,
          "request",
          fullResult.data
        );
        writePerMethodJsonDump(
          "unparser",
          fullResult.methodName,
          baseTimestampMs,
          "request",
          fullResult.data
        );
        returnValue = outputShape === "data" ? fullResult.data : fullResult;
        return returnValue;
      } catch (error) {
        console.error(`Error parsing request ${methodKeyName} -> ${error}`);
      }
    } else if (dataType === "request") {
      console.warn(`Request ${tupleRequestOrResponseId} Not Implemented`);
    }
    // RESPONSE branch
    if (methodTuple[2] != null && dataType === "response") {
      try {
        let parsedData = decodeMessageToPlainObject(methodTuple[2], base64Data);
        if (
          (tupleRequestOrResponseId === 5012 ||
            tupleRequestOrResponseId === 600005) &&
          currentSocialActionMethodId > 0 &&
          parsedData?.payload
        ) {
          parsedData.payload = DecoderInternalPayloadAsResponse(
            currentSocialActionMethodId,
            parsedData.payload
          );
        }
        const fullResult: DecodedProto = {
          methodId: tupleRequestOrResponseId,
          methodName: remasterOrCleanMethodString(methodKeyName),
          data: parsedData,
        };
        // Per-method JSON dumps: both parser & unparser write ONLY data (same timestamp)
        const baseTimestampMs = Date.now();
        writePerMethodJsonDump(
          "parser",
          fullResult.methodName,
          baseTimestampMs,
          "response",
          fullResult.data
        );
        writePerMethodJsonDump(
          "unparser",
          fullResult.methodName,
          baseTimestampMs,
          "response",
          fullResult.data
        );
        returnValue = outputShape === "data" ? fullResult.data : fullResult;
        return returnValue;
      } catch (error) {
        console.error(
          `Error parsing response ${methodKeyName} method: [${tupleRequestOrResponseId}] -> ${error}`
        );
      }
    } else if (dataType === "response") {
      console.warn(`Response ${tupleRequestOrResponseId} Not Implemented`);
    }
  }
  return returnValue;
};
