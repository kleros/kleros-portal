/** mock-atlas's default port, off foresight's 4747 so a foresight mock left running is never reused. */
export const MOCK_ATLAS_PORT = Number(process.env.E2E_MOCK_ATLAS_PORT ?? 4848);

export const MOCK_ATLAS_URL = `http://127.0.0.1:${MOCK_ATLAS_PORT}`;

export interface RecordedRequest {
  field: string;
  variables: Record<string, unknown>;
  authorized: boolean;
}

const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${MOCK_ATLAS_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`mock-atlas ${method} ${path}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : undefined;
};

/** The mock's test controls (packages/mock-atlas/README.md). */
export const atlas = {
  reset: () => call("POST", "/__test/reset"),
  fault: (fault: { field: string; product?: string; times?: number; error?: string }) =>
    call("POST", "/__test/faults", fault),
  clearFaults: () => call("DELETE", "/__test/faults"),
  shiftClock: (offsetSeconds: number) => call("POST", "/__test/clock", { offsetSeconds }),
  confirmation: (address: string) =>
    call("GET", `/__test/confirmation?address=${address}`) as Promise<{ token: string; expiresAt: string }>,
  requests: () => call("GET", "/__test/requests") as Promise<RecordedRequest[]>,
  /** The requests to one root field, in order. */
  requestsTo: async (field: string) => ((await atlas.requests()) ?? []).filter((request) => request.field === field),
};
