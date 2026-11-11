/** @param {{ nodeEnv?: string, atlasUri?: string }} options */
export function securityHeaders({ nodeEnv, atlasUri }) {
  let atlas;
  try {
    atlas = new URL(atlasUri ?? "");
  } catch {
    throw new Error("NEXT_PUBLIC_ATLAS_URI must be an HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(atlas.protocol) || atlas.username || atlas.password) {
    throw new Error("NEXT_PUBLIC_ATLAS_URI must be an HTTP(S) URL without credentials");
  }

  const development = nodeEnv === "development";
  const directives = {
    "default-src": ["'self'"],
    "base-uri": ["'none'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    // Static Next bootstrap and next-themes scripts cannot receive a per-request nonce.
    "script-src": ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    "script-src-attr": ["'none'"],
    // AppKit ThemeUtil injects style elements; React and library controls set style attributes.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://api.web3modal.org"],
    "font-src": ["'self'", "https://fonts.reown.com"],
    "connect-src": [
      "'self'",
      "https://api.web3modal.org",
      "https://pulse.walletconnect.org",
      "https://rpc.walletconnect.org",
      "wss://relay.walletconnect.org",
      "https://verify.walletconnect.org",
      "https://verify.walletconnect.com",
      "https://arb1.arbitrum.io",
      "https://ethereum.reth.rs",
      "https://rpc.gnosischain.com",
      atlas.origin,
      ...(development ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
    ],
    "frame-src": ["https://verify.walletconnect.org", "https://verify.walletconnect.com"],
    "worker-src": ["'none'"],
    "form-action": ["'self'"],
  };

  return [
    {
      key: "Content-Security-Policy",
      value: Object.entries(directives)
        .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
        .join("; "),
    },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
