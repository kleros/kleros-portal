"use client";

import { siteConfig } from "@/config/site";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base mx-auto max-w-md space-y-4 border p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-klerosUIComponentsSecondaryText">We could not load this page. Please try again.</p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => reset()}
          className="bg-klerosUIComponentsPrimaryBlue text-klerosUIComponentsWhiteBackground rounded-base hover:bg-klerosUIComponentsSecondaryBlue px-6 py-2 font-semibold"
        >
          Try again
        </button>
        <a
          href={siteConfig.links.support}
          target="_blank"
          rel="noopener noreferrer"
          className="text-klerosUIComponentsPrimaryBlue underline"
        >
          Contact support
        </a>
      </div>
    </section>
  );
}
