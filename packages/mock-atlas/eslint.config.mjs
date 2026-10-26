import { libraryConfig } from "@kleros-portal/eslint-config/library";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...libraryConfig,
  { rules: { "turbo/no-undeclared-env-vars": ["error", { allowList: ["MOCK_ATLAS_EMAIL_COOLDOWN_SECONDS"] }] } },
];
