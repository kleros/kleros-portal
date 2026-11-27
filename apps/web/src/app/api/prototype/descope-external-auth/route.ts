/**
 * PROTOTYPE, throwaway: the portal's first server route. It completes Descope's External Authentication flow
 * action for a wallet that has signed in to Atlas, so an MCP client's OAuth login (Descope is the authorization
 * server) is finished by a Kleros sign-in here.
 *
 * POST, `Authorization: Bearer <Atlas JWT>`, body `{ externalAuthReqId }`.
 * 200 `{ redirectUrl }` for the browser to navigate to, else `{ error: { code, message } }`.
 *
 * Server-only env: DESCOPE_PROJECT_ID, DESCOPE_MANAGEMENT_KEY, DESCOPE_BASE_URL.
 */
import {
  descopeConfigFrom,
  handOffToDescope,
  HandOffError,
} from "@/features/descope-login-prototype/server/handOffToDescope";
import { bearerToken, parseHandOffRequest } from "@/features/descope-login-prototype/utils/handOff";

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };

const failure = (error: HandOffError) =>
  Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: NO_STORE });

export async function POST(request: Request) {
  try {
    const atlasToken = bearerToken(request.headers.get("authorization"));
    if (!atlasToken) throw new HandOffError("unauthenticated", "Sign in with your wallet first.");

    const parsed = parseHandOffRequest(await request.json().catch(() => undefined));
    if (!parsed) throw new HandOffError("invalid_request", "Open this page from your agent's sign-in link.");

    const descope = descopeConfigFrom(process.env);
    const result = await handOffToDescope({ externalAuthReqId: parsed.externalAuthReqId, atlasToken }, descope);
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof HandOffError) return failure(error);
    console.error("[prototype] descope hand-off failed:", error instanceof Error ? error.name : typeof error);
    return failure(new HandOffError("descope_rejected", "Something went wrong. Start again from your agent."));
  }
}
