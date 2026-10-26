import type { ReactNode } from "react";

import { Shell } from "@/components/layout/Shell";
import Web3Providers from "@/components/providers/Web3Providers";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Web3Providers>
      <Shell>{children}</Shell>
    </Web3Providers>
  );
}
