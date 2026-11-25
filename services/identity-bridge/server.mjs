import { createServer as httpsServer } from "node:https";
import { createServer as httpServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { directoryOperation, BridgeError } from "./directory.mjs";
import { samlOperation } from "./saml.mjs";

const secret = process.env.FORNOST_IDENTITY_BRIDGE_TOKEN || "",
  host = process.env.BRIDGE_HOST || "127.0.0.1",
  port = Number(process.env.BRIDGE_PORT || 8444);
if (secret.length < 32)
  throw Error(
    "FORNOST_IDENTITY_BRIDGE_TOKEN must contain at least 32 characters",
  );
const allowedHosts = (process.env.FORNOST_DIRECTORY_HOSTS || "")
  .toLowerCase()
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const samlRuntime = {
  appOrigin: process.env.FORNOST_APP_ORIGIN || "",
  privateKey: process.env.SAML_SP_KEY_FILE
    ? readFileSync(process.env.SAML_SP_KEY_FILE, "utf8")
    : undefined,
  publicCert: process.env.SAML_SP_CERT_FILE
    ? readFileSync(process.env.SAML_SP_CERT_FILE, "utf8")
    : undefined,
};
const hash = (s) => createHash("sha256").update(s).digest();
async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json");
  try {
    if (
      !timingSafeEqual(
        hash(String(req.headers.authorization || "")),
        hash("Bearer " + secret),
      )
    )
      throw new BridgeError("unauthorized", 401);
    if (
      req.method !== "POST" ||
      req.headers["content-type"] !== "application/json"
    )
      throw new BridgeError("request", 400);
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 240_000) throw new BridgeError("request_size", 413);
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    let result;
    if (req.url === "/v1/directory/login" || req.url === "/v1/directory/test")
      result = await directoryOperation(
        input,
        { allowedHosts },
        req.url.endsWith("/test"),
      );
    else if (/^\/v1\/saml\/(start|verify|test)$/.test(req.url || ""))
      result = await samlOperation(
        req.url.split("/").at(-1),
        input,
        samlRuntime,
      );
    else throw new BridgeError("not_found", 404);
    res.writeHead(200);
    res.end(JSON.stringify(result));
  } catch (e) {
    // Raw LDAP/SAML errors may contain a DN, assertion or credential. Never log them.
    const status =
      e instanceof BridgeError
        ? e.status
        : e?.name === "InvalidCredentialsError"
          ? 401
          : 503;
    res.writeHead(status);
    res.end(
      JSON.stringify({
        ok: false,
        code: status === 401 ? "invalid_credentials" : "provider_unavailable",
      }),
    );
  }
}
let server;
if (process.env.BRIDGE_TLS_CERT_FILE && process.env.BRIDGE_TLS_KEY_FILE)
  server = httpsServer(
    {
      cert: readFileSync(process.env.BRIDGE_TLS_CERT_FILE),
      key: readFileSync(process.env.BRIDGE_TLS_KEY_FILE),
      minVersion: "TLSv1.2",
    },
    handler,
  );
else if (host === "127.0.0.1" && process.env.BRIDGE_ALLOW_LOOPBACK_HTTP === "1")
  server = httpServer(handler);
else
  throw Error(
    "TLS certificate/key required; HTTP is allowed only on explicit loopback deployments",
  );
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxConnections = 128;
server.listen(port, host, () =>
  process.stdout.write("Fornost identity bridge ready\n"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
