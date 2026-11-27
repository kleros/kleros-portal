import type { Metadata } from "next";

import DescopeLoginPrototypePage from "./_components/DescopeLoginPrototypePage";

/**
 * PROTOTYPE, throwaway: the External Auth URL of a Descope flow. Descope sends the browser here with
 * `?external_auth_req_id=…` while an MCP client is signing in; see `app/api/prototype/descope-external-auth/route.ts`.
 */
export const metadata: Metadata = {
  title: "Sign in for an agent (prototype)",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function Page({ searchParams }: { searchParams: { external_auth_req_id?: string | string[] } }) {
  const id = searchParams.external_auth_req_id;
  return <DescopeLoginPrototypePage externalAuthReqId={typeof id === "string" && id ? id : undefined} />;
}
