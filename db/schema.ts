import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const runs = sqliteTable(
  "runs",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    revision: integer("revision").notNull(),
    operationId: text("operation_id").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    score: integer("score").notNull(),
    ante: integer("ante").notNull(),
    status: text("status").notNull(),
    rulesetVersion: integer("ruleset_version").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mode] }),
    check("runs_mode_check", sql`${table.mode} IN ('standard', 'endless')`),
    check(
      "runs_status_check",
      sql`${table.status} IN ('active', 'won', 'lost', 'abandoned')`,
    ),
    check("runs_revision_check", sql`${table.revision} >= 1`),
    check("runs_score_check", sql`${table.score} >= 0`),
    check("runs_ante_check", sql`${table.ante} >= 1`),
  ],
);

export const runOperations = sqliteTable(
  "run_operations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operationId: text("operation_id").notNull(),
    mode: text("mode").notNull(),
    appliedRevision: integer("applied_revision").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.operationId] }),
    check(
      "run_operations_mode_check",
      sql`${table.mode} IN ('standard', 'endless')`,
    ),
  ],
);

export const communityUnoCards = sqliteTable(
  "community_uno_cards",
  {
    id: text("id").primaryKey(),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorName: text("creator_name").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    modulesJson: text("modules_json").notNull(),
    pointTotal: integer("point_total").notNull(),
    version: integer("version").notNull().default(1),
    likeCount: integer("like_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("community_uno_cards_created_idx").on(
      table.createdAt,
      table.id,
    ),
    check("community_uno_cards_points_check", sql`${table.pointTotal} = 0`),
    check("community_uno_cards_likes_check", sql`${table.likeCount} >= 0`),
    check(
      "community_uno_cards_ratings_check",
      sql`${table.ratingSum} >= 0 AND ${table.ratingCount} >= 0`,
    ),
  ],
);

export const communityCardLikes = sqliteTable(
  "community_card_likes",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => communityUnoCards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.cardId, table.userId] })],
);

export const communityCardRatings = sqliteTable(
  "community_card_ratings",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => communityUnoCards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.userId] }),
    check(
      "community_card_ratings_value_check",
      sql`${table.rating} BETWEEN 1 AND 5`,
    ),
  ],
);

export const guestbookEntries = sqliteTable(
  "guestbook_entries",
  {
    id: text("id").primaryKey(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    message: text("message").notNull(),
    rating: integer("rating").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("guestbook_entries_created_idx").on(table.createdAt, table.id),
    check(
      "guestbook_entries_rating_check",
      sql`${table.rating} BETWEEN 1 AND 5`,
    ),
  ],
);

export const leaderboardEntries = sqliteTable(
  "leaderboard_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    displayName: text("display_name").notNull(),
    score: integer("score").notNull(),
    ante: integer("ante").notNull(),
    runRevision: integer("run_revision").notNull(),
    rulesetVersion: integer("ruleset_version").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mode] }),
    index("leaderboard_standard_idx").on(
      table.mode,
      table.score,
      table.updatedAt,
    ),
    index("leaderboard_endless_idx").on(
      table.mode,
      table.ante,
      table.score,
    ),
    check(
      "leaderboard_entries_mode_check",
      sql`${table.mode} IN ('standard', 'endless')`,
    ),
    check("leaderboard_entries_score_check", sql`${table.score} >= 0`),
    check("leaderboard_entries_ante_check", sql`${table.ante} >= 1`),
  ],
);
