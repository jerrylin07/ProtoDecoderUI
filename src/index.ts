import http from "http";
import fs from "fs";
import crypto from "crypto";
import {
  WebStreamBuffer,
  getIPAddress,
  handleData,
  moduleConfigIsAvailable,
  redirect_post_golbat,
} from "./utils";
import { decodePayload, decodePayloadTraffic } from "./parser/proto-parser";
import { dumpSixVariants } from "./utils/proto-dumper";
let config = require("./config/example.config.json");
if (moduleConfigIsAvailable()) {
  config = require("./config/config.json");
}
const incomingProtoWebBufferInst = new WebStreamBuffer();
const outgoingProtoWebBufferInst = new WebStreamBuffer();
const portBind = config["default_port"];
const WEB_PASSWORD: string | null | undefined = config["web_password"];
const AUTH_REQUIRED: boolean =
  WEB_PASSWORD !== null && WEB_PASSWORD !== undefined && WEB_PASSWORD !== "";
const sessions = new Set<string>();
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) {
    return list;
  }
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const key = parts[0]?.trim();
    if (!key) return;
    const value = decodeURIComponent(parts.slice(1).join("="));
    list[key] = value;
  });
  return list;
}
function isAuthenticated(req: http.IncomingMessage): boolean {
  if (!AUTH_REQUIRED) {
    return true;
  }
  const cookieHeader = req.headers.cookie;
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies["session_token"];
  if (sessionToken && sessions.has(sessionToken)) {
    return true;
  }
  return false;
}
function requireAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>
): boolean {
  if (!AUTH_REQUIRED) {
    return true;
  }
  if (isAuthenticated(req)) {
    return true;
  }
  res.writeHead(302, {
    Location: "/login",
  });
  res.end();
  return false;
}
const httpServer = http.createServer(function (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>
) {
  let incomingData: Array<Buffer> = [];
  if (req.url === "/login" && req.method === "GET") {
    if (!AUTH_REQUIRED || isAuthenticated(req)) {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    try {
      const loginHtml = fs.readFileSync("./dist/views/login.html");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(loginHtml);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          message: "Login page not found",
        })
      );
    }
    return;
  }
  if (req.url === "/auth/login" && req.method === "POST") {
    req.on("data", (chunk: Buffer) => {
      incomingData.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(incomingData).toString("utf8");
      try {
        const parsed = JSON.parse(body);
        const password = parsed?.password;
        if (AUTH_REQUIRED && password === WEB_PASSWORD) {
          const sessionToken = generateSessionToken();
          sessions.add(sessionToken);
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Set-Cookie":
              "session_token=" +
              sessionToken +
              "; HttpOnly; Path=/; Max-Age=86400",
          });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              message: "Invalid password",
            })
          );
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            message: "Invalid request",
          })
        );
      }
    });
    return;
  }
  if (req.url === "/auth/logout" && req.method === "POST") {
    const cookieHeader = req.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const sessionToken = cookies["session_token"];
    if (sessionToken) {
      sessions.delete(sessionToken);
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": "session_token=; HttpOnly; Path=/; Max-Age=0",
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  if (req.url === "/auth/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ authRequired: AUTH_REQUIRED }));
    return;
  }
  switch (req.url) {
    case "/golbat":
      req.on("data", function (chunk: Buffer) {
        incomingData.push(chunk);
      });
      req.on("end", function () {
        const requestData = Buffer.concat(incomingData).toString("utf8");
        let parsedData: any;
        try {
          parsedData = JSON.parse(requestData);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              message: "Invalid JSON payload",
            })
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("");
        if (!parsedData || typeof parsedData !== "object") {
          console.error("Incoming data must be a single JSON object");
          return;
        }
        if (!Array.isArray(parsedData["contents"])) {
          console.error("Incoming data must contain 'contents' array");
          return;
        }
        if (parsedData["contents"].length === 0) {
          console.warn("Incoming 'contents' array is empty");
          return;
        }
        if (config["redirect_to_golbat_url"]) {
          try {
            redirect_post_golbat(
              config["redirect_to_golbat_url"],
              config["redirect_to_golbat_token"],
              JSON.stringify(parsedData)
            );
          } catch (err) {
            console.error("Endpoint golbat offline or bad! " + err);
          }
        }
        const identifier = parsedData["username"];
        for (let i = 0; i < parsedData["contents"].length; i++) {
          const entry = parsedData["contents"][i];
          if (!entry) {
            continue;
          }
          const rawRequest: string = entry.request || "";
          const rawResponse: string = entry.payload || "";
          const parsedRequestData = decodePayloadTraffic(
            entry.type,
            rawRequest,
            "request"
          );
          const parsedResponseData = decodePayloadTraffic(
            entry.type,
            rawResponse,
            "response"
          );
          const unparsedRequestData = decodePayload(
            [
              {
                method: entry.type,
                data: rawRequest,
              },
            ],
            "request"
          );
          const unparsedResponseData = decodePayload(
            [
              {
                method: entry.type,
                data: rawResponse,
              },
            ],
            "response"
          );
          let methodName = String(entry.type) || "METHOD_unknown";
          if (
            Array.isArray(parsedRequestData) &&
            parsedRequestData.length > 0
          ) {
            const firstParsedObject = parsedRequestData[0] as any;
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
          for (const parsedObject of parsedRequestData) {
            (parsedObject as any).identifier = identifier;
            incomingProtoWebBufferInst.write(parsedObject);
          }
          for (const parsedObject of parsedResponseData) {
            (parsedObject as any).identifier = identifier;
            outgoingProtoWebBufferInst.write(parsedObject);
          }
        }
      });
      break;
    case "/traffic":
      req.on("data", function (chunk: Buffer) {
        incomingData.push(chunk);
      });
      req.on("end", function () {
        const identifier = config["trafficlight_identifier"];
        const requestData = Buffer.concat(incomingData).toString("utf8");
        let parsedData: any;
        try {
          parsedData = JSON.parse(requestData);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              message: "Invalid JSON payload",
            })
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("");
        if (Array.isArray(parsedData)) {
          for (let i = 0; i < parsedData.length; i++) {
            handleData(
              incomingProtoWebBufferInst,
              outgoingProtoWebBufferInst,
              identifier,
              parsedData[i]
            );
          }
        } else {
          handleData(
            incomingProtoWebBufferInst,
            outgoingProtoWebBufferInst,
            identifier,
            parsedData
          );
        }
      });
      break;
    case "/raw":
      req.on("data", (chunk: Buffer) => {
        incomingData.push(chunk);
      });
      req.on("end", () => {
        const requestData = Buffer.concat(incomingData).toString("utf8");
        let parsedData: any;
        try {
          parsedData = JSON.parse(requestData);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              message: "Invalid JSON payload",
            })
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("");
        const parsedResponseData = decodePayload(
          parsedData.contents,
          "response"
        );
        for (const parsedObject of parsedResponseData) {
          (parsedObject as any).identifier =
            parsedData["uuid"] ||
            parsedData["devicename"] ||
            parsedData["deviceName"] ||
            parsedData["instanceName"];
          incomingProtoWebBufferInst.write(parsedObject);
        }
      });
      break;
    case "/debug":
      req.on("data", function (chunk: Buffer) {
        incomingData.push(chunk);
      });
      req.on("end", function () {
        const requestData = Buffer.concat(incomingData).toString("utf8");
        let parsedData: any;
        try {
          parsedData = JSON.parse(requestData);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              message: "Invalid JSON payload",
            })
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("");
        const parsedRequestData = decodePayload(parsedData.contents, "request");
        for (const parsedObject of parsedRequestData) {
          (parsedObject as any).identifier =
            parsedData["uuid"] ||
            parsedData["devicename"] ||
            parsedData["deviceName"] ||
            parsedData["instanceName"];
          outgoingProtoWebBufferInst.write(parsedObject);
        }
      });
      break;
    case "/images/favicon.png":
      res.writeHead(200, { "Content-Type": "image/png" });
      {
        const favicon = fs.readFileSync("./dist/views/images/favicon.png");
        res.end(favicon);
      }
      break;
    case "/css/style.css":
      res.writeHead(200, { "Content-Type": "text/css" });
      {
        const pageCssL = fs.readFileSync("./dist/views/css/style.css");
        res.end(pageCssL);
      }
      break;
    case "/json-viewer/jquery.json-viewer.css":
      res.writeHead(200, { "Content-Type": "text/css" });
      {
        const pageCss = fs.readFileSync(
          "node_modules/jquery.json-viewer/json-viewer/jquery.json-viewer.css"
        );
        res.end(pageCss);
      }
      break;
    case "/json-viewer/jquery.json-viewer.js":
      res.writeHead(200, { "Content-Type": "text/javascript" });
      {
        const pageJs = fs.readFileSync(
          "node_modules/jquery.json-viewer/json-viewer/jquery.json-viewer.js"
        );
        res.end(pageJs);
      }
      break;
    case "/":
      if (!requireAuth(req, res)) {
        break;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      try {
        const pageHTML = fs.readFileSync("./dist/views/print-protos.html");
        res.end(pageHTML);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            message: "Main page not found",
          })
        );
      }
      break;
    default:
      res.end("Unsupported url: " + req.url);
      break;
  }
});
const io = require("socket.io")(httpServer);
if (AUTH_REQUIRED) {
  io.use((socket: any, next: (err?: Error) => void) => {
    const cookieHeader = socket.handshake.headers.cookie as string | undefined;
    const cookies = parseCookies(cookieHeader);
    const sessionToken = cookies["session_token"];
    if (sessionToken && sessions.has(sessionToken)) {
      next();
    } else {
      next(new Error("Authentication required"));
    }
  });
}
const incoming = io.of("/incoming").on("connection", function (socket: any) {
  const reader = {
    read: function (data: object) {
      incoming.emit("protos", data);
    },
  };
  incomingProtoWebBufferInst.addReader(reader);
  socket.on("error", function (err: unknown) {
    console.log("WebSockets Error: ", err);
  });
  socket.on("disconnect", function () {
    incomingProtoWebBufferInst.removeReader(reader);
  });
});
const outgoing = io.of("/outgoing").on("connection", function (socket: any) {
  const reader = {
    read: function (data: object) {
      outgoing.emit("protos", data);
    },
  };
  outgoingProtoWebBufferInst.addReader(reader);
  socket.on("error", function (err: unknown) {
    console.log("WebSockets Error: ", err);
  });
  socket.on("disconnect", function () {
    outgoingProtoWebBufferInst.removeReader(reader);
  });
});
httpServer.keepAliveTimeout = 0;
httpServer.listen(portBind, function () {
  const authStatus = AUTH_REQUIRED
    ? "ENABLED - Password required to access web UI"
    : "DISABLED - No password required. Use with caution!";
  const welcome = `
Server start access of this in urls: http://localhost:${portBind} or WLAN mode http://${getIPAddress()}:${portBind}.
    - Web Authentication: ${authStatus}
    - Clients MITM:
        1) --=FurtiF™=- Tools EndPoints: http://${getIPAddress()}:${portBind}/traffic or http://${getIPAddress()}:${portBind}/golbat (depending on the modes chosen)
        2) If Other set here...
        3) ...
ProtoDecoderUI is not responsible for your errors.
`;
  console.log(welcome);
});
