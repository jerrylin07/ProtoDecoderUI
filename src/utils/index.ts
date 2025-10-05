import { networkInterfaces } from "os";
import http from "http";
import { parse } from "url";
import { stripControlCharactersKeepVisible } from "./sanitize-utils";
import { WebStreamBuffer } from "./web-stream-buffer";
import { decodePayloadTraffic } from "../parser/proto-parser";
import { extractRallyDetails } from "./rally-extractor";

export const b64Decode = (data: string) => {
  return Buffer.from(data, "base64");
};

export function moduleConfigIsAvailable() {
  try {
    require.resolve("../config/config.json");
    return true;
  } catch (e) {
    return false;
  }
}

export function getIPAddress() {
  var interfaces = networkInterfaces();
  for (var devName in interfaces) {
    var iface: any = interfaces[devName];
    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (
        alias.family === "IPv4" &&
        alias.address !== "127.0.0.1" &&
        !alias.internal
      )
        return alias.address;
    }
  }
  return "0.0.0.0";
}

export function handleData(
  incoming: WebStreamBuffer,
  outgoing: WebStreamBuffer,
  identifier: any,
  parsedData: any // 允许 string/object/undefined
) {
  // 1) 规整为字符串
  let text: string;
  if (typeof parsedData === "string") {
    text = stripControlCharactersKeepVisible(parsedData);
  } else if (parsedData == null) {
    text = "";
  } else {
    try {
      text = JSON.stringify(parsedData);
    } catch {
      text = String(parsedData ?? "");
    }
  }

  // 2) 尝试 JSON.parse → 对象
  let root: any;
  try {
    root = text ? JSON.parse(text) : {};
  } catch {
    root = {};
  }

  // 3) 兜底得到 protos 数组
  const protos: any[] = Array.isArray(root?.protos) ? root.protos : [];

  // 4) 只用 item，不再访问 parsedData["protos"][i]
  for (let i = 0; i < protos.length; i++) {
    const item = protos[i];
    if (!item || typeof item !== "object") continue;

    const rawMethod = (item as any).method;
    const request = (item as any).request;
    const response = (item as any).response;

    // 规整 method 为 number，非数字则跳过
    const methodId: number =
      typeof rawMethod === "number"
        ? rawMethod
        : typeof rawMethod === "string" && /^\d+$/.test(rawMethod)
        ? Number(rawMethod)
        : NaN;

    if (!Number.isFinite(methodId)) continue;

    // —— request —— //
    // —— request —— //
    const parsedRequestData = decodePayloadTraffic(
      methodId,
      request,
      "request"
    );
    if (typeof parsedRequestData === "string") {
      incoming.write({ error: parsedRequestData });
    } else if (Array.isArray(parsedRequestData)) {
      for (const parsedObject of parsedRequestData) {
        (parsedObject as any).identifier = identifier;
        incoming.write(parsedObject);

        // ★ 提取并单独写给 UI
        const detailsReq = extractRallyDetails(parsedObject);
        if (detailsReq.length) {
          incoming.write({
            type: "RALLY_DETAILS",
            method: methodId,
            details: detailsReq,
          });
        }
      }
    }

    // —— response —— //
    const parsedResponseData = decodePayloadTraffic(
      methodId,
      response,
      "response"
    );
    if (typeof parsedResponseData === "string") {
      outgoing.write({ error: parsedResponseData });
    } else if (Array.isArray(parsedResponseData)) {
      for (const parsedObject of parsedResponseData) {
        (parsedObject as any).identifier = identifier;
        outgoing.write(parsedObject);

        // ★ 提取并单独写给 UI
        const detailsRes = extractRallyDetails(parsedObject);
        if (detailsRes.length) {
          outgoing.write({
            type: "RALLY_DETAILS",
            method: methodId,
            details: detailsRes,
          });
        }
      }
    }
  }
}

export function redirect_post_golbat(
  redirect_url: string,
  redirect_token: string,
  redirect_data: any
) {
  const url = parse(redirect_url);
  const headers = {
    "Content-Type": "application/json",
  };
  if (redirect_token) {
    headers["Authorization"] = "Bearer " + redirect_token;
  }
  const request = http.request({
    method: "POST",
    headers: headers,
    host: url.hostname,
    port: url.port,
    path: url.path,
  });
  request.write(redirect_data);
  request.end();
}

export * from "./web-stream-buffer";
