import type { IncomingMessage, ServerResponse } from "node:http";

import { readBody, sendJson } from "./http";
import { dumpState, reset, type Store } from "./store";

export const handleTestControl = async (store: Store, req: IncomingMessage, res: ServerResponse, url: URL) => {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case "POST /__test/reset":
      reset(store);
      return sendJson(res, 200, { ok: true });
    case "DELETE /__test/faults":
      store.faults.length = 0;
      return sendJson(res, 200, { ok: true });
    case "POST /__test/faults": {
      const {
        field,
        product,
        times = 1,
        error = "mock-atlas: injected fault",
      } = JSON.parse((await readBody(req)).toString());
      if (
        typeof field !== "string" ||
        (product !== undefined && typeof product !== "string") ||
        !Number.isInteger(times) ||
        times < 1 ||
        typeof error !== "string"
      ) {
        return sendJson(res, 400, {
          message: "Expected field, optional product, positive integer times, and error text",
        });
      }
      store.faults.push({ field, product, times, error });
      return sendJson(res, 200, { ok: true });
    }
    case "GET /__test/confirmation":
      return sendJson(res, 200, store.confirmations.get((url.searchParams.get("address") ?? "").toLowerCase()) ?? null);
    case "POST /__test/clock": {
      const { offsetSeconds } = JSON.parse((await readBody(req)).toString());
      if (typeof offsetSeconds !== "number" || !Number.isFinite(offsetSeconds))
        return sendJson(res, 400, { message: "Expected finite offsetSeconds" });
      store.offsetSeconds = offsetSeconds;
      return sendJson(res, 200, { ok: true });
    }
    case "GET /__test/state":
      return sendJson(res, 200, dumpState(store));
    case "GET /__test/requests":
      return sendJson(res, 200, store.requests);
    default:
      return sendJson(res, 404, { message: `mock-atlas: no route for ${route}` });
  }
};
