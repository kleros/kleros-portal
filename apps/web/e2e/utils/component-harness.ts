import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import svgr from "vite-plugin-svgr";

const WEB_ROOT = path.resolve(__dirname, "../..");

/** What `src/config/env.ts` requires; the harness never reaches Atlas or a wallet. */
const HARNESS_ENV = {
  NEXT_PUBLIC_REOWN_PROJECT_ID: "harness",
  NEXT_PUBLIC_ATLAS_URI: "http://127.0.0.1:1",
};

/**
 * Serves `e2e/harness/<name>/index.html` with the app's own CSS, aliases and svg
 * handling, so a component renders in a real browser without a wallet or Atlas.
 * `aliases` swap modules (relative to the harness folder) for stubs.
 */
export async function startHarness(
  name: string,
  aliases: Record<string, string> = {},
): Promise<{ url: string; close: () => Promise<void> }> {
  const root = path.join(WEB_ROOT, "e2e/harness", name);
  const server: ViteDevServer = await createServer({
    configFile: false,
    root,
    logLevel: "error",
    plugins: [svgr({ include: "**/*.svg", exclude: "**/*.svg?url" })],
    esbuild: { jsx: "automatic" },
    // next/link and src/config/env.ts read process.env, which only Next defines in the browser
    define: { "process.env": JSON.stringify(HARNESS_ENV) },
    resolve: {
      alias: [
        ...Object.entries(aliases).map(([find, stub]) => ({
          find: new RegExp(`^${find.replace(/[/.]/g, "\\$&")}$`),
          replacement: path.join(root, stub),
        })),
        { find: "@", replacement: path.join(WEB_ROOT, "src") },
      ],
      mainFields: ["module", "browser", "main"],
    },
    // postcss.config.mjs, which runs Tailwind over src/
    css: { postcss: WEB_ROOT },
    server: { port: 0 },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error(`The ${name} harness did not report a URL.`);
  return { url, close: () => server.close() };
}

/** Opens a harness page once its Inter faces have loaded, so a layout is measured in the shipped font. */
export async function openHarness(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // Vite reloads a page whose first request makes it optimise a dependency, which drops this evaluation
  await expect
    .poll(
      () =>
        page
          .evaluate(() =>
            Promise.all(["400", "500", "600", "700"].map((weight) => document.fonts.load(`${weight} 16px Inter`))),
          )
          .then((faces) => faces.map((found) => found.length))
          .catch(() => []),
      // a cold Vite cache re-optimises dependencies before the first face can load
      { message: "each Inter weight loads from e2e/harness/inter.css", timeout: 30_000 },
    )
    .toEqual([1, 1, 1, 1]);
}
