"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AddEmail } from "@/features/account/components/AddEmail";
import { EmailCard } from "@/features/account/components/EmailCard";
import { RemoveEmail } from "@/features/account/components/RemoveEmail";
import { NotificationSettings } from "@/features/notifications/components/NotificationSettings";

import { SignInGate } from "@/components/auth/SignInGate";

function Notifications() {
  const product = useSearchParams()?.get("product") ?? undefined;

  return (
    <SignInGate>
      <NotificationSettings
        requestedProduct={product}
        noUser={<AddEmail />}
        header={<EmailCard />}
        dangerZone={<RemoveEmail />}
      />
    </SignInGate>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense>
      <Notifications />
    </Suspense>
  );
}
