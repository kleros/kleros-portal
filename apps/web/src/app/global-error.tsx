"use client";

import { paths } from "@/config/paths";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "48px 24px",
          background: "#fafafa",
          color: "#17171a",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <meta name="referrer" content="no-referrer" />
        <main style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1>Something went wrong</h1>
          <p>We could not load the portal. Please try again.</p>
          <button type="button" onClick={() => reset()} style={{ padding: "8px 16px", cursor: "pointer" }}>
            Try again
          </button>
          <p>
            <a href={paths.home.getHref()} style={{ color: "#4d00b4" }}>
              Back to home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
