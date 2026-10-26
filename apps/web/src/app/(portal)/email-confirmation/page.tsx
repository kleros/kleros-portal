"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { EmailConfirmation } from "@/features/account/components/EmailConfirmation";

function Confirmation() {
  const params = useSearchParams();
  return <EmailConfirmation address={params?.get("address") ?? undefined} token={params?.get("token") ?? undefined} />;
}

export default function EmailConfirmationPage() {
  return (
    <Suspense>
      <Confirmation />
    </Suspense>
  );
}
