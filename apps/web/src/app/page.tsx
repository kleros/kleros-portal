"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { landingTarget } from "@/config/paths";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(landingTarget(window.location.hash));
  }, [router]);

  return null;
}
