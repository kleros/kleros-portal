"use client";

import { Button } from "@kleros/ui-components-library";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect } from "wagmi";

import { shortenAddress } from "@/utils/address";

import { clearAuthToken } from "@/lib/atlas/session";

export function ConnectWalletButton({ text = "Connect wallet", small }: { text?: string; small?: boolean }) {
  const { open } = useAppKit();
  return <Button small={small} text={text} onPress={() => void open({ view: "Connect" })} />;
}

export function AccountMenu() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) return <ConnectWalletButton small />;

  return (
    <div className="flex items-center gap-3">
      <span className="text-klerosUIComponentsSecondaryText hidden text-sm tabular-nums sm:inline" title={address}>
        {shortenAddress(address)}
      </span>
      <Button
        small
        variant="secondary"
        text="Sign out"
        onPress={() => {
          clearAuthToken();
          disconnect();
        }}
      />
    </div>
  );
}
