import { paths } from "@/config/paths";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base w-full max-w-md space-y-4 border p-8">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-klerosUIComponentsSecondaryText">This page does not exist. Head back to the portal.</p>
        <a href={paths.home.getHref()} className="text-klerosUIComponentsPrimaryBlue inline-block underline">
          Back to home
        </a>
      </section>
    </main>
  );
}
