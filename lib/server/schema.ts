import { getD1 } from "@/db";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('standard', 'endless')),
    revision INTEGER NOT NULL CHECK (revision >= 1),
    operation_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    ante INTEGER NOT NULL CHECK (ante >= 1),
    status TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost', 'abandoned')),
    ruleset_version INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, mode)
  )`,
  `CREATE TABLE IF NOT EXISTS run_operations (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('standard', 'endless')),
    applied_revision INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, operation_id)
  )`,
  `CREATE TABLE IF NOT EXISTS community_uno_cards (
    id TEXT PRIMARY KEY NOT NULL,
    creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    modules_json TEXT NOT NULL,
    point_total INTEGER NOT NULL CHECK (point_total = 0),
    version INTEGER NOT NULL DEFAULT 1,
    like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
    rating_sum INTEGER NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
    rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS community_uno_cards_created_idx
   ON community_uno_cards (created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS community_card_likes (
    card_id TEXT NOT NULL REFERENCES community_uno_cards(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS community_card_ratings (
    card_id TEXT NOT NULL REFERENCES community_uno_cards(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS guestbook_entries (
    id TEXT PRIMARY KEY NOT NULL,
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    message TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS guestbook_entries_created_idx
   ON guestbook_entries (created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS leaderboard_entries (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('standard', 'endless')),
    display_name TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    ante INTEGER NOT NULL CHECK (ante >= 1),
    run_revision INTEGER NOT NULL,
    ruleset_version INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, mode)
  )`,
  `CREATE INDEX IF NOT EXISTS leaderboard_standard_idx
   ON leaderboard_entries (mode, score DESC, updated_at ASC)`,
  `CREATE INDEX IF NOT EXISTS leaderboard_endless_idx
   ON leaderboard_entries (mode, ante DESC, score DESC, updated_at ASC)`,
] as const;

let schemaPromise: Promise<void> | null = null;

/** Makes a fresh local D1 usable even before the deployment migrator runs. */
export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    const db = getD1();
    schemaPromise = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await db.prepare(statement).run();
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
