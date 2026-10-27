import { expect, test, type Page } from "@playwright/test";

import { expectAccessible } from "../utils/a11y";
import { openHarness, startHarness } from "../utils/component-harness";

const STUBS = {
  "@kleros/kleros-app": "stubs.tsx",
  wagmi: "stubs.tsx",
  "@reown/appkit/react": "stubs.tsx",
};

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const UNBREAKABLE = `${"a".repeat(64)}@${"b".repeat(40)}.example`;

/** Every state the page can be in, as harness query strings. */
const STATES: Record<string, string> = {
  "court-v2": "product=CourtV2&verified=1",
  "poh-13-topics": "product=PohV2&verified=1",
  "foresight-1-topic": "product=Foresight&verified=1",
  "all-off": "product=CourtV2&verified=1&topics=all-off",
  unverified: "product=CourtV2&verified=0",
  "unverified-unbreakable-email": `product=PohV2&verified=0&email=${UNBREAKABLE}`,
  cooldown: "product=CourtV2&verified=0&cooldown=90",
  "unknown-product-and-topics": "catalogue=wide&product=curateV2ExtendedRegistryNotifications&verified=1",
  "no-user": "state=nouser&email=none",
  loading: "state=loading",
  error: "state=error",
  "signed-out": "signedIn=0",
};

let harness: Awaited<ReturnType<typeof startHarness>>;

test.beforeAll(async () => {
  harness = await startHarness("portal", STUBS);
});

test.afterAll(async () => {
  await harness?.close();
});

/** Elements whose box extends past the viewport's right edge, by tag and text. */
function overflowing(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>("main *, header *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0) return false;
        // content inside a horizontal scroller is reachable by scrolling it
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const { overflowX } = getComputedStyle(parent);
          if (overflowX === "auto" || overflowX === "scroll") return false;
        }
        return rect.right > limit + 0.5;
      })
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}"`);
  });
}

/**
 * Switch tracks, on or off, under 3:1 against the surface behind them (WCAG 1.4.11 non-text contrast);
 * axe does not measure this.
 */
function weakSwitchTracks(page: Page) {
  return page.evaluate(() => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
    const luminance = ([r = 0, g = 0, b = 0]: number[]) =>
      [r, g, b]
        .map((channel) => channel / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    const surface = (element: Element | null): number[] => {
      for (let node = element; node; node = node.parentElement) {
        const color = rgb(getComputedStyle(node).backgroundColor);
        if (color.length === 3 || (color[3] ?? 0) > 0) return color;
      }
      return [255, 255, 255];
    };
    return [...document.querySelectorAll<HTMLInputElement>("input[role='switch']")].flatMap((input) => {
      const label = input.closest("label");
      const track = label?.querySelector(":scope > span:last-child");
      if (!label || !track) return [];
      const a = luminance(rgb(getComputedStyle(track).backgroundColor));
      const b = luminance(surface(label.parentElement));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return ratio < 3
        ? [`${input.getAttribute("aria-label")} (${input.checked ? "on" : "off"}): ${ratio.toFixed(2)}`]
        : [];
    });
  });
}

/** Single-line elements whose text is wider than their box, such as a fixed-width chip. */
function clippedText(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main *, header *")]
      .filter(
        (element) =>
          // visually hidden text is 1px wide by design
          element.clientWidth > 1 &&
          (element.textContent ?? "").trim() !== "" &&
          getComputedStyle(element).whiteSpace === "nowrap" &&
          element.scrollWidth > element.clientWidth + 1,
      )
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}"`),
  );
}

for (const theme of ["light", "dark"] as const) {
  test(`switch keyboard focus · ${theme}`, async ({ page }) => {
    await openHarness(page, `${harness.url}?theme=${theme}&${STATES["court-v2"]}`);
    const control = page.getByRole("switch").first();
    await expect(control).toBeVisible();
    for (let presses = 0; presses < 50; presses += 1) {
      await page.keyboard.press("Tab");
      if (await control.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(control).toBeFocused();
    const label = control.locator("xpath=ancestor::label");
    await expect(label).toHaveAttribute("data-focus-visible", "true");
    await expect.poll(() => label.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const [name, query] of Object.entries(STATES)) {
    for (const viewport of VIEWPORTS) {
      test(`${name} · ${theme} · ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openHarness(page, `${harness.url}?theme=${theme}&${query}`);
        await expect(page.locator("main")).toBeVisible();

        expect(await overflowing(page)).toEqual([]);
        expect(await clippedText(page)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

        // every switch lies inside the viewport
        for (const control of await page.getByRole("switch").all()) {
          await control.scrollIntoViewIfNeeded();
          const box = await control.locator("xpath=..").boundingBox();
          expect(box, "switch has a box").not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        }

        expect(await weakSwitchTracks(page)).toEqual([]);
        await expectAccessible(page, `${name} in ${theme} at ${viewport.width}px`);
      });
    }
  }
}

test.describe("@screenshot", () => {
  const SHOTS = ["court-v2", "unverified", "no-user", "unverified-unbreakable-email"];
  for (const theme of ["light", "dark"] as const) {
    for (const name of SHOTS) {
      for (const viewport of [VIEWPORTS[1]!, VIEWPORTS[3]!]) {
        test(`${name} · ${theme} · ${viewport.width} @screenshot`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await openHarness(page, `${harness.url}?theme=${theme}&${STATES[name]}`);
          await expect(page).toHaveScreenshot(`${name}-${theme}-${viewport.width}.png`, {
            fullPage: true,
            animations: "disabled",
          });
        });
      }
    }
  }
});
