import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** WCAG 2.1 A and AA, which includes 4.5:1 text contrast. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Fails with each violation's rule, impact and the offending selectors. */
export async function expectAccessible(page: Page, context?: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    // AppKit's modal lives in a shadow root the portal does not render
    .exclude("w3m-modal")
    .analyze();

  const summary = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
  expect(summary, context ? `accessibility of ${context}` : "accessibility").toEqual([]);
}
