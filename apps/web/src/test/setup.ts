import { Buffer } from "node:buffer";

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Auto-cleanup only ships with `globals: true`; unmount between tests ourselves.
afterEach(cleanup);

// jsdom implements no ResizeObserver, and the Kleros components that measure
// themselves throw on mount without one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.stubEnv("NEXT_PUBLIC_REOWN_PROJECT_ID", "test-project");
vi.stubEnv("NEXT_PUBLIC_ATLAS_URI", "https://atlas.test");

// jose checks TextEncoder output with instanceof; jsdom otherwise supplies a different Uint8Array realm.
globalThis.Uint8Array = Object.getPrototypeOf(Buffer);
