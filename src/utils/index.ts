import { networkInterfaces } from "os";
import http from "http";
import { parse } from "url";
import { WebStreamBuffer } from "./web-stream-buffer";
import { dumpSixVariants } from "./proto-dumper";
import { decodePayloadTraffic, decodePayload } from "../parser/proto-parser";

export const b64Decode = (data: string): Buffer => {
  if (!data || data === "") {
    return Buffer.alloc(0);
  }
  return Buffer.from(data, "base64");
};

export function moduleConfigIsAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../config/config.json");
    return true;
  } catch (e) {
    return false;
  }
}

export function getIPAddress(): string {
  const interfaces = networkInterfaces();
  for (const devName in interfaces) {
    const iface: any = interfaces[devName];
    if (!iface) {
      continue;
    }
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (
        alias.family === "IPv4" &&
        alias.address !== "127.0.0.1" &&
        !alias.internal
      ) {
        return alias.address;
      }
    }
  }
  return "0.0.0.0";
}

/**
 * Shared handler for Trafficlight style messages.
 */
export function handleData(
  incoming: WebStreamBuffer,
  outgoing: WebStreamBuffer,
  identifier: any,
  parsedData: any
): void {
  if (!parsedData || !parsedData.protos || !Array.isArray(parsedData.protos)) {
    return;
  }

  for (let i = 0; i < parsedData.protos.length; i++) {
    const entry = parsedData.protos[i];

    const rawRequest = entry.request || "";
    const rawResponse = entry.response || "";
    const method: number = entry.method;

    const parsedRequestData = decodePayloadTraffic(
      method,
      rawRequest,
      "request"
    );
    const parsedResponseData = decodePayloadTraffic(
      method,
      rawResponse,
      "response"
    );

    const unparsedRequestData = decodePayload(
      [{ method, data: rawRequest }],
      "request"
    );
    const unparsedResponseData = decodePayload(
      [{ method, data: rawResponse }],
      "response"
    );

    let methodName = String(method) || "METHOD_unknown";
    if (
      parsedRequestData &&
      typeof parsedRequestData !== "string" &&
      Array.isArray(parsedRequestData) &&
      parsedRequestData.length > 0
    ) {
      const firstParsedObject: any = parsedRequestData[0];
      if (firstParsedObject && typeof firstParsedObject === "object") {
        methodName =
          firstParsedObject.methodName ||
          firstParsedObject.method ||
          firstParsedObject.name ||
          methodName;
      }
    }

    dumpSixVariants({
      baseTimestampMilliseconds: Date.now(),
      methodName,
      rawRequest,
      rawResponse,
      unparserRequest: unparsedRequestData,
      parserRequest: parsedRequestData,
      unparserResponse: unparsedResponseData,
      parserResponse: parsedResponseData,
    });

    if (typeof parsedRequestData === "string") {
      incoming.write({ error: parsedRequestData });
    } else if (Array.isArray(parsedRequestData)) {
      for (const parsedObject of parsedRequestData) {
        (parsedObject as any).identifier = identifier;
        incoming.write(parsedObject);
      }
    }

    if (typeof parsedResponseData === "string") {
      outgoing.write({ error: parsedResponseData });
    } else if (Array.isArray(parsedResponseData)) {
      for (const parsedObject of parsedResponseData) {
        (parsedObject as any).identifier = identifier;
        outgoing.write(parsedObject);
      }
    }
  }
}

export function redirect_post_golbat(
  redirect_url: string,
  redirect_token: string | null,
  redirect_data: string
): void {
  const url = parse(redirect_url);
  const headers: http.OutgoingHttpHeaders = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(redirect_data).toString(),
  };
  if (redirect_token) {
    headers["Authorization"] = "Bearer " + redirect_token;
  }
  const request = http.request({
    method: "POST",
    headers: headers,
    host: url.hostname || undefined,
    port: url.port,
    path: url.path || undefined,
  });
  request.write(redirect_data);
  request.end();
}

export * from "./web-stream-buffer";
