"use client";

import { useState, type ReactNode } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { makeQueryClient } from "@/lib/query";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      themes={["light", "dark"]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
