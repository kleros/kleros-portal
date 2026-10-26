/** Query keys more than one feature reads or invalidates. */
export const atlasQueryKeys = {
  /** `AtlasProvider`'s own key for the signed-in user. */
  user: ["UserSettings"] as const,
  topics: ["notificationTopics"] as const,
  subscriptions: (address: string | undefined) => ["notificationSubscriptions", address?.toLowerCase()] as const,
  allSubscriptions: ["notificationSubscriptions"] as const,
};
