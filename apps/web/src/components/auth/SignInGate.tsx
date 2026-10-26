"use client";

import { useState, type ReactNode } from "react";

import { useAtlasProvider } from "@kleros/kleros-app";
import { Button } from "@kleros/ui-components-library";
import { useAccount } from "wagmi";

import { ConnectWalletButton } from "@/components/wallet/AccountMenu";

import { atlasErrorMessage } from "@/lib/atlas/client";

const isRejection = (error: unknown) =>
  /reject|denied|cancel/i.test(error instanceof Error ? `${error.name} ${error.message}` : String(error));

/** Renders `children` once the connected wallet has signed in to Atlas; until then, the next step. */
export function SignInGate({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const { isVerified, isSigningIn, authoriseUser } = useAtlasProvider();
  const [error, setError] = useState<string | null>(null);

  if (address && isVerified) return children;

  const signIn = () => {
    setError(null);
    authoriseUser().catch((cause: unknown) =>
      setError(
        isRejection(cause)
          ? "You declined the signature in your wallet."
          : `Sign-in failed: ${atlasErrorMessage(cause)}`,
      ),
    );
  };

  return (
    <section
      aria-labelledby="sign-in-title"
      className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base mx-auto flex max-w-[480px] flex-col gap-5 border p-6 sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <h1 id="sign-in-title" className="text-2xl font-semibold tracking-tight">
          Your Kleros emails, in one place
        </h1>
        <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">
          {address
            ? "Sign a message to prove this wallet is yours. It is free and sends no transaction."
            : "Connect the wallet you use on Court, Proof of Humanity or Foresight."}
        </p>
      </div>

      {address ? (
        <Button text={isSigningIn ? "Waiting for your wallet…" : "Sign in"} isDisabled={isSigningIn} onPress={signIn} />
      ) : (
        <ConnectWalletButton />
      )}

      <p role="alert" className="text-klerosUIComponentsError min-h-5 text-sm">
        {error}
      </p>
    </section>
  );
}
