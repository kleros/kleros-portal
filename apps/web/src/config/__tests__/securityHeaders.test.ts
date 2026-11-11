import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config.mjs";
import { securityHeaders } from "../securityHeaders.mjs";

const productionDirectives = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://api.web3modal.org",
  "font-src 'self' https://fonts.reown.com",
  "connect-src 'self' https://api.web3modal.org https://pulse.walletconnect.org https://rpc.walletconnect.org wss://relay.walletconnect.org https://verify.walletconnect.org https://verify.walletconnect.com https://arb1.arbitrum.io https://ethereum.reth.rs https://rpc.gnosischain.com https://atlas.example",
  "frame-src https://verify.walletconnect.org https://verify.walletconnect.com",
  "worker-src 'none'",
  "form-action 'self'",
];

function policy(nodeEnv: string) {
  return securityHeaders({ nodeEnv, atlasUri: "https://atlas.example/graphql?ignored=yes" }).find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;
}

describe("security headers", () => {
  it("enforces the exact production sources without wildcard hosts or eval", () => {
    expect(policy("production")?.split("; ")).toEqual(productionDirectives);
  });

  it("adds only eval and local HMR WebSockets in development", () => {
    expect(policy("development")?.split("; ")).toEqual(
      productionDirectives.map((directive) => {
        if (directive.startsWith("script-src ")) return `${directive} 'unsafe-eval'`;
        if (directive.startsWith("connect-src ")) return `${directive} ws://localhost:* ws://127.0.0.1:*`;
        return directive;
      }),
    );
    expect(policy("test")).toBe(policy("production"));
  });

  it("sets the other security headers", () => {
    expect(securityHeaders({ nodeEnv: "production", atlasUri: "https://atlas.example" }).slice(1)).toEqual([
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-Frame-Options", value: "DENY" },
    ]);
  });

  it("applies headers to every route and tightens email confirmation privacy", async () => {
    const rules = await nextConfig.headers();
    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: securityHeaders({ nodeEnv: process.env.NODE_ENV, atlasUri: "https://atlas.test" }),
      },
      {
        source: "/email-confirmation",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ]);
  });

  it.each([undefined, "", "not a URL", "data:text/plain,hello", "https://user:password@atlas.example"])(
    "rejects an invalid Atlas origin: %s",
    (atlasUri) => {
      expect(() => securityHeaders({ nodeEnv: "production", atlasUri })).toThrow(/NEXT_PUBLIC_ATLAS_URI/);
    },
  );

  it("allows only the configured local Atlas origin during build checks", () => {
    const headers = securityHeaders({ nodeEnv: "production", atlasUri: "http://127.0.0.1:4848/graphql" });
    expect(headers[0]?.value).toContain(" http://127.0.0.1:4848;");
    expect(headers[0]?.value).not.toContain("unsafe-eval");
  });
});

it("allows the default HTTP transports of all configured chains", async () => {
  const { arbitrum, mainnet, gnosis } = await import("viem/chains");
  const connect = policy("production")
    ?.split("; ")
    .find((directive) => directive.startsWith("connect-src "));
  for (const chain of [arbitrum, mainnet, gnosis]) {
    for (const url of chain.rpcUrls.default.http) {
      expect(connect?.split(" ")).toContain(new URL(url).origin);
    }
  }
});
