import { GraphQLClient } from "graphql-request";

import { env } from "@/config/env";

/** A client for Atlas's GraphQL endpoint, authenticated when `token` is given. */
export const atlasClient = (token?: string) =>
  new GraphQLClient(`${env.ATLAS_URI}/graphql`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });

/** The first GraphQL error message of a graphql-request failure, else the error's own message. */
export function atlasErrorMessage(error: unknown): string {
  const response = (error as { response?: { errors?: { message?: string }[] } })?.response;
  return response?.errors?.[0]?.message ?? (error instanceof Error ? error.message : "Unknown error");
}
