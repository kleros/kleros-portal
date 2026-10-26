import {
  addUser,
  confirmEmail,
  deleteUser,
  SignupProduct,
  updateEmail,
  type useAtlasProvider,
} from "@kleros/kleros-app";
import { GraphQLClient } from "graphql-request";
import { vi } from "vitest";

export function testAtlas() {
  const client = () => new GraphQLClient("https://atlas.test/graphql");
  const atlas = {
    isVerified: true,
    isSigningIn: false,
    isAddingUser: false,
    isDeletingUser: false,
    isFetchingUser: false,
    isUpdatingUser: false,
    isUploadingFile: false,
    isConfirmingEmail: false,
    user: undefined,
    userExists: false,
    roleRestrictions: undefined,
    authoriseUser: vi.fn<ReturnType<typeof useAtlasProvider>["authoriseUser"]>().mockResolvedValue(undefined),
    // Keep the installed SDK's wire encoding; only its React context is replaced.
    addUser: vi.fn<ReturnType<typeof useAtlasProvider>["addUser"]>((settings) =>
      addUser(client(), { ...settings, product: SignupProduct.CourtV2 }),
    ),
    updateEmail: vi.fn<ReturnType<typeof useAtlasProvider>["updateEmail"]>((settings) =>
      updateEmail(client(), { ...settings, product: SignupProduct.CourtV2 }),
    ),
    deleteUser: vi.fn<ReturnType<typeof useAtlasProvider>["deleteUser"]>(() => deleteUser(client())),
    confirmEmail: vi.fn<ReturnType<typeof useAtlasProvider>["confirmEmail"]>(async (settings) => ({
      ...(await confirmEmail(client(), settings)),
      isError: false,
    })),
    checkIsSubscribed: vi.fn<ReturnType<typeof useAtlasProvider>["checkIsSubscribed"]>().mockResolvedValue(false),
    uploadFile: vi.fn<ReturnType<typeof useAtlasProvider>["uploadFile"]>().mockResolvedValue(null),
  };
  return atlas satisfies ReturnType<typeof useAtlasProvider>;
}
