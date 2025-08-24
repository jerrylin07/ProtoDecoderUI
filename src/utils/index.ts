import { networkInterfaces } from "os";
import http from "http";
import { parse } from "url";
import { WebStreamBuffer } from "./web-stream-buffer";
import { decodePayloadTraffic } from "../parser/proto-parser";
const SKIP_BROWSER = process.env.SKIP_BROWSER === "1";

// 小工具：统一写入（可 no-op）
function push(buf: any, obj: any) {
  if (!SKIP_BROWSER) buf.write(obj);
}
import fs from "fs";
import path from "path";

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

// 生成 YYYYMMDDTHHMMSSmmm（本地时间）
function fmtStampCompact(ms: number): string {
  const d = new Date(ms);
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    pad3(d.getUTCMilliseconds())
  );
}

function safeName(s?: string) {
  return (s || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "");
}

export function dumpDecoded(
  direction: "request" | "response",
  obj: any,
  baseMs: number // 建议同一对 req/resp 传同一个 ms
) {
  const dir = path.join(process.cwd(), "dumps");
  fs.mkdirSync(dir, { recursive: true });

  const name = safeName(
    obj?.methodName || `METHOD_${obj?.methodId ?? "unknown"}`
  );
  const file = path.join(
    dir,
    `${name}_${fmtStampCompact(baseMs)}_${direction}.json`
  );
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
  return file;
}

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
  parsedData: any
) {
  if (!parsedData || !parsedData["protos"]) return;

  for (const item of parsedData["protos"]) {
    const method = item.method;
    const baseMs = Date.now(); // 本轮 req/resp 共享时间锚点

    // request
    const parsedRequestData = decodePayloadTraffic(
      method,
      item.request,
      "request"
    );
    if (typeof parsedRequestData === "string") {
      push(incoming, { error: parsedRequestData });
    } else {
      for (const parsedObject of parsedRequestData) {
        dumpDecoded("request", parsedObject, baseMs); // 先落盘
        parsedObject.identifier = identifier; // 再（可选）推到浏览器
        push(incoming, parsedObject);
      }
    }

    // response
    const parsedResponseData = decodePayloadTraffic(
      method,
      item.response,
      "response"
    );
    if (typeof parsedResponseData === "string") {
      push(outgoing, { error: parsedResponseData });
    } else {
      for (const parsedObject of parsedResponseData) {
        dumpDecoded("response", parsedObject, baseMs); // 先落盘
        parsedObject.identifier = identifier; // 再（可选）推到浏览器
        push(outgoing, parsedObject);
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
