import { gql, type GraphQLClient } from "graphql-request";

import type { Subscription, TopicChange, TopicPair } from "../model/settings";

const TOPICS = gql`
  query NotificationTopics {
    notificationTopics {
      product
      topic
      defaultEnabled
    }
  }
`;

const SUBSCRIPTIONS = gql`
  query NotificationSubscriptions {
    user {
      email
      notificationSubscriptions {
        product
        topic
        enabled
      }
    }
  }
`;

const UPDATE = gql`
  mutation UpdateNotificationSubscriptions(
    $product: SignupProduct!
    $subscriptions: [NotificationSubscriptionInput!]!
  ) {
    updateNotificationSubscriptions(product: $product, subscriptions: $subscriptions)
  }
`;

export const fetchTopics = (client: GraphQLClient) =>
  client.request<{ notificationTopics: TopicPair[] }>(TOPICS).then((data) => data.notificationTopics);

/** null when the address has never signed up: Atlas returns no subscriptions until a user exists. */
export const fetchSubscriptions = (client: GraphQLClient) =>
  client
    .request<{ user: { notificationSubscriptions: Subscription[] | null } | null }>(SUBSCRIPTIONS)
    .then((data) => data.user?.notificationSubscriptions ?? null);

/** All-or-nothing for one product, per Atlas. */
export const updateSubscriptions = (client: GraphQLClient, product: string, subscriptions: readonly TopicChange[]) =>
  client
    .request<{ updateNotificationSubscriptions: boolean }>(UPDATE, { product, subscriptions })
    .then((data) => data.updateNotificationSubscriptions);
