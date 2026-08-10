/** Shared JSON contracts for the DECK MAYHEM HTTP API. */

export type GameMode = "standard" | "endless";
export type RunStatus = "active" | "won" | "lost" | "abandoned";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "BAD_JSON"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "REVISION_CONFLICT"
  | "OPERATION_ID_REUSED"
  | "RUN_MISMATCH"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, JsonValue>;
  };
};

export type UserProfile = {
  id: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export type MeResponse = { user: UserProfile | null };

export type CloudRun = {
  mode: GameMode;
  revision: number;
  operationId: string;
  snapshot: Record<string, JsonValue>;
  score: number;
  ante: number;
  status: RunStatus;
  rulesetVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type GetRunResponse = { run: CloudRun | null };

export type UpsertRunRequest = {
  expectedRevision: number;
  operationId: string;
  snapshot: Record<string, JsonValue>;
  score: number;
  ante: number;
  status: RunStatus;
  rulesetVersion: number;
};

export type UpsertRunResponse = {
  run: CloudRun;
  duplicate: boolean;
};

export type UnoModuleKind = "benefit" | "drawback";

export type UnoModuleDefinition = {
  id: string;
  kind: UnoModuleKind;
  points: number;
  label: string;
  description: string;
};

export type CommunityUnoCard = {
  id: string;
  creatorUserId: string;
  creatorName: string;
  name: string;
  description: string;
  moduleIds: string[];
  pointTotal: 0;
  version: number;
  likeCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListCommunityCardsResponse = {
  cards: CommunityUnoCard[];
  moduleCatalog: UnoModuleDefinition[];
};

export type CreateCommunityCardRequest = {
  name: string;
  description: string;
  moduleIds: string[];
};

export type CreateCommunityCardResponse = { card: CommunityUnoCard };
export type LikeCommunityCardRequest = { liked: boolean };
export type LikeCommunityCardResponse = {
  cardId: string;
  liked: boolean;
  likeCount: number;
};
export type RateCommunityCardRequest = { rating: number };
export type RateCommunityCardResponse = {
  cardId: string;
  rating: number;
  ratingAverage: number;
  ratingCount: number;
};

export type GuestbookEntry = {
  id: string;
  authorUserId: string;
  authorName: string;
  message: string;
  rating: number;
  createdAt: string;
};

export type ListGuestbookResponse = { entries: GuestbookEntry[] };
export type CreateGuestbookRequest = { message: string; rating: number };
export type CreateGuestbookResponse = { entry: GuestbookEntry };

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  mode: GameMode;
  score: number;
  ante: number;
  runRevision: number;
  rulesetVersion: number;
  updatedAt: string;
};

export type ListLeaderboardResponse = {
  mode: GameMode;
  entries: LeaderboardEntry[];
};

/** Score and ante must exactly match the referenced cloud run. */
export type SubmitLeaderboardRequest = {
  mode: GameMode;
  score: number;
  ante: number;
  runRevision: number;
};

export type SubmitLeaderboardResponse = {
  entry: LeaderboardEntry;
  improved: boolean;
};
