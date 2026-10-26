export default function ApiKeysPage() {
  return (
    <section
      aria-labelledby="api-keys-title"
      className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base mx-auto flex max-w-[480px] flex-col gap-2 border p-6 sm:p-8"
    >
      <h1 id="api-keys-title" className="text-2xl font-semibold tracking-tight">
        API keys are coming
      </h1>
      <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">
        Soon you will create and revoke keys for Kleros products and MCP servers here, signed in with the same wallet.
      </p>
    </section>
  );
}
