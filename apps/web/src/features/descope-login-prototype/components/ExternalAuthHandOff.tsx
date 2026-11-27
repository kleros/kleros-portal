"use client";

import { Button } from "@kleros/ui-components-library";

import { useAtlasSession } from "@/hooks/useAtlasSession";

import { useCompleteExternalAuth } from "../api/complete-external-auth";

/**
 * PROTOTYPE, throwaway: shown once the wallet has signed in to Atlas. One press hands the sign-in to Descope, which
 * then shows its own consent screen naming the agent.
 */
export function ExternalAuthHandOff({ externalAuthReqId }: { externalAuthReqId: string }) {
  const { address, token } = useAtlasSession();
  const { mutate, isPending, isSuccess, error } = useCompleteExternalAuth();

  return (
    <section
      aria-labelledby="hand-off-title"
      className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base mx-auto flex max-w-[480px] flex-col gap-5 border p-6 sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <h1 id="hand-off-title" className="text-2xl font-semibold tracking-tight">
          Continue to your agent
        </h1>
        <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">
          You are signed in as <code className="break-all">{address}</code>. Next you will see which agent is asking and
          what it may do.
        </p>
      </div>

      <Button
        text={isPending || isSuccess ? "Handing over…" : "Continue"}
        isDisabled={!token || isPending || isSuccess}
        onPress={() => token && mutate({ externalAuthReqId, atlasToken: token })}
      />

      <p role="alert" className="text-klerosUIComponentsError min-h-5 text-sm">
        {error?.message}
      </p>
    </section>
  );
}
