// Mirrors Atlas packages/utils/src/products.ts and packages/utils/src/notifications/notification-subscription.ts.
export enum SignupProduct {
  CourtV1 = "courtV1",
  CourtV2 = "courtV2",
  PohV2 = "pohV2",
  Foresight = "foresight",
}

export enum CourtNotificationTopic {
  DisputeAppealable = "disputeAppealable",
  DisputeAppealed = "disputeAppealed",
  JurorCanVote = "jurorCanVote",
  JurorCanCommit = "jurorCanCommit",
  JurorCanReveal = "jurorCanReveal",
  JurorDraw = "jurorDraw",
  StakeNew = "stakeNew",
  StakeUnstaked = "stakeUnstaked",
  StakeChanged = "stakeChanged",
  CaseWon = "caseWon",
  CaseLost = "caseLost",
}

export enum PohV2NotificationTopic {
  VouchingPhase = "vouchingPhase",
  PendingRequest = "pendingRequest",
  ResolvedRequest = "resolvedRequest",
  VouchAdded = "vouchAdded",
  VouchAddedVoucher = "vouchAddedVoucher",
  PendingRevoke = "pendingRevoke",
  ResolvedRevoke = "resolvedRevoke",
  DisputedSubmission = "disputedSubmission",
  DisputedRevoke = "disputedRevoke",
  ChallengeAccepted = "challengeAccepted",
  ChallengeRejected = "challengeRejected",
  DisputeRuledTie = "disputeRuledTie",
  Rewards = "rewards",
}

export enum ForesightNotificationTopic {
  MarketResolved = "marketResolved",
}

export const NotificationTopic = {
  ...CourtNotificationTopic,
  ...PohV2NotificationTopic,
  ...ForesightNotificationTopic,
};
export type NotificationTopic = CourtNotificationTopic | PohV2NotificationTopic | ForesightNotificationTopic;

export type ProductTopics = {
  [SignupProduct.CourtV1]: CourtNotificationTopic;
  [SignupProduct.CourtV2]: CourtNotificationTopic;
  [SignupProduct.PohV2]: PohV2NotificationTopic;
  [SignupProduct.Foresight]: ForesightNotificationTopic;
};
export type TopicOf<P extends SignupProduct> = ProductTopics[P];

const COURT_TOPIC_DEFAULTS: Record<CourtNotificationTopic, boolean> = {
  [CourtNotificationTopic.DisputeAppealable]: true,
  [CourtNotificationTopic.DisputeAppealed]: true,
  [CourtNotificationTopic.JurorCanVote]: true,
  [CourtNotificationTopic.JurorCanCommit]: true,
  [CourtNotificationTopic.JurorCanReveal]: true,
  [CourtNotificationTopic.JurorDraw]: true,
  [CourtNotificationTopic.StakeNew]: true,
  [CourtNotificationTopic.StakeUnstaked]: true,
  [CourtNotificationTopic.StakeChanged]: true,
  [CourtNotificationTopic.CaseWon]: true,
  [CourtNotificationTopic.CaseLost]: true,
};

export const PRODUCT_TOPIC_DEFAULTS: { [P in SignupProduct]: Record<TopicOf<P>, boolean> } = {
  [SignupProduct.CourtV1]: COURT_TOPIC_DEFAULTS,
  [SignupProduct.CourtV2]: COURT_TOPIC_DEFAULTS,
  [SignupProduct.PohV2]: {
    [PohV2NotificationTopic.VouchingPhase]: true,
    [PohV2NotificationTopic.PendingRequest]: true,
    [PohV2NotificationTopic.ResolvedRequest]: true,
    [PohV2NotificationTopic.VouchAdded]: true,
    [PohV2NotificationTopic.VouchAddedVoucher]: true,
    [PohV2NotificationTopic.PendingRevoke]: true,
    [PohV2NotificationTopic.ResolvedRevoke]: true,
    [PohV2NotificationTopic.DisputedSubmission]: true,
    [PohV2NotificationTopic.DisputedRevoke]: true,
    [PohV2NotificationTopic.ChallengeAccepted]: true,
    [PohV2NotificationTopic.ChallengeRejected]: true,
    [PohV2NotificationTopic.DisputeRuledTie]: true,
    [PohV2NotificationTopic.Rewards]: false,
  },
  [SignupProduct.Foresight]: {
    [ForesightNotificationTopic.MarketResolved]: true,
  },
};
