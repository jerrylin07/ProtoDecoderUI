// src/parser/proto-parser.ts
import { b64Decode } from "../utils";
import { requestMessagesResponses } from "../constants";
import { DecodedProto } from "../types";
/** 返回形态：默认 "full"（{methodId, methodName, data}），"data" 则仅返回 data 对象 */
export type OutputShape = "full" | "data";
/** 跟踪社交动作（5012 / 600005）以便响应侧解 payload。保持与原版一致的全局做法。 */
let currentSocialActionMethodId = 0;
let pendingPairTimestamp: { methodId: number; timestampMs: number } | null =
  null;
/* ────────────────────────────────────────────────────────────────────────────
 * 解析工具：数字枚举（unparser 版）
 *  - enums:Number, longs:Number, bytes:String, defaults:false
 *  - 仅对“缺失的枚举字段”补 0
 * ──────────────────────────────────────────────────────────────────────────── */
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
export function addMissingEnumZeroDefaultsRecursively(
  targetObject: any,
  ProtoType: any
): void {
  if (!targetObject || !ProtoType?.fieldsArray) return;
  for (const field of ProtoType.fieldsArray) {
    const fieldName = field.name;
    const currentValue = targetObject[fieldName];
    const resolvedType = (field as any).resolvedType;
    // map<k, v>
    if ((field as any).map) {
      const mapValue = targetObject[fieldName];
      if (mapValue && resolvedType?.fieldsArray) {
        for (const key of Object.keys(mapValue)) {
          addMissingEnumZeroDefaultsRecursively(mapValue[key], resolvedType);
        }
      }
      continue;
    }
    // repeated
    if ((field as any).repeated) {
      if (Array.isArray(currentValue) && resolvedType?.fieldsArray) {
        for (const item of currentValue) {
          addMissingEnumZeroDefaultsRecursively(item, resolvedType);
        }
      }
      continue;
    }
    // enum: 缺失则显式补 0
    if (
      resolvedType &&
      (resolvedType as any).values &&
      currentValue === undefined
    ) {
      targetObject[fieldName] = 0;
      continue;
    }
    // 嵌套 message
    if (
      resolvedType?.fieldsArray &&
      currentValue &&
      typeof currentValue === "object"
    ) {
      addMissingEnumZeroDefaultsRecursively(currentValue, resolvedType);
    }
  }
}
/* ────────────────────────────────────────────────────────────────────────────
 * 解析工具：字符串枚举（parser 版，等价原版 .toJSON()）
 *  - enums:String, longs:Number, bytes:String, defaults:false
 *  - 不做“缺失枚举补 0”
 * ──────────────────────────────────────────────────────────────────────────── */
export function decodeMessageToStringEnums(
  ProtoType: any,
  base64Payload: string
) {
  const binaryBuffer = b64Decode(base64Payload);
  if (!binaryBuffer || !binaryBuffer.length) return null;
  const message = ProtoType.decode(binaryBuffer);
  const plainObject = ProtoType.toObject(message, {
    enums: String,
    longs: Number,
    bytes: String,
    defaults: false,
  });
  return plainObject;
}
/* ────────────────────────────────────────────────────────────────────────────
 *  社交封装 payload（响应侧）的二次解码：数字版 & 字符串版
 * ──────────────────────────────────────────────────────────────────────────── */
function DecoderInternalPayloadAsResponse(
  methodId: number,
  base64Data: any
): any {
  let result: any = { Not_Implemented_yet: base64Data };
  for (const [, methodTupleAny] of Object.entries(requestMessagesResponses)) {
    const methodTuple = methodTupleAny as any; // [id, Req?, Resp?]
    if (methodTuple[0] === methodId) {
      if (methodTuple[2] && typeof base64Data === "string") {
        const buf = b64Decode(base64Data);
        if (buf && buf.length) {
          try {
            return decodeMessageToPlainObject(methodTuple[2], base64Data);
          } catch (error) {
            console.error(
              `Internal ProxySocial decoder (number enums) ${methodId} Error: ${error}`
            );
            return { Error: error, Data: base64Data };
          }
        }
      }
      return result;
    }
  }
  return result;
}
function DecoderInternalPayloadAsResponseStringEnums(
  methodId: number,
  base64Data: any
): any {
  let result: any = { Not_Implemented_yet: base64Data };
  for (const [, methodTupleAny] of Object.entries(requestMessagesResponses)) {
    const methodTuple = methodTupleAny as any; // [id, Req?, Resp?]
    if (methodTuple[0] === methodId) {
      if (methodTuple[2] && typeof base64Data === "string") {
        const buf = b64Decode(base64Data);
        if (buf && buf.length) {
          try {
            return decodeMessageToStringEnums(methodTuple[2], base64Data);
          } catch (error) {
            console.error(
              `Internal ProxySocial decoder (string enums) ${methodId} Error: ${error}`
            );
            return { Error: error, Data: base64Data };
          }
        }
      }
      return result;
    }
  }
  return result;
}
/* ────────────────────────────────────────────────────────────────────────────
 *  名称清理
 * ──────────────────────────────────────────────────────────────────────────── */
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
/* ────────────────────────────────────────────────────────────────────────────
 *  Node-only 落盘：懒加载 proto-dumper，前端环境静默跳过
 *  - 传入 parserData（字符串枚举）与 unparserData（数字枚举）
 *  - baseTimestampMilliseconds：同一条 item 的 req/resp 传同一个，以对齐文件名
 * ──────────────────────────────────────────────────────────────────────────── */
// Node-only 落盘：带日志 & 兼容 CommonJS/ESM
async function dumpBothIfNode(args: {
  methodName: string;
  direction: "request" | "response";
  parserData: any;
  unparserData: any;
  baseTimestampMilliseconds: number;
}) {
  const DUMPER_PATH = "../utils/proto-dumper";
  try {
    let mod: any | null = null;
    // 先尝试 require（CommonJS）
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = require(DUMPER_PATH);
    } catch (eRequire) {
      // 如果是 ESM 环境，尝试动态 import
      try {
        mod = (await import(DUMPER_PATH)) as any;
      } catch (eImport) {
        console.warn(
          "[proto-parser] Failed to load proto-dumper via require/import:",
          eRequire ?? eImport
        );
        return;
      }
    }
    const fn = mod?.dumpParserAndUnparserData;
    if (typeof fn !== "function") {
      console.warn(
        "[proto-parser] dumpParserAndUnparserData not found in proto-dumper export.",
        Object.keys(mod || {})
      );
      return;
    }
    fn(args);
  } catch (err) {
    console.error("[proto-parser] dumpBothIfNode failed:", err);
  }
}
/* ────────────────────────────────────────────────────────────────────────────
 *  对外 API（字符串枚举：parser 版）
 *  - decodePayloadTraffic / decodePayload：默认返回 "full"
 *  - 新增可选 groupTimestampMs：用于绑定同一条 item 的 req/resp 文件时间戳
 * ──────────────────────────────────────────────────────────────────────────── */
export const decodePayloadTraffic = (
  methodId: number,
  contentBase64: any,
  dataType: "request" | "response",
  outputShape: OutputShape = "full"
): DecodedProto[] => {
  const parsedList: DecodedProto[] = [];
  // —— 自动配对：request 生成并缓存，response 复用；否则回退当前时间 —— //
  const groupTimestampMs =
    dataType === "request"
      ? (() => {
          const ts = Date.now();
          pendingPairTimestamp = { methodId, timestampMs: ts };
          return ts;
        })()
      : (() => {
          if (
            pendingPairTimestamp &&
            pendingPairTimestamp.methodId === methodId
          ) {
            const ts = pendingPairTimestamp.timestampMs;
            pendingPairTimestamp = null; // 使用后清空
            return ts;
          }
          return Date.now();
        })();
  const decoded = decodeProtoStringEnums(
    methodId,
    contentBase64,
    dataType,
    outputShape,
    groupTimestampMs
  );
  if (typeof decoded !== "string") parsedList.push(decoded as DecodedProto);
  return parsedList;
};
export const decodePayload = (
  batchedContents: any,
  dataType: "request" | "response",
  outputShape: OutputShape = "full",
  groupTimestampMs?: number
): DecodedProto[] => {
  const parsedList: DecodedProto[] = [];
  for (const protoEntry of batchedContents) {
    const decoded = decodeProtoStringEnums(
      protoEntry.method,
      protoEntry.data,
      dataType,
      outputShape,
      groupTimestampMs
    );
    if (typeof decoded !== "string") parsedList.push(decoded as DecodedProto);
  }
  return parsedList;
};
/* ────────────────────────────────────────────────────────────────────────────
 *  字符串枚举主流程（parser 版，返回给上层；内部顺带落盘两份）
 *  - 若提供 groupTimestampMs，则 request/response 共享该毫秒时间戳
 *  - 否则使用 Date.now()
 * ──────────────────────────────────────────────────────────────────────────── */
export const decodeProtoStringEnums = (
  methodId: number,
  base64Data: string,
  dataType: "request" | "response",
  outputShape: OutputShape = "full",
  groupTimestampMs?: number
): DecodedProto | any | string => {
  let returnValue: DecodedProto | any | string = "Not Found";
  for (const [methodKeyName, methodTupleAny] of Object.entries(
    requestMessagesResponses
  )) {
    const methodTuple = methodTupleAny as any; // [id, RequestType?, ResponseType?]
    const tupleId = methodTuple[0];
    if (tupleId !== methodId) continue;
    // REQUEST（字符串枚举）
    if (methodTuple[1] && dataType === "request") {
      try {
        let parsedData = decodeMessageToStringEnums(methodTuple[1], base64Data);
        // social wrapper
        if (tupleId === 5012 || tupleId === 600005) {
          currentSocialActionMethodId = parsedData?.action ?? 0;
          for (const [, innerAny] of Object.entries(requestMessagesResponses)) {
            const inner = innerAny as any;
            if (
              inner[0] === currentSocialActionMethodId &&
              inner[1] &&
              typeof parsedData?.payload === "string" &&
              b64Decode(parsedData.payload)?.length
            ) {
              parsedData.payload = decodeMessageToStringEnums(
                inner[1],
                parsedData.payload
              );
            }
          }
        }
        const fullResult: DecodedProto = {
          methodId: tupleId,
          methodName: remasterOrCleanMethodString(methodKeyName),
          data: parsedData,
        };
        // —— 在解析层就地落盘（parser & unparser），两份都只写 data —— //
        const baseMs = groupTimestampMs ?? Date.now();
        const unparserData = (() => {
          const ret = decodeProto(tupleId, base64Data, "request", "data");
          return typeof ret === "string" ? null : ret;
        })();
        void dumpBothIfNode({
          methodName: fullResult.methodName,
          direction: "request",
          parserData: fullResult.data,
          unparserData: unparserData ?? fullResult.data,
          baseTimestampMilliseconds: baseMs,
        });
        returnValue = outputShape === "data" ? fullResult.data : fullResult;
        return returnValue;
      } catch (error) {
        console.error(
          `Error parsing request ${methodKeyName} (string enums) -> ${error}`
        );
      }
    } else if (dataType === "request") {
      console.warn(`Request ${tupleId} Not Implemented`);
    }
    // RESPONSE（字符串枚举）
    if (methodTuple[2] && dataType === "response") {
      try {
        let parsedData = decodeMessageToStringEnums(methodTuple[2], base64Data);
        if (
          (tupleId === 5012 || tupleId === 600005) &&
          currentSocialActionMethodId > 0 &&
          parsedData?.payload
        ) {
          parsedData.payload = DecoderInternalPayloadAsResponseStringEnums(
            currentSocialActionMethodId,
            parsedData.payload
          );
        }
        const fullResult: DecodedProto = {
          methodId: tupleId,
          methodName: remasterOrCleanMethodString(methodKeyName),
          data: parsedData,
        };
        // —— 在解析层就地落盘（parser & unparser），两份都只写 data —— //
        const baseMs = groupTimestampMs ?? Date.now();
        const unparserData = (() => {
          const ret = decodeProto(tupleId, base64Data, "response", "data");
          return typeof ret === "string" ? null : ret;
        })();

        void dumpBothIfNode({
          methodName: fullResult.methodName,
          direction: "response",
          parserData: fullResult.data,
          unparserData: unparserData ?? fullResult.data,
          baseTimestampMilliseconds: baseMs,
        });
        returnValue = outputShape === "data" ? fullResult.data : fullResult;
        return returnValue;
      } catch (error) {
        console.error(
          `Error parsing response ${methodKeyName} [${tupleId}] (string enums) -> ${error}`
        );
      }
    } else if (dataType === "response") {
      console.warn(`Response ${tupleId} Not Implemented`);
    }
  }
  return returnValue;
};
/* ────────────────────────────────────────────────────────────────────────────
 *  数字枚举主流程（unparser 版）——供内部获取 data-only（写 unparser 文件）
 *  注意：仍然可被外部引用，但这里主要用于上面的懒加载写盘调用。
 * ──────────────────────────────────────────────────────────────────────────── */
export const decodeProto = (
  methodId: number,
  base64Data: string,
  dataType: "request" | "response",
  outputShape: OutputShape = "full"
): DecodedProto | any | string => {
  let returnValue: DecodedProto | any | string = "Not Found";
  for (const [methodKeyName, methodTupleAny] of Object.entries(
    requestMessagesResponses
  )) {
    const methodTuple = methodTupleAny as any; // [id, RequestType?, ResponseType?]
    const tupleId = methodTuple[0];
    if (tupleId !== methodId) continue;
    // REQUEST（数字枚举）
    if (methodTuple[1] && dataType === "request") {
      try {
        let parsedData = decodeMessageToPlainObject(methodTuple[1], base64Data);
        if (tupleId === 5012 || tupleId === 600005) {
          currentSocialActionMethodId = parsedData?.action ?? 0;
          for (const [, innerAny] of Object.entries(requestMessagesResponses)) {
            const inner = innerAny as any;
            if (
              inner[0] === currentSocialActionMethodId &&
              inner[1] &&
              typeof parsedData?.payload === "string" &&
              b64Decode(parsedData.payload)?.length
            ) {
              parsedData.payload = decodeMessageToPlainObject(
                inner[1],
                parsedData.payload
              );
            }
          }
        }
        const fullResult: DecodedProto = {
          methodId: tupleId,
          methodName: remasterOrCleanMethodString(methodKeyName),
          data: parsedData,
        };
        returnValue = outputShape === "data" ? fullResult.data : fullResult;
        return returnValue;
      } catch (error) {
        console.error(
          `Error parsing request ${methodKeyName} (number enums) -> ${error}`
        );
      }
    } else if (dataType === "request") {
      console.warn(`Request ${tupleId} Not Implemented`);
    }
    // RESPONSE（数字枚举）
    if (methodTuple[2] && dataType === "response") {
      try {
        let parsedData = decodeMessageToPlainObject(methodTuple[2], base64Data);
        if (
          (tupleId === 5012 || tupleId === 600005) &&
          currentSocialActionMethodId > 0 &&
          parsedData?.payload
        ) {
          parsedData.payload = DecoderInternalPayloadAsResponse(
            currentSocialActionMethodId,
            parsedData.payload
          );
        }
        const fullResult: DecodedProto = {
          methodId: tupleId,
          methodName: remasterOrCleanMethodString(methodKeyName),
          data: parsedData,
        };
        returnValue = outputShape === "data" ? fullResult.data : fullResult;
        return returnValue;
      } catch (error) {
        console.error(
          `Error parsing response ${methodKeyName} [${tupleId}] (number enums) -> ${error}`
        );
      }
    } else if (dataType === "response") {
      console.warn(`Response ${tupleId} Not Implemented`);
    }
  }
  return returnValue;
};
