/** PROTOTYPE, throwaway. */
import { describe, expect, it } from "vitest";

import { bearerToken, descopeCompletion } from "../handOff";

describe("descopeCompletion", () => {
  it("lowercases a checksummed address for both the login id and the claim", () => {
    const completion = descopeCompletion("req-1", {
      address: "0xAbCdEf0000000000000000000000000000001234",
      roles: ["admin"],
    });

    expect(completion).toEqual({
      externalAuthReqId: "req-1",
      loginId: "0xabcdef0000000000000000000000000000001234",
      customClaims: { kleros_address: "0xabcdef0000000000000000000000000000001234", atlas_roles: ["admin"] },
    });
  });
});

describe("bearerToken", () => {
  it.each([null, "", "Bearer", "Bearer a.b", "bearer a.b.c", "Bearer a.b.c extra", "Basic a.b.c"])(
    "finds no token in %j",
    (header) => {
      expect(bearerToken(header)).toBeUndefined();
    },
  );

  it("takes the JWT out of a bearer header", () => {
    expect(bearerToken("Bearer eyJh.eyJz.c2ln")).toBe("eyJh.eyJz.c2ln");
  });
});
