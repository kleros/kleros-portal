import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Crawlers must fetch email confirmation to see its noindex metadata and header.
  return { rules: { userAgent: "*", allow: "/" } };
}
