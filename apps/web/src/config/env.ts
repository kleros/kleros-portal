import * as v from "valibot";

/**
 * Parsed once at module load; fails with the offending variable names.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` per literal reference at build time,
 * so each variable is read by its full name rather than by looping over `process.env`.
 */
const EnvSchema = v.object({
  REOWN_PROJECT_ID: v.pipe(
    v.string("missing: create a project at https://dashboard.reown.com"),
    v.minLength(1, "must not be empty"),
  ),
  ATLAS_URI: v.pipe(v.string("missing - Kleros Atlas origin, without /graphql"), v.url("must be a valid URL")),
  SITE_URL: v.optional(v.pipe(v.string(), v.url("must be a valid URL"))),
});

const ENV_VAR_NAMES: Record<keyof v.InferOutput<typeof EnvSchema>, string> = {
  REOWN_PROJECT_ID: "NEXT_PUBLIC_REOWN_PROJECT_ID",
  ATLAS_URI: "NEXT_PUBLIC_ATLAS_URI",
  SITE_URL: "NEXT_PUBLIC_SITE_URL",
};

/** An unset variable and one set to `""` fail the same way. */
const clean = (value: string | undefined) => (value === "" ? undefined : value);

const parsed = v.safeParse(EnvSchema, {
  REOWN_PROJECT_ID: clean(process.env.NEXT_PUBLIC_REOWN_PROJECT_ID),
  ATLAS_URI: clean(process.env.NEXT_PUBLIC_ATLAS_URI),
  SITE_URL: clean(process.env.NEXT_PUBLIC_SITE_URL),
});

if (!parsed.success) {
  const nested = v.flatten<typeof EnvSchema>(parsed.issues).nested ?? {};
  const problems = Object.entries(nested)
    .map(([key, messages]) => `  - ${ENV_VAR_NAMES[key as keyof typeof ENV_VAR_NAMES] ?? key}: ${messages?.join(", ")}`)
    .join("\n");

  throw new Error(
    `Invalid environment variables:\n${problems}\n\nSee apps/web/.env.example, then set them in apps/web/.env.local`,
  );
}

export const env = parsed.output;
