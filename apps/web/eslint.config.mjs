import { architectureConfig } from "@kleros-portal/eslint-config/architecture";
import { nextJsConfig } from "@kleros-portal/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  architectureConfig(import.meta.dirname),
  {
    settings: {
      next: {
        rootDir: ".",
      },
    },
  },
  {
    // Every internal href goes through `src/config/paths.ts`.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'JSXAttribute[name.name="href"] > Literal[value=/^\\//]',
          message: "Link through paths.getHref() from @/config/paths instead of writing the route.",
        },
        {
          selector: 'JSXAttribute[name.name="href"] TemplateLiteral[quasis.0.value.raw=/^\\//]',
          message: "Link through paths.getHref() from @/config/paths instead of writing the route.",
        },
      ],
    },
  },
  {
    // Playwright fixtures take a `use` callback, which the React plugin reads as React's `use` hook.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];
