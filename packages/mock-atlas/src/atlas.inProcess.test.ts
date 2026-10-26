import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { atlasContract } from "./atlas.contract";

// Runs the same contract through request listeners without opening a TCP socket.
atlasContract(async (server) => ({
  base: "http://mock-atlas.test",
  close: async () => {},
  fetch: async (input, init) => {
    const url = new URL(String(input));
    const req = new IncomingMessage(new Socket());
    req.method = init?.method ?? "GET";
    req.url = url.pathname + url.search;
    req.headers = Object.fromEntries(new Headers(init?.headers));
    req.headers.host = url.host;
    req.push(init?.body ? Buffer.from(String(init.body)) : null);
    if (init?.body) req.push(null);
    const res = new ServerResponse(req);
    res.setHeader("x-test-transport", "in-process");
    return new Promise<Response>((resolve) => {
      res.end = (body?: unknown) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.getHeaders())) {
          if (value !== undefined) headers.set(key, String(value));
        }
        resolve(new Response(body === undefined ? null : String(body), { status: res.statusCode, headers }));
        return res;
      };
      server.emit("request", req, res);
    });
  },
}));
