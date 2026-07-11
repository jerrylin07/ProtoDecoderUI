import { b64Decode } from "../utils";
import { requestMessagesResponses } from "../constants";
import { DecodedProto } from "../types";

let action_social = 0;

// [MODIFIED] Output mode:
// - parser: enum values are converted to names
// - unparser: enum values stay numeric
export type DecodeOutputMode = "parser" | "unparser";

// [MODIFIED] Shared protobuf message -> plain object conversion.
function convertDecodedMessageToObject(
  messageType: any,
  decodedMessage: any,
  outputMode: DecodeOutputMode,
): any {
  if (messageType?.toObject && typeof messageType.toObject === "function") {
    return messageType.toObject(decodedMessage, {
      longs: String,
      enums: outputMode === "unparser" ? Number : String,
      bytes: String,
      json: true,
    });
  }
  if (decodedMessage?.toJSON && typeof decodedMessage.toJSON === "function") {
    return decodedMessage.toJSON();
  }
  return decodedMessage;
}

// [MODIFIED] Internal response payload decoding now follows outputMode too.
function decodeInternalPayloadAsResponse(
  method: number,
  data: any,
  outputMode: DecodeOutputMode,
): any {
  action_social = 0;
  let result: any = { Not_Implemented_yet: data };
  if (!data) {
    return {};
  }

  const values = Object.values(requestMessagesResponses) as any[];
  for (let i = 0; i < values.length; i++) {
    const protoTuple: any = values[i];
    const requestMethodId = protoTuple[0];
    if (requestMethodId !== method) {
      continue;
    }

    if (
      protoTuple[2] != null &&
      typeof data === "string" &&
      data &&
      b64Decode(data).length > 0
    ) {
      try {
        const decodedMessage = protoTuple[2].decode(b64Decode(data));
        result = convertDecodedMessageToObject(
          protoTuple[2],
          decodedMessage,
          outputMode,
        );
      } catch (error: any) {
        console.error(
          `Internal ProxySocial decoder ${requestMethodId} Error: ${error}`,
        );
        result = {
          Error: error,
          Data: data,
        };
      }
    }
    return result;
  }
  return result;
}

function remasterOrCleanMethodString(str: string): string {
  return str
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

export const decodePayloadTraffic = (
  methodId: number,
  content: any,
  dataType: string,
  // [MODIFIED] outputMode is explicit; defaults to parser for compatibility.
  outputMode: DecodeOutputMode = "parser",
): DecodedProto[] => {
  const parsedProtoData: DecodedProto[] = [];
  const decodedProto = decodeProto(methodId, content, dataType, outputMode);
  if (typeof decodedProto !== "string") {
    parsedProtoData.push(decodedProto);
  }
  return parsedProtoData;
};

export const decodePayload = (
  contents: any,
  dataType: string,
  // [MODIFIED] outputMode is explicit; defaults to parser for compatibility.
  outputMode: DecodeOutputMode = "parser",
): DecodedProto[] => {
  const parsedProtoData: DecodedProto[] = [];
  for (const proto of contents) {
    const methodId = proto.method;
    const data = proto.data;
    const decodedProto = decodeProto(methodId, data, dataType, outputMode);
    if (typeof decodedProto !== "string") {
      parsedProtoData.push(decodedProto);
    }
  }
  return parsedProtoData;
};

export const decodeProto = (
  method: number,
  data: string,
  dataType: string,
  // [MODIFIED] parser=enum name, unparser=enum number.
  outputMode: DecodeOutputMode = "parser",
): DecodedProto | string => {
  let returnObject: DecodedProto | string = "Not Found";
  let methodFound = false;
  const keys = Object.keys(requestMessagesResponses);
  const values = Object.values(requestMessagesResponses) as any[];

  for (let i = 0; i < keys.length; i++) {
    const foundMethod: any = values[i];
    const foundMethodString: string = keys[i];
    const foundReq = foundMethod[0] as number;
    if (foundReq !== method) {
      continue;
    }

    methodFound = true;
    if (dataType === "request") {
      if (foundMethod[1] != null) {
        try {
          let parsedData: any;
          if (!data || data === "") {
            parsedData = {};
          } else {
            // [MODIFIED] Outer request is converted with outputMode.
            const decodedMessage = foundMethod[1].decode(b64Decode(data));
            parsedData = convertDecodedMessageToObject(
              foundMethod[1],
              decodedMessage,
              outputMode,
            );
          }

          // [MODIFIED] Keep full inner payload expansion for both parser/unparser.
          if (foundReq === 5012) {
            action_social = parsedData?.action ?? 0;
            const payloadRaw = parsedData?.payload;
            if (
              action_social > 0 &&
              typeof payloadRaw === "string" &&
              payloadRaw &&
              b64Decode(payloadRaw).length > 0
            ) {
              parsedData.payload_raw = payloadRaw;
              const valuesInner = Object.values(
                requestMessagesResponses,
              ) as any[];
              valuesInner.forEach((tuple: any) => {
                const reqId = tuple[0];
                if (reqId === action_social && tuple[1] != null) {
                  try {
                    const innerDecodedMessage = tuple[1].decode(
                      b64Decode(payloadRaw),
                    );
                    parsedData.payload_parsed = convertDecodedMessageToObject(
                      tuple[1],
                      innerDecodedMessage,
                      outputMode,
                    );
                  } catch (error: any) {
                    console.error(
                      `Internal ProxySocial request decoder ${reqId} Error: ${error}`,
                    );
                    parsedData.payload_parsed = {
                      error: "Failed to decode internal request payload",
                      rawBase64: payloadRaw,
                      errorMessage: error?.toString?.() ?? String(error),
                    };
                  }
                }
              });
            }
          }

          returnObject = {
            methodId: String(foundReq),
            methodName: remasterOrCleanMethodString(foundMethodString),
            data: parsedData,
          };
        } catch (error: any) {
          console.error(
            `Error parsing request ${foundMethodString} -> ${error}`,
          );
          returnObject = {
            methodId: String(foundReq),
            methodName:
              remasterOrCleanMethodString(foundMethodString) + " [PARSE ERROR]",
            data: {
              error: "Failed to decode proto",
              rawBase64: data,
              errorMessage: error?.toString?.() ?? String(error),
            },
          };
        }
      } else {
        console.warn(`Request ${foundReq} Not Implemented`);
        returnObject = {
          methodId: String(foundReq),
          methodName:
            remasterOrCleanMethodString(foundMethodString) +
            " [NOT IMPLEMENTED]",
          data: {
            error: "Proto not implemented",
            rawBase64: data,
          },
        };
      }
      break;
    }

    if (dataType === "response") {
      if (foundMethod[2] != null) {
        try {
          let parsedData: any;
          if (!data || data === "") {
            parsedData = {};
          } else {
            // [MODIFIED] Outer response is converted with outputMode.
            const decodedMessage = foundMethod[2].decode(b64Decode(data));
            parsedData = convertDecodedMessageToObject(
              foundMethod[2],
              decodedMessage,
              outputMode,
            );
          }

          // [MODIFIED] Keep full inner payload expansion for both parser/unparser.
          if (foundReq === 5012 && action_social > 0) {
            const payloadRaw = parsedData?.payload;
            if (payloadRaw) {
              parsedData.payload_raw = payloadRaw;
              parsedData.payload_parsed = decodeInternalPayloadAsResponse(
                action_social,
                payloadRaw,
                outputMode,
              );
            }
          }

          returnObject = {
            methodId: String(foundReq),
            methodName: remasterOrCleanMethodString(foundMethodString),
            data: parsedData,
          };
        } catch (error: any) {
          console.error(
            `Error parsing response ${foundMethodString} method: [${foundReq}] -> ${error}`,
          );
          returnObject = {
            methodId: String(foundReq),
            methodName:
              remasterOrCleanMethodString(foundMethodString) + " [PARSE ERROR]",
            data: {
              error: "Failed to decode proto",
              rawBase64: data,
              errorMessage: error?.toString?.() ?? String(error),
            },
          };
        }
      } else {
        console.warn(`Response ${foundReq} Not Implemented`);
        returnObject = {
          methodId: String(foundReq),
          methodName:
            remasterOrCleanMethodString(foundMethodString) +
            " [NOT IMPLEMENTED]",
          data: {
            error: "Proto not implemented",
            rawBase64: data,
          },
        };
      }
      break;
    }
  }

  if (!methodFound && returnObject === "Not Found") {
    returnObject = {
      methodId: String(method),
      methodName: `Unknown Method ${method} [UNKNOWN]`,
      data: {
        error: "Unknown method ID",
        rawBase64: data,
      },
    };
  }

  return returnObject;
};
