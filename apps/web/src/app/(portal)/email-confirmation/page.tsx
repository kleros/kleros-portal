import type { Metadata } from "next";

import EmailConfirmationPage from "./_components/EmailConfirmationPage";

export const metadata: Metadata = {
  title: "Email confirmation",
  referrer: "no-referrer",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <EmailConfirmationPage />;
}
