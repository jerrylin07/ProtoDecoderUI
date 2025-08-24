import { b64Decode } from "../utils";
import { requestMessagesResponses } from "../constants";
import { DecodedProto } from "../types";

// 放在 proto-parser.ts 顶部附近
// 把 protobuf 消息解成普通对象：枚举=数字，int64=number，不补默认值；仅给枚举补 0
function decodeToPlain(Type: any, b64: string) {
    const buf = b64Decode(b64);
    if (!buf || !buf.length) return null;
  
    const msg = Type.decode(buf);
  
    // 关键：defaults=false，防止 int32/bool 等未下发字段被补成 0/false
    const obj = Type.toObject(msg, {
      enums: Number,   // 枚举输出数字
      longs: Number,   // int64 → number（时间戳安全；若担心超大整数字段可换成 String）
      bytes: String,
      defaults: false,
    });
  
    // 仅给“枚举字段”补默认 0（非枚举不补）
    addEnumZeroDefaults(obj, Type);
    return obj;
  }
  
  // 递归：只在“枚举字段缺失”时写入 0；嵌套/数组/map 都处理
  function addEnumZeroDefaults(obj: any, Type: any): void {
    if (!obj || !Type || !Array.isArray(Type.fieldsArray)) return;
  
    for (const f of Type.fieldsArray) {
      const name = f.name;
      const val = obj[name];
      const rt  = (f as any).resolvedType;
  
      // map<key, value>
      if (f.map) {
        const mapVal = obj[name];
        if (mapVal && rt && rt.fieldsArray) {
          for (const k of Object.keys(mapVal)) {
            addEnumZeroDefaults(mapVal[k], rt);
          }
        }
        continue;
      }
  
      // repeated
      if (f.repeated) {
        if (Array.isArray(val) && rt && rt.fieldsArray) {
          for (const item of val) addEnumZeroDefaults(item, rt);
        }
        continue;
      }
  
      // enum：缺失时补 0
      if (rt && rt.values && val === undefined) {
        obj[name] = 0;
        continue;
      }
  
      // 嵌套 message
      if (rt && rt.fieldsArray && val && typeof val === "object") {
        addEnumZeroDefaults(val, rt);
      }
    }
  }
  

// For decode dynamics action social.
let action_social = 0;
/**
 * Callback as used by {@link DecoderInternalPayloadAsResponse}.
 * @type {function}
 * @param {number|any}
 */
/**
 * Returns decoded proto as JSON. Uses Tuples by https://github.com/Furtif/pogo-protos/blob/master/test/test.js, if that implemented.
 */
function DecoderInternalPayloadAsResponse(method: number, data: any): any {
    // Reset value.
    action_social = 0;
    let proto_tuple: any = Object.values(requestMessagesResponses)[method];
    let result: any = { Not_Implemented_yet: data };
    for (let i = 0; i < Object.keys(requestMessagesResponses).length; i++) {
        proto_tuple = Object.values(requestMessagesResponses)[i];
        const my_req = proto_tuple[0];
        if (my_req == method) {
            if (proto_tuple[2] != null && b64Decode(data)) {
                try {
                    // 原：proto_tuple[2].decode(b64Decode(data)).toJSON()
                    result = decodeToPlain(proto_tuple[2], data);
                    /*
                    // This not need more because protos as replaced bytes for the proto.
                    if (method == 10010) {
                        let profile = POGOProtos.Rpc.PlayerPublicProfileProto.decode(b64Decode(result.friend[0].player.public_data)).toJSON();
                        result.friend[0].player.public_data = profile;
                    }
                    */
                }
                catch (error) {
                    console.error(`Intenal ProxySocial decoder ${my_req} Error: ${error}`);
                    let err = {
                        Error: error,
                        Data: data
                    };
                    result = err;
                }
            }
            return result;
        }
    }
    return result;
}

function remasterOrCleanMethodString(str: string) {
    return str.replace(/^REQUEST_TYPE_/, '')
        .replace(/^METHOD_/, '')
        .replace(/^PLATFORM_/, '')
        .replace(/^SOCIAL_ACTION_/, '')
        .replace(/^GAME_ANTICHEAT_ACTION_/, '')
        .replace(/^GAME_BACKGROUND_MODE_ACTION_/, '')
        .replace(/^GAME_IAP_ACTION_/, '')
        .replace(/^GAME_LOCATION_AWARENESS_ACTION_/, '')
        .replace(/^GAME_ACCOUNT_REGISTRY_ACTION_/, '')
        .replace(/^GAME_FITNESS_ACTION_/, '')
        .replace(/^TITAN_PLAYER_SUBMISSION_ACTION_/, '');
}

export const decodePayloadTraffic = (methodId: number, content: any, dataType: string): DecodedProto[] => {
    let parsedProtoData: DecodedProto[] = [];
    const decodedProto = decodeProto(methodId, content, dataType);
    if (typeof decodedProto !== "string") {
        parsedProtoData.push(decodedProto);
    }
    return parsedProtoData;
};

export const decodePayload = (contents: any, dataType: string): DecodedProto[] => {
    let parsedProtoData: DecodedProto[] = [];
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

export const decodeProto = (method: number, data: string, dataType: string): DecodedProto | string => {
    let returnObject: DecodedProto | string = "Not Found";
    for (let i = 0; i < Object.keys(requestMessagesResponses).length; i++) {
        let foundMethod: any = Object.values(requestMessagesResponses)[i];
        let foundMethodString: string = Object.keys(requestMessagesResponses)[i];
        const foundReq = foundMethod[0];
        if (foundReq == method) {
            if (foundMethod[1] != null && dataType === "request") {
                try {
                    // 原：foundMethod[1].decode(b64Decode(data)).toJSON()
                    let parsedData = decodeToPlain(foundMethod[1], data);
                    if (foundMethod[0] === 5012 || foundMethod[0] === 600005) {
                        action_social = parsedData.action;
                        Object.values(requestMessagesResponses).forEach(val => {
                            let req: any = val;
                            if (req[0] == action_social && req[1] != null && parsedData.payload && b64Decode(parsedData.payload)) {
                                // 原：req[1].decode(b64Decode(parsedData.payload)).toJSON()
                                parsedData.payload = decodeToPlain(req[1], parsedData.payload);
                            }
                        });
                    }
                    returnObject = {
                        methodId: foundMethod[0],
                        methodName: remasterOrCleanMethodString(foundMethodString),
                        data: parsedData,
                    };
                } catch (error) {
                    console.error(`Error parsing request ${foundMethodString} -> ${error}`);
                }
            } else if (dataType === "request") {
                console.warn(`Request ${foundMethod[0]} Not Implemented`)
            }
            if (foundMethod[2] != null && dataType === "response") {
                try {
                    // 原：foundMethod[2].decode(b64Decode(data)).toJSON()
                    let parsedData = decodeToPlain(foundMethod[2], data);
                    if (foundMethod[0] === 5012 && action_social > 0 && parsedData.payload) {
                        parsedData.payload = DecoderInternalPayloadAsResponse(action_social, parsedData.payload);
                    }
                    else if (foundMethod[0] === 600005 && action_social > 0 && parsedData.payload) {
                        parsedData.payload = DecoderInternalPayloadAsResponse(action_social, parsedData.payload);
                    }
                    returnObject = {
                        methodId: foundMethod[0],
                        methodName: remasterOrCleanMethodString(foundMethodString),
                        data: parsedData,
                    };
                } catch (error) {
                    console.error(`Error parsing response ${foundMethodString} method: [${foundReq}] -> ${error}`);
                }
            } else if (dataType === "response") {
                console.warn(`Response ${foundReq} Not Implemented`)
            }
        }
    }
    return returnObject;
};