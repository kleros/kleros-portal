import { GraphQLError } from "graphql";
import { ClientError } from "graphql-request";
import { afterEach, describe, expect, it, vi } from "vitest";

import { data, stubAtlasFetch } from "@/test/network";

import { atlasClient, atlasErrorMessage } from "../client";

afterEach(() => vi.unstubAllGlobals());

describe("atlasErrorMessage", () => {
  it("uses the first GraphQL message without request metadata or later errors", () => {
    const error = new ClientError(
      {
        status: 200,
        headers: new Headers(),
        body: "",
        errors: [new GraphQLError("Please sign in again"), new GraphQLError("Later failure")],
      },
      { query: "query PrivateRequest { user { email } }" },
    );
    expect(atlasErrorMessage(error)).toBe("Please sign in again");
  });
  it.each([undefined, []])("uses the Error message when the response errors are %j", (errors) => {
    const error = new ClientError(
      { status: 503, headers: new Headers(), body: "", errors },
      { query: "query { user { email } }" },
    );
    error.message = "Atlas is unavailable";
    expect(atlasErrorMessage(error)).toBe("Atlas is unavailable");
  });
  it("preserves an explicitly empty GraphQL message", () => {
    const error = new ClientError(
      { status: 200, headers: new Headers(), body: "", errors: [new GraphQLError("")] },
      { query: "query { user { email } }" },
    );
    expect(atlasErrorMessage(error)).toBe("");
  });
  it("uses a native network failure's message", () => {
    expect(atlasErrorMessage(new TypeError("Failed to fetch"))).toBe("Failed to fetch");
  });
  it.each([undefined, null, "offline", 42, {}, { response: {} }, { response: { errors: [] } }])(
    "uses Unknown error for a thrown non-Error value %j",
    (error) => expect(atlasErrorMessage(error)).toBe("Unknown error"),
  );
});

it.each([undefined, "signed-session"])(
  "sends Atlas requests with the appropriate authorization for %s",
  async (token) => {
    const { requests, fetch } = stubAtlasFetch(() => data({ notificationTopics: [] }));
    expect(
      await atlasClient(token).request(
        "query NotificationTopics { notificationTopics { product topic defaultEnabled } }",
      ),
    ).toEqual({ notificationTopics: [] });
    expect(requests).toEqual([{ operationName: "NotificationTopics" }]);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      token ? "Bearer signed-session" : null,
    );
  },
);
