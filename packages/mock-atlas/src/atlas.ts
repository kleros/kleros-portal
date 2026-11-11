import type { IncomingMessage, ServerResponse } from "node:http";

import type { Hex } from "viem";
import { generateSiweNonce } from "viem/siwe";

import { authenticate, login } from "./auth";
import { isValidEmail } from "./email";
import {
  enumInput,
  GraphqlError,
  inputAt,
  parseOperation,
  projectFields,
  type Field,
  type GraphqlBody,
} from "./graphql";
import { readBody, sendJson } from "./http";
import { MOCK_ROLES } from "./index";
import { NotificationTopic, PRODUCT_TOPIC_DEFAULTS, SignupProduct } from "./registry";
import {
  confirmEmail,
  deleteUser,
  effectiveSubscriptions,
  issueConfirmation,
  now,
  offeredTopics,
  subscriptionKey,
  takeFault,
  type Store,
} from "./store";

const enumName = (values: Record<string, string>, value: string) =>
  Object.keys(values).find((key) => values[key] === value)!;
const wireRows = (rows: { product: SignupProduct; topic: NotificationTopic }[]) =>
  rows.map((row) => ({
    ...row,
    product: enumName(SignupProduct, row.product),
    topic: enumName(NotificationTopic, row.topic),
  }));
const missingUser = () => new GraphqlError("User not found", "UserNotFoundError", 404);
const publicFields = new Set(["notificationTopics", "isSubscribed", "nonce", "login", "roles", "confirmEmail"]);

const prepare = (field: Field, variables: Record<string, unknown>) => {
  const input = (arg: string, path: (string | number)[] = []) => inputAt(field, arg, variables, path);
  const args = Object.fromEntries(Object.keys(field.args).map((key) => [key, input(key).value]));
  let product: SignupProduct | undefined;
  if (["notificationTopics", "updateNotificationSubscriptions", "updateEmail"].includes(field.name)) {
    product = enumInput(
      input("product"),
      "SignupProduct",
      SignupProduct,
      field.name === "updateNotificationSubscriptions",
    );
  }
  if (field.name === "addUser")
    product = enumInput(input("addUserSettings", ["product"]), "SignupProduct", SignupProduct);
  const filters = new Map<Field, SignupProduct | undefined>();
  if (field.name === "user") {
    for (const child of field.fields.filter((entry) => entry.name === "notificationSubscriptions")) {
      filters.set(child, enumInput(inputAt(child, "product", variables), "SignupProduct", SignupProduct));
    }
  }
  const subscriptions: { topic: NotificationTopic; enabled: boolean }[] = [];
  if (field.name === "updateNotificationSubscriptions") {
    if (!Array.isArray(args.subscriptions)) throw new GraphqlError("Subscriptions must be a list", "BAD_USER_INPUT");
    for (const [index, value] of args.subscriptions.entries()) {
      const topic = enumInput(input("subscriptions", [index, "topic"]), "NotificationTopic", NotificationTopic, true)!;
      if (!value || typeof value.enabled !== "boolean")
        throw new GraphqlError("Subscription enabled must be a Boolean", "BAD_USER_INPUT");
      subscriptions.push({ topic, enabled: value.enabled });
    }
  }
  return { args, product, filters, subscriptions };
};

const resolve = async (store: Store, field: Field, prepared: ReturnType<typeof prepare>, address?: string) => {
  const { args, product, subscriptions, filters } = prepared;
  const user = address ? store.users.get(address) : undefined;
  switch (field.name) {
    case "notificationTopics":
      return projectFields(wireRows(offeredTopics(product)), field.fields);
    case "nonce": {
      const key = String(args.address);
      const nonce = generateSiweNonce();
      const nonces = store.nonces.get(key) ?? new Set<string>();
      nonces.add(nonce);
      store.nonces.set(key, nonces);
      return nonce;
    }
    case "login":
      return login(store, args.message as string, args.signature as Hex);
    case "roles":
      return projectFields(MOCK_ROLES, field.fields);
    case "isSubscribed":
      return Boolean(store.users.get(String(args.address).toLowerCase())?.isEmailVerified);
    case "user": {
      const record = user ?? {
        address,
        email: null,
        isEmailVerified: false,
        roles: [],
        emailUpdateableAt: null,
        lastEmailUpdatedAt: null,
      };
      return Object.fromEntries(
        field.fields.map((child) => [
          child.key,
          child.name === "notificationSubscriptions"
            ? user?.email
              ? projectFields(wireRows(effectiveSubscriptions(store, address!, filters.get(child))), child.fields)
              : null
            : projectFields((record as Record<string, unknown>)[child.name] ?? null, child.fields),
        ]),
      );
    }
    case "addUser": {
      const settings = args.addUserSettings as { email: string; roles?: unknown };
      if (typeof settings.email !== "string" || !isValidEmail(settings.email))
        throw new GraphqlError("Bad Request Exception", "HttpClientError", 400);
      if (user) throw new GraphqlError("The user is already registered", "UserAlreadyRegisteredError", 409);
      if (settings.roles)
        throw new GraphqlError("Unauthorized: only admins can assign roles", "UnauthorizedRoleAssignmentError", 403);
      store.users.set(address!, {
        address: address!,
        email: settings.email,
        roles: ["user"],
        isEmailVerified: false,
        emailUpdateableAt: new Date(now(store)).toISOString(),
        lastEmailUpdatedAt: "",
      });
      issueConfirmation(store, address!, settings.email, false);
      return true;
    }
    case "updateEmail": {
      if (!user) throw missingUser();
      if (Date.parse(user.emailUpdateableAt) > now(store))
        throw new GraphqlError(
          `Email can only be updated once every ${store.emailCooldownSeconds} seconds`,
          "TooFrequentEmailUpdateError",
          429,
        );
      issueConfirmation(store, address!, args.newEmail as string, true);
      return true;
    }
    case "confirmEmail": {
      const { address: confirmationAddress, token } = args.confirmEmailInput as { address: string; token: string };
      return projectFields(confirmEmail(store, confirmationAddress, token), field.fields);
    }
    case "deleteUser": {
      if (!user) throw missingUser();
      deleteUser(store, address!);
      return true;
    }
    case "updateNotificationSubscriptions": {
      const seen = new Set<NotificationTopic>();
      for (const { topic } of subscriptions) {
        if (!Object.hasOwn(PRODUCT_TOPIC_DEFAULTS[product!], topic))
          throw new GraphqlError("Topic is not offered by this product", "TopicNotOfferedError", 400);
        if (seen.has(topic))
          throw new GraphqlError(
            "The same topic appears more than once in the update",
            "DuplicateTopicUpdateError",
            400,
          );
        seen.add(topic);
      }
      if (!user) throw missingUser();
      for (const { topic, enabled } of subscriptions) {
        store.subscriptions.set(subscriptionKey(address!, product!, topic), {
          userAddress: address!,
          product: product!,
          topic,
          enabled,
        });
      }
      return true;
    }
    default:
      throw new GraphqlError(`mock-atlas: unhandled field ${field.name}`);
  }
};

export const handleGraphql = async (store: Store, req: IncomingMessage, res: ServerResponse) => {
  let field: Field | undefined;
  try {
    const body = JSON.parse((await readBody(req)).toString()) as GraphqlBody;
    const operation = parseOperation(body);
    field = operation.field;
    const entry = { field: field.name, variables: body.variables ?? {}, authorized: false };
    store.requests.push(entry);
    const productField =
      field.name === "user"
        ? (field.fields.find((child) => child.name === "notificationSubscriptions") ?? field)
        : field;
    const product =
      field.name === "addUser"
        ? inputAt(field, "addUserSettings", operation.variables, ["product"]).value
        : inputAt(productField, "product", operation.variables).value;
    const fault = takeFault(store, field.name, product);
    const auth = await authenticate(store, req.headers.authorization);
    entry.authorized = Boolean(auth.address);
    if (fault !== undefined) throw new GraphqlError(fault);
    const prepared = prepare(field, operation.variables);
    if (!publicFields.has(field.name) && auth.error) throw auth.error;
    const value = await resolve(store, field, prepared, auth.address);
    return sendJson(res, 200, { data: { [field.key]: value } });
  } catch (error) {
    const failure =
      error instanceof GraphqlError
        ? error
        : new GraphqlError(
            error instanceof SyntaxError ? "Invalid JSON request" : "mock-atlas: invalid request",
            "BAD_USER_INPUT",
          );
    const validation =
      failure.code === "GRAPHQL_VALIDATION_FAILED" ||
      failure.code === "GRAPHQL_PARSE_FAILED" ||
      failure.code === "BAD_USER_INPUT";
    const location = failure.location ?? field?.location;
    const status = failure.code === "GRAPHQL_VALIDATION_FAILED" || failure.code === "GRAPHQL_PARSE_FAILED" ? 400 : 200;
    return sendJson(res, status, {
      ...(!validation && { data: null }),
      errors: [
        {
          message: failure.message,
          ...(location && { locations: [location] }),
          ...(!validation && field && { path: [field.key] }),
          ...(failure.code && {
            extensions: {
              code: failure.code,
              ...(failure.status && {
                timestamp: new Date(now(store)).toISOString(),
                equivalentHTTPStatusCode: failure.status,
              }),
            },
          }),
        },
      ],
    });
  }
};
