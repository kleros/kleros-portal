import { createRoot } from "react-dom/client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AddEmail } from "@/features/account/components/AddEmail";
import { EmailCard } from "@/features/account/components/EmailCard";
import { RemoveEmail } from "@/features/account/components/RemoveEmail";
import { NotificationSettings } from "@/features/notifications/components/NotificationSettings";
import type { Subscription, TopicPair } from "@/features/notifications/model/settings";

import { SignInGate } from "@/components/auth/SignInGate";
import { Shell } from "@/components/layout/Shell";
import { SessionContext } from "@/components/providers/SessionContext";

import { atlasQueryKeys } from "@/lib/atlas/queryKeys";
import { AUTH_TOKEN_KEY } from "@/lib/atlas/session";

import { HARNESS_ADDRESS, harnessState } from "./stubs";

import "@/styles/global.css";
import "../inter.css";

/**
 * The notifications page outside Next, from the URL:
 *   ?theme=dark   ?product=<id>   ?state=ready|loading|error|nouser   ?topics=all-off|all-on
 *   ?catalogue=atlas|wide   plus the account parameters in ./stubs.tsx
 */
const params = new URLSearchParams(window.location.search);
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");

const pairs = (product: string, topics: string[], off: string[] = []): TopicPair[] =>
  topics.map((topic) => ({ product, topic, defaultEnabled: !off.includes(topic) }));

const COURT = [
  "DisputeAppealable",
  "DisputeAppealed",
  "JurorCanVote",
  "JurorCanCommit",
  "JurorCanReveal",
  "JurorDraw",
  "StakeNew",
  "StakeUnstaked",
  "StakeChanged",
  "CaseWon",
  "CaseLost",
];
const POH = [
  "VouchingPhase",
  "PendingRequest",
  "ResolvedRequest",
  "VouchAdded",
  "VouchAddedVoucher",
  "PendingRevoke",
  "ResolvedRevoke",
  "DisputedSubmission",
  "DisputedRevoke",
  "ChallengeAccepted",
  "ChallengeRejected",
  "DisputeRuledTie",
  "Rewards",
];

// Atlas's registry today (packages/utils/src/notifications/notification-subscription.ts)
const ATLAS: TopicPair[] = [
  ...pairs("CourtV1", COURT),
  ...pairs("CourtV2", COURT),
  ...pairs("PohV2", POH, ["Rewards"]),
  ...pairs("Foresight", ["MarketResolved"]),
];

// A product and topics the portal has no words for, with long keys
const WIDE: TopicPair[] = [
  ...ATLAS,
  ...pairs("curateV2ExtendedRegistryNotifications", [
    "itemSubmittedToARegistryYouFollowClosely",
    "challengePeriodEnding",
  ]),
  ...pairs("Foresight", ["aVeryLongTopicKeyThatHasNoCopyInThePortalYetAndKeepsGoing"]),
];

const catalogue = params.get("catalogue") === "wide" ? WIDE : ATLAS;
const topicsMode = params.get("topics");
const rows: Subscription[] = catalogue.map(({ product, topic, defaultEnabled }) => ({
  product,
  topic,
  enabled: topicsMode === "all-off" ? false : topicsMode === "all-on" ? true : defaultEnabled,
}));

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
// readAuthToken decodes, it does not verify
const token = `${base64url({ alg: "HS256" })}.${base64url({ sub: HARNESS_ADDRESS, exp: 4102444800 })}.harness`;
if (harnessState.signedIn) window.sessionStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(token));

const state = params.get("state") ?? "ready";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

if (state === "loading") {
  window.fetch = () => new Promise<Response>(() => {});
} else if (state === "error") {
  window.fetch = async () => new Response("unavailable", { status: 503 });
} else {
  queryClient.setQueryData(atlasQueryKeys.topics, catalogue);
  queryClient.setQueryData(atlasQueryKeys.subscriptions(HARNESS_ADDRESS), state === "nouser" ? null : rows);
}

function Harness() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={() => {}}>
        <Shell>
          <SignInGate>
            <NotificationSettings
              requestedProduct={params.get("product") ?? undefined}
              noUser={<AddEmail />}
              header={<EmailCard />}
              dangerZone={<RemoveEmail />}
            />
          </SignInGate>
        </Shell>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
