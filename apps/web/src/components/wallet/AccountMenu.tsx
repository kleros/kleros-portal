"use client";

import { Button } from "@kleros/ui-components-library";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";

import { useSignOut } from "@/components/providers/SessionContext";

import { shortenAddress } from "@/utils/address";

export function ConnectWalletButton({ text = "Connect wallet", small }: { text?: string; small?: boolean }) {
  const { open } = useAppKit();
  return <Button small={small} text={text} onPress={() => void open({ view: "Connect" })} />;
}

export function AccountMenu() {
  const { address, isConnected } = useAccount();
  const signOut = useSignOut();

  if (!isConnected || !address) return <ConnectWalletButton small />;

  return (
    <div className="flex items-center gap-3">
      <span className="text-klerosUIComponentsSecondaryText hidden text-sm tabular-nums sm:inline" title={address}>
        {shortenAddress(address)}
      </span>
      <Button small variant="secondary" text="Sign out" onPress={signOut} />
    </div>
  );
}
