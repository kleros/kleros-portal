import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { atlasContract } from "./atlas.contract";

atlasContract(async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    fetch: globalThis.fetch,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
});
