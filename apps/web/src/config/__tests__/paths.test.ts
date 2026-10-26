import { describe, expect, it } from "vitest";

import { landingTarget } from "../paths";

describe("landingTarget", () => {
  it("forwards Court's hash confirmation link with its query intact", () => {
    expect(landingTarget("#/settings/email-confirmation?address=0xAbC&token=deadbeef")).toBe(
      "/email-confirmation?address=0xAbC&token=deadbeef",
    );
  });

  it.each(["", "#", "#/settings/notifications", "#/settings/email-confirmation", "#/other?address=0x1&token=2"])(
    "sends %j to the notifications page",
    (hash) => {
      expect(landingTarget(hash)).toBe("/notifications");
    },
  );
});
