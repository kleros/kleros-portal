import type { Locator } from "@playwright/test";

/**
 * Flips a library Switch the way a person does: a tap on its visible track. The `switch` role sits on a
 * visually hidden input, which some engines will not toggle from a forced click.
 */
export const flip = (control: Locator) => control.locator("xpath=ancestor::label[1]").click();
