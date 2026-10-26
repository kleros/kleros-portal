/**
 * Stand-ins for the wallet and Atlas modules, read from the page URL by `harnessState`:
 *   ?email=<address>|none   ?verified=0|1   ?cooldown=<minutes>   ?signedIn=0|1
 */
const params = new URLSearchParams(window.location.search);

export const HARNESS_ADDRESS = "0x1111111111111111111111111111111111111111";

export const harnessState = {
  signedIn: params.get("signedIn") !== "0",
  email: params.get("email") === "none" ? null : (params.get("email") ?? "juror@kleros.io"),
  verified: params.get("verified") === "1",
  cooldownMinutes: Number(params.get("cooldown") ?? 0),
};

const resolved = async () => true;

// @kleros/kleros-app
export enum SignupProduct {
  CourtV1 = "courtV1",
  CourtV2 = "courtV2",
  PohV2 = "pohV2",
  Foresight = "foresight",
}

export function useAtlasProvider() {
  const { email, verified, cooldownMinutes, signedIn } = harnessState;
  return {
    isVerified: signedIn,
    isSigningIn: false,
    isFetchingUser: false,
    user: email
      ? {
          email,
          isEmailVerified: verified,
          emailUpdateableAt: cooldownMinutes > 0 ? new Date(Date.now() + cooldownMinutes * 60_000).toISOString() : null,
        }
      : undefined,
    userExists: Boolean(email),
    authoriseUser: async () => {},
    addUser: resolved,
    updateEmail: resolved,
    deleteUser: resolved,
    confirmEmail: async () => ({ isConfirmed: true, isTokenExpired: false, isTokenInvalid: false, isError: false }),
  };
}

// wagmi
export function useAccount() {
  return harnessState.signedIn
    ? { address: HARNESS_ADDRESS, isConnected: true }
    : { address: undefined, isConnected: false };
}

export function useDisconnect() {
  return { disconnect: () => {} };
}

// @reown/appkit/react
export function useAppKit() {
  return { open: async () => {} };
}
