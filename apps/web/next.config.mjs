import process from "node:process";

import { securityHeaders } from "./src/config/securityHeaders.mjs";

/** @satisfies {import('next').NextConfig} */
const nextConfig = {
  // the production-mode e2e build goes beside the real one, so it never overwrites a deployable .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          nodeEnv: process.env.NODE_ENV,
          atlasUri: process.env.NEXT_PUBLIC_ATLAS_URI,
        }),
      },
      {
        source: "/email-confirmation",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [],
  },
  webpack: (config) => {
    // Grab the existing rule that handles SVG imports
    const fileLoaderRule = config.module.rules.find((rule) => rule.test?.test?.(".svg"));

    config.module.rules.push(
      // Reapply the existing rule, but only for svg imports ending in ?url
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/, // *.svg?url
      },
      // Convert all other *.svg imports to React components
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: { not: [...fileLoaderRule.resourceQuery.not, /url/] }, // exclude if *.svg?url
        use: [
          {
            loader: "@svgr/webpack",
            options: {
              // svgr's own defaults, keeping the viewBox (an undersized icon clips
              // without it); prefixIds keeps inlined icons' clipPath ids from colliding.
              svgoConfig: {
                plugins: [{ name: "preset-default", params: { overrides: { removeViewBox: false } } }, "prefixIds"],
              },
            },
          },
        ],
      },
    );

    // Modify the file loader rule to ignore *.svg, since we have it handled now.
    fileLoaderRule.exclude = /\.svg$/i;

    // Wallet SDKs we deliberately don't ship.
    const unusedWalletSdks = [
      "@base-org/account",
      "@coinbase/wallet-sdk",
      "@metamask/connect-evm",
      "@walletconnect/ethereum-provider",
      "accounts",
      "porto",
      "porto/internal",
    ];

    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(unusedWalletSdks.map((pkg) => [pkg, false])),
    };

    return config;
  },
};

export default nextConfig;
