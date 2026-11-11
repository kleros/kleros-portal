import type { Metadata } from "next";

import NotificationsPage from "./_components/NotificationsPage";

export const metadata: Metadata = {
  title: "Notifications",
};

export default function Page() {
  return <NotificationsPage />;
}
