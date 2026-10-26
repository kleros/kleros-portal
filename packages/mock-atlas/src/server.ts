import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { handleGraphql } from "./atlas";
import { CORS_HEADERS, log, send, sendJson } from "./http";
import { DEFAULT_PORT } from "./index";
import { createStore } from "./store";
import { handleTestControl } from "./testControls";

export const createMockAtlasServer = () => {
  const cooldown = Number(process.env.MOCK_ATLAS_EMAIL_COOLDOWN_SECONDS ?? 0);
  if (!Number.isFinite(cooldown) || cooldown < 0)
    throw new Error("MOCK_ATLAS_EMAIL_COOLDOWN_SECONDS must be non-negative");
  const store = createStore(cooldown);
  return createServer((req, res) => {
    const handle = async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
      if (req.method === "POST" && url.pathname === "/graphql") return handleGraphql(store, req, res);
      if (url.pathname.startsWith("/__test/")) return handleTestControl(store, req, res, url);
      return sendJson(res, 404, { message: `mock-atlas: no route for ${req.method} ${url.pathname}` });
    };
    handle().catch((error: unknown) => {
      if (!res.headersSent) sendJson(res, error instanceof SyntaxError ? 400 : 500, { message: String(error) });
    });
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.MOCK_ATLAS_PORT ?? DEFAULT_PORT);
  createMockAtlasServer().listen(port, "127.0.0.1", () => {
    log(`listening on http://127.0.0.1:${port}`);
    log(`atlas uri -> NEXT_PUBLIC_ATLAS_URI=http://127.0.0.1:${port}`);
  });
}
