import { getD1 } from "@/db";
import type { AppUser } from "./auth";
import { ApiProblem } from "./api";
import type {
  CloudRun,
  CommunityUnoCard,
  GameMode,
  GuestbookEntry,
  JsonValue,
  LeaderboardEntry,
  RunStatus,
  UpsertRunRequest,
} from "./contracts";
import { ensureSchema } from "./schema";

type RunRow = {
  mode: GameMode;
  revision: number;
  operation_id: string;
  snapshot_json: string;
  score: number;
  ante: number;
  status: RunStatus;
  ruleset_version: number;
  created_at: string;
  updated_at: string;
};

type OperationRow = {
  mode: GameMode;
  applied_revision: number;
};

type CommunityCardRow = {
  id: string;
  creator_user_id: string;
  creator_name: string;
  name: string;
  description: string;
  modules_json: string;
  point_total: number;
  version: number;
  like_count: number;
  rating_sum: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
};

type GuestbookRow = {
  id: string;
  author_user_id: string;
  author_name: string;
  message: string;
  rating: number;
  created_at: string;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  mode: GameMode;
  score: number;
  ante: number;
  run_revision: number;
  ruleset_version: number;
  updated_at: string;
};

const RUN_COLUMNS = `mode, revision, operation_id, snapshot_json, score, ante,
  status, ruleset_version, created_at, updated_at`;
const COMMUNITY_CARD_COLUMNS = `id, creator_user_id, creator_name, name,
  description, modules_json, point_total, version, like_count, rating_sum,
  rating_count, created_at, updated_at`;
const LEADERBOARD_COLUMNS = `user_id, display_name, mode, score, ante,
  run_revision, ruleset_version, updated_at`;

export async function getRun(
  userId: string,
  mode: GameMode,
): Promise<CloudRun | null> {
  await ensureSchema();
  const row = await getD1()
    .prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE user_id = ? AND mode = ?`)
    .bind(userId, mode)
    .first<RunRow>();
  return row ? mapRun(row) : null;
}

export async function upsertRun(
  userId: string,
  mode: GameMode,
  input: UpsertRunRequest,
): Promise<{ run: CloudRun; duplicate: boolean }> {
  await ensureSchema();
  const db = getD1();
  const priorOperation = await findOperation(userId, input.operationId);
  if (priorOperation) {
    if (priorOperation.mode !== mode) {
      throw operationReuseProblem(priorOperation);
    }
    const run = await getRun(userId, mode);
    if (!run) throw new Error("Applied run operation has no run row.");
    return { run, duplicate: true };
  }

  const current = await getRun(userId, mode);
  if ((current?.revision ?? 0) !== input.expectedRevision) {
    throw revisionProblem(mode, current?.revision ?? 0);
  }

  const nextRevision = input.expectedRevision + 1;
  const writeRun = db
    .prepare(
      `INSERT INTO runs (
         user_id, mode, revision, operation_id, snapshot_json, score, ante,
         status, ruleset_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, mode) DO UPDATE SET
         revision = excluded.revision,
         operation_id = excluded.operation_id,
         snapshot_json = excluded.snapshot_json,
         score = excluded.score,
         ante = excluded.ante,
         status = excluded.status,
         ruleset_version = excluded.ruleset_version,
         updated_at = CURRENT_TIMESTAMP
       WHERE runs.revision = ?`,
    )
    .bind(
      userId,
      mode,
      nextRevision,
      input.operationId,
      JSON.stringify(input.snapshot),
      input.score,
      input.ante,
      input.status,
      input.rulesetVersion,
      input.expectedRevision,
    );
  const recordOperation = db
    .prepare(
      `INSERT INTO run_operations (
         user_id, operation_id, mode, applied_revision
       )
       SELECT ?, ?, ?, ? WHERE changes() = 1`,
    )
    .bind(userId, input.operationId, mode, nextRevision);

  let writeChanges = 0;
  try {
    const results = await db.batch([writeRun, recordOperation]);
    writeChanges = resultChanges(results[0]);
  } catch (error) {
    const racedOperation = await findOperation(userId, input.operationId);
    if (racedOperation) {
      if (racedOperation.mode !== mode) throw operationReuseProblem(racedOperation);
      const run = await getRun(userId, mode);
      if (!run) throw error;
      return { run, duplicate: true };
    }
    throw error;
  }

  if (writeChanges !== 1) {
    const racedOperation = await findOperation(userId, input.operationId);
    if (racedOperation) {
      if (racedOperation.mode !== mode) throw operationReuseProblem(racedOperation);
      const run = await getRun(userId, mode);
      if (!run) throw new Error("Applied run operation has no run row.");
      return { run, duplicate: true };
    }
    const latest = await getRun(userId, mode);
    throw revisionProblem(mode, latest?.revision ?? 0);
  }

  const saved = await getRun(userId, mode);
  if (!saved) throw new Error("Run write succeeded without a readable row.");
  return { run: saved, duplicate: false };
}

export async function listCommunityCards(
  limit: number,
): Promise<CommunityUnoCard[]> {
  await ensureSchema();
  const result = await getD1()
    .prepare(
      `SELECT ${COMMUNITY_CARD_COLUMNS}
       FROM community_uno_cards
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<CommunityCardRow>();
  return result.results.map(mapCommunityCard);
}

export async function createCommunityCard(
  user: AppUser,
  input: {
    name: string;
    description: string;
    moduleIds: string[];
    pointTotal: 0;
  },
): Promise<CommunityUnoCard> {
  await ensureSchema();
  const id = crypto.randomUUID();
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO community_uno_cards (
         id, creator_user_id, creator_name, name, description, modules_json,
         point_total
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.userId,
      user.displayName,
      input.name,
      input.description,
      JSON.stringify(input.moduleIds),
      input.pointTotal,
    )
    .run();
  const card = await getCommunityCard(id);
  if (!card) throw new Error("Community card insert returned no row.");
  return card;
}

export async function setCommunityCardLike(
  cardId: string,
  userId: string,
  liked: boolean,
): Promise<{ likeCount: number }> {
  await ensureSchema();
  const db = getD1();
  await requireCommunityCard(cardId);

  if (liked) {
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO community_card_likes (card_id, user_id)
           VALUES (?, ?)`,
        )
        .bind(cardId, userId),
      db
        .prepare(
          `UPDATE community_uno_cards
           SET like_count = like_count + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND changes() = 1`,
        )
        .bind(cardId),
    ]);
  } else {
    await db.batch([
      db
        .prepare(
          `DELETE FROM community_card_likes
           WHERE card_id = ? AND user_id = ?`,
        )
        .bind(cardId, userId),
      db
        .prepare(
          `UPDATE community_uno_cards
           SET like_count = MAX(0, like_count - 1), updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND changes() = 1`,
        )
        .bind(cardId),
    ]);
  }

  const row = await db
    .prepare(`SELECT like_count FROM community_uno_cards WHERE id = ?`)
    .bind(cardId)
    .first<{ like_count: number }>();
  if (!row) throw notFound("Community UNO card");
  return { likeCount: row.like_count };
}

export async function rateCommunityCard(
  cardId: string,
  userId: string,
  rating: number,
): Promise<{ ratingAverage: number; ratingCount: number }> {
  await ensureSchema();
  const db = getD1();
  await requireCommunityCard(cardId);
  await db.batch([
    db
      .prepare(
        `INSERT INTO community_card_ratings (card_id, user_id, rating)
         VALUES (?, ?, ?)
         ON CONFLICT(card_id, user_id) DO UPDATE SET
           rating = excluded.rating,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(cardId, userId, rating),
    db
      .prepare(
        `UPDATE community_uno_cards
         SET rating_sum = (
           SELECT COALESCE(SUM(rating), 0)
           FROM community_card_ratings
           WHERE card_id = ?
         ), rating_count = (
           SELECT COUNT(*)
           FROM community_card_ratings
           WHERE card_id = ?
         ), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(cardId, cardId, cardId),
  ]);
  const row = await db
    .prepare(
      `SELECT rating_sum, rating_count
       FROM community_uno_cards WHERE id = ?`,
    )
    .bind(cardId)
    .first<{ rating_sum: number; rating_count: number }>();
  if (!row) throw notFound("Community UNO card");
  return {
    ratingAverage: row.rating_count > 0 ? row.rating_sum / row.rating_count : 0,
    ratingCount: row.rating_count,
  };
}

export async function listGuestbook(limit: number): Promise<GuestbookEntry[]> {
  await ensureSchema();
  const result = await getD1()
    .prepare(
      `SELECT id, author_user_id, author_name, message, rating, created_at
       FROM guestbook_entries
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<GuestbookRow>();
  return result.results.map(mapGuestbook);
}

export async function createGuestbookEntry(
  user: AppUser,
  message: string,
  rating: number,
): Promise<GuestbookEntry> {
  await ensureSchema();
  const id = crypto.randomUUID();
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO guestbook_entries (
         id, author_user_id, author_name, message, rating
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, user.userId, user.displayName, message, rating)
    .run();
  const row = await db
    .prepare(
      `SELECT id, author_user_id, author_name, message, rating, created_at
       FROM guestbook_entries WHERE id = ?`,
    )
    .bind(id)
    .first<GuestbookRow>();
  if (!row) throw new Error("Guestbook insert returned no row.");
  return mapGuestbook(row);
}

export async function listLeaderboard(
  mode: GameMode,
  limit: number,
): Promise<LeaderboardEntry[]> {
  await ensureSchema();
  const db = getD1();
  const statement =
    mode === "standard"
      ? `SELECT ${LEADERBOARD_COLUMNS}
         FROM leaderboard_entries WHERE mode = ?
         ORDER BY score DESC, updated_at ASC, user_id ASC LIMIT ?`
      : `SELECT ${LEADERBOARD_COLUMNS}
         FROM leaderboard_entries WHERE mode = ?
         ORDER BY ante DESC, score DESC, updated_at ASC, user_id ASC LIMIT ?`;
  const result = await db
    .prepare(statement)
    .bind(mode, limit)
    .all<LeaderboardRow>();
  return result.results.map((row: LeaderboardRow, index: number) =>
    mapLeaderboard(row, index + 1),
  );
}

export async function submitLeaderboard(
  user: AppUser,
  input: {
    mode: GameMode;
    score: number;
    ante: number;
    runRevision: number;
  },
): Promise<{ entry: LeaderboardEntry; improved: boolean }> {
  await ensureSchema();
  const db = getD1();
  const run = await getRun(user.userId, input.mode);
  if (
    !run ||
    run.revision !== input.runRevision ||
    run.score !== input.score ||
    run.ante !== input.ante
  ) {
    throw new ApiProblem(
      409,
      "RUN_MISMATCH",
      "Leaderboard submission must match the saved cloud run exactly.",
      {
        mode: input.mode,
        savedRevision: run?.revision ?? 0,
        savedScore: run?.score ?? 0,
        savedAnte: run?.ante ?? 0,
      },
    );
  }

  const writeResult = await db
    .prepare(
      `INSERT INTO leaderboard_entries (
         user_id, mode, display_name, score, ante, run_revision,
         ruleset_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, mode) DO UPDATE SET
         display_name = excluded.display_name,
         score = excluded.score,
         ante = excluded.ante,
         run_revision = excluded.run_revision,
         ruleset_version = excluded.ruleset_version,
         updated_at = CURRENT_TIMESTAMP
       WHERE
         (excluded.mode = 'standard' AND
          excluded.score > leaderboard_entries.score)
         OR
         (excluded.mode = 'endless' AND (
           excluded.ante > leaderboard_entries.ante OR
           (excluded.ante = leaderboard_entries.ante AND
            excluded.score > leaderboard_entries.score)
         ))`,
    )
    .bind(
      user.userId,
      input.mode,
      user.displayName,
      input.score,
      input.ante,
      input.runRevision,
      run.rulesetVersion,
    )
    .run();
  const improved = resultChanges(writeResult) === 1;

  const saved = await db
    .prepare(
      `SELECT ${LEADERBOARD_COLUMNS}
       FROM leaderboard_entries WHERE user_id = ? AND mode = ?`,
    )
    .bind(user.userId, input.mode)
    .first<LeaderboardRow>();
  if (!saved) throw new Error("Leaderboard upsert returned no row.");
  const rank = await leaderboardRank(saved);
  return { entry: mapLeaderboard(saved, rank), improved };
}

async function getCommunityCard(id: string): Promise<CommunityUnoCard | null> {
  const row = await getD1()
    .prepare(
      `SELECT ${COMMUNITY_CARD_COLUMNS}
       FROM community_uno_cards WHERE id = ?`,
    )
    .bind(id)
    .first<CommunityCardRow>();
  return row ? mapCommunityCard(row) : null;
}

async function requireCommunityCard(id: string): Promise<void> {
  const row = await getD1()
    .prepare(`SELECT id FROM community_uno_cards WHERE id = ?`)
    .bind(id)
    .first<{ id: string }>();
  if (!row) throw notFound("Community UNO card");
}

async function findOperation(
  userId: string,
  operationId: string,
): Promise<OperationRow | null> {
  return getD1()
    .prepare(
      `SELECT mode, applied_revision
       FROM run_operations WHERE user_id = ? AND operation_id = ?`,
    )
    .bind(userId, operationId)
    .first<OperationRow>();
}

async function leaderboardRank(row: LeaderboardRow): Promise<number> {
  const db = getD1();
  const query =
    row.mode === "standard"
      ? `SELECT COUNT(*) AS ahead FROM leaderboard_entries
         WHERE mode = ? AND (
           score > ? OR
           (score = ? AND updated_at < ?) OR
           (score = ? AND updated_at = ? AND user_id < ?)
         )`
      : `SELECT COUNT(*) AS ahead FROM leaderboard_entries
         WHERE mode = ? AND (
           ante > ? OR
           (ante = ? AND score > ?) OR
           (ante = ? AND score = ? AND updated_at < ?) OR
           (ante = ? AND score = ? AND updated_at = ? AND user_id < ?)
         )`;
  const bindings =
    row.mode === "standard"
      ? [
          row.mode,
          row.score,
          row.score,
          row.updated_at,
          row.score,
          row.updated_at,
          row.user_id,
        ]
      : [
          row.mode,
          row.ante,
          row.ante,
          row.score,
          row.ante,
          row.score,
          row.updated_at,
          row.ante,
          row.score,
          row.updated_at,
          row.user_id,
        ];
  const result = await db
    .prepare(query)
    .bind(...bindings)
    .first<{ ahead: number }>();
  return (result?.ahead ?? 0) + 1;
}

function mapRun(row: RunRow): CloudRun {
  const snapshot = JSON.parse(row.snapshot_json) as Record<string, JsonValue>;
  return {
    mode: row.mode,
    revision: row.revision,
    operationId: row.operation_id,
    snapshot,
    score: row.score,
    ante: row.ante,
    status: row.status,
    rulesetVersion: row.ruleset_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCommunityCard(row: CommunityCardRow): CommunityUnoCard {
  return {
    id: row.id,
    creatorUserId: row.creator_user_id,
    creatorName: row.creator_name,
    name: row.name,
    description: row.description,
    moduleIds: JSON.parse(row.modules_json) as string[],
    pointTotal: 0,
    version: row.version,
    likeCount: row.like_count,
    ratingAverage:
      row.rating_count > 0 ? row.rating_sum / row.rating_count : null,
    ratingCount: row.rating_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGuestbook(row: GuestbookRow): GuestbookEntry {
  return {
    id: row.id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    message: row.message,
    rating: row.rating,
    createdAt: row.created_at,
  };
}

function mapLeaderboard(row: LeaderboardRow, rank: number): LeaderboardEntry {
  return {
    rank,
    userId: row.user_id,
    displayName: row.display_name,
    mode: row.mode,
    score: row.score,
    ante: row.ante,
    runRevision: row.run_revision,
    rulesetVersion: row.ruleset_version,
    updatedAt: row.updated_at,
  };
}

function resultChanges(result: unknown): number {
  if (
    typeof result === "object" &&
    result !== null &&
    "meta" in result &&
    typeof result.meta === "object" &&
    result.meta !== null &&
    "changes" in result.meta &&
    typeof result.meta.changes === "number"
  ) {
    return result.meta.changes;
  }
  return 0;
}

function revisionProblem(mode: GameMode, currentRevision: number): ApiProblem {
  return new ApiProblem(
    409,
    "REVISION_CONFLICT",
    "The cloud run changed on another request or device.",
    { mode, currentRevision },
  );
}

function operationReuseProblem(operation: OperationRow): ApiProblem {
  return new ApiProblem(
    409,
    "OPERATION_ID_REUSED",
    "operationId was already used for a different run mode.",
    {
      previousMode: operation.mode,
      appliedRevision: operation.applied_revision,
    },
  );
}

function notFound(resource: string): ApiProblem {
  return new ApiProblem(404, "NOT_FOUND", `${resource} was not found.`);
}
