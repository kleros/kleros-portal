import { parse, print } from "graphql";
import { expect, vi } from "vitest";

// Independent wire contracts: Atlas user/subscriptions DTOs and kleros-app's public mutations.
const documents = {
  NotificationTopics: `query NotificationTopics { notificationTopics { product topic defaultEnabled } }`,
  NotificationSubscriptions: `query NotificationSubscriptions { user { email notificationSubscriptions { product topic enabled } } }`,
  UpdateNotificationSubscriptions: `mutation UpdateNotificationSubscriptions($product: SignupProduct!, $subscriptions: [NotificationSubscriptionInput!]!) { updateNotificationSubscriptions(product: $product, subscriptions: $subscriptions) }`,
  AddUser: `mutation AddUser($settings: AddUserSettingsDto!) { addUser(addUserSettings: $settings) }`,
  UpdateEmail: `mutation UpdateEmail($newEmail: String!, $product: SignupProduct!) { updateEmail(newEmail: $newEmail, product: $product) }`,
  DeleteUser: `mutation DeleteUser { deleteUser }`,
  ConfirmEmail: `mutation ConfirmEmail($address: Address!, $token: String!) { confirmEmail(confirmEmailInput: { address: $address, token: $token }) { isConfirmed isTokenExpired isTokenInvalid } }`,
};

export interface AtlasRequest {
  operationName: keyof typeof documents;
  variables?: Record<string, unknown>;
}

export function stubAtlasFetch(handle: (request: AtlasRequest) => Response | Promise<Response>) {
  const requests: AtlasRequest[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(String(input)).toBe("https://atlas.test/graphql");
    expect(init?.method).toBe("POST");
    expect(typeof init?.body).toBe("string");
    const body = JSON.parse(String(init?.body));
    const operationName: keyof typeof documents = body.operationName;
    expect(operationName in documents).toBe(true);
    expect({ ...body, query: print(parse(body.query)) }).toEqual({
      operationName,
      query: print(parse(documents[operationName])),
      ...(body.variables === undefined ? {} : { variables: body.variables }),
    });
    const request: AtlasRequest = {
      operationName,
      ...(body.variables === undefined ? {} : { variables: body.variables }),
    };
    requests.push(request);
    return handle(request);
  });
  vi.stubGlobal("fetch", fetch);
  return { requests, fetch };
}

export const data = (value: Record<string, unknown>) => Response.json({ data: value });
export const failure = (message: string) => Response.json({ errors: [{ message }] });

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
