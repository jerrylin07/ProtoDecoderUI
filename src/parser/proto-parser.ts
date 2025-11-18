import { b64Decode } from "../utils";
import { requestMessagesResponses } from "../constants";
import { DecodedProto } from "../types";

let action_social = 0;

/**
 * 解析 Social / Proxy 内层 payload（基于外层 action_social method）
 */
function decodeInternalPayloadAsResponse(
  method: number,
  data: any
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

    if (requestMethodId === method) {
      if (
        protoTuple[2] != null &&
        typeof data === "string" &&
        data &&
        b64Decode(data).length > 0
      ) {
        try {
          result = protoTuple[2].decode(b64Decode(data)).toJSON();
        } catch (error: any) {
          console.error(
            `Internal ProxySocial decoder ${requestMethodId} Error: ${error}`
          );
          result = {
            Error: error,
            Data: data,
          };
        }
      }
      return result;
    }
  }

  return result;
}

/**
 * 去掉 Method 名称前缀，便于前端展示
 */
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

/**
 * 用于 /traffic、/golbat 之类「单条」场景：
 * 传入一个 methodId + content，返回 DecodedProto[]
 * 若解析失败会返回空数组（错误信息包装在 DecodedProto.data 中）
 */
export const decodePayloadTraffic = (
  methodId: number,
  content: any,
  dataType: string
): DecodedProto[] => {
  const parsedProtoData: DecodedProto[] = [];
  const decodedProto = decodeProto(methodId, content, dataType);

  if (typeof decodedProto !== "string") {
    parsedProtoData.push(decodedProto);
  }

  return parsedProtoData;
};

/**
 * 用于 /debug、/raw 之类「批量 contents」场景：
 * contents: [{ method, data }, ...]
 */
export const decodePayload = (
  contents: any,
  dataType: string
): DecodedProto[] => {
  const parsedProtoData: DecodedProto[] = [];

  for (const proto of contents) {
    const methodId = proto.method;
    const data = proto.data;
    const decodedProto = decodeProto(methodId, data, dataType);
    if (typeof decodedProto !== "string") {
      parsedProtoData.push(decodedProto);
    }
  }

  return parsedProtoData;
};

/**
 * 核心解析逻辑：
 * - 根据 methodId 在 requestMessagesResponses 中找到对应的 tuple
 * - 按 dataType = "request" / "response" 选择 tuple[1] / tuple[2] 类型解码
 * - Social 特殊 case：外层 5012 存 action，内层 payload 再解一层
 * - 解析失败 / 未实现 / 未知 method 都会包装成 DecodedProto 返回，方便前端展示
 */
export const decodeProto = (
  method: number,
  data: string,
  dataType: string
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

    // -------------------- Request --------------------
    if (dataType === "request") {
      if (foundMethod[1] != null) {
        try {
          let parsedData: any;

          if (!data || data === "") {
            parsedData = {};
          } else {
            parsedData = foundMethod[1].decode(b64Decode(data)).toJSON();
          }

          // Social / Proxy：记录 action，并尝试解内层 payload
          if (foundReq === 5012) {
            action_social = parsedData?.action ?? 0;

            if (
              action_social > 0 &&
              parsedData?.payload &&
              typeof parsedData.payload === "string" &&
              b64Decode(parsedData.payload)
            ) {
              const valuesInner = Object.values(
                requestMessagesResponses
              ) as any[];

              valuesInner.forEach((tuple: any) => {
                const reqId = tuple[0];
                if (
                  reqId === action_social &&
                  tuple[1] != null &&
                  parsedData.payload
                ) {
                  try {
                    parsedData.payload = tuple[1]
                      .decode(b64Decode(parsedData.payload))
                      .toJSON();
                  } catch (error: any) {
                    console.error(
                      `Internal ProxySocial request decoder ${reqId} Error: ${error}`
                    );
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
            `Error parsing request ${foundMethodString} -> ${error}`
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
        // 没有实现 request 类型
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

      // 找到匹配 method 后直接跳出循环
      break;
    }

    // -------------------- Response --------------------
    if (dataType === "response") {
      if (foundMethod[2] != null) {
        try {
          let parsedData: any;

          if (!data || data === "") {
            parsedData = {};
          } else {
            parsedData = foundMethod[2].decode(b64Decode(data)).toJSON();
          }

          // Social 内层 payload 再解一层
          if (foundReq === 5012 && action_social > 0 && parsedData?.payload) {
            parsedData.payload = decodeInternalPayloadAsResponse(
              action_social,
              parsedData.payload
            );
          }

          returnObject = {
            methodId: String(foundReq),
            methodName: remasterOrCleanMethodString(foundMethodString),
            data: parsedData,
          };
        } catch (error: any) {
          console.error(
            `Error parsing response ${foundMethodString} method: [${foundReq}] -> ${error}`
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
        // 没有实现 response 类型
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

      // 找到匹配 method 后直接跳出循环
      break;
    }
  }

  // 完全没有匹配的 methodId
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
