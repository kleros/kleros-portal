"use client";

import { ExternalAuthHandOff } from "@/features/descope-login-prototype/components/ExternalAuthHandOff";

import { SignInGate } from "@/components/auth/SignInGate";

/** PROTOTYPE, throwaway: wallet sign-in as usual, then the hand-off back to Descope. */
export default function DescopeLoginPrototypePage({ externalAuthReqId }: { externalAuthReqId?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-klerosUIComponentsSecondaryText mx-auto max-w-[480px] text-center text-xs">
        Prototype. An AI agent asked to sign in to Kleros as you.
      </p>
      {externalAuthReqId ? (
        <SignInGate title="Sign in for your agent">
          <ExternalAuthHandOff externalAuthReqId={externalAuthReqId} />
        </SignInGate>
      ) : (
        <p role="alert" className="mx-auto max-w-[480px] text-center">
          Open this page from your agent&apos;s sign-in link.
        </p>
      )}
    </div>
  );
}
