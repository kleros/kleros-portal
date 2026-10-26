"use client";

import { useEffect, useState } from "react";

import { useTheme } from "next-themes";

/** Custom: the library has no theme control. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="text-klerosUIComponentsSecondaryText hover:text-klerosUIComponentsPrimaryText rounded-base focus-visible:outline-klerosUIComponentsPrimaryBlue flex size-9 cursor-pointer items-center justify-center focus-visible:outline-2"
    >
      <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden focusable={false} fill="currentColor">
        {isDark ? (
          <path d="M10 14.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1Zm0 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 16Zm9-6a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 19 10ZM4 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 4 10Zm11.36-5.36a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM6.76 13.24a.75.75 0 0 1 0 1.06L5.7 15.36a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0Zm8.6 2.12a.75.75 0 0 1-1.06 0l-1.06-1.06a.75.75 0 1 1 1.06-1.06l1.06 1.06a.75.75 0 0 1 0 1.06ZM6.76 6.76a.75.75 0 0 1-1.06 0L4.64 5.7A.75.75 0 0 1 5.7 4.64l1.06 1.06a.75.75 0 0 1 0 1.06Z" />
        ) : (
          <path d="M7.46 2.2a.75.75 0 0 1 .17.82 6.5 6.5 0 0 0 9.35 7.88.75.75 0 0 1 1.02.94A8 8 0 1 1 6.64 2.03a.75.75 0 0 1 .82.17Z" />
        )}
      </svg>
    </button>
  );
}
