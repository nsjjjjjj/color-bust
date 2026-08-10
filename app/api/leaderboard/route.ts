import {
  assertOnlyKeys,
  enumValue,
  json,
  parseLimit,
  readJsonObject,
  requiredInteger,
  routeError,
  strictSearchParams,
} from "@/lib/server/api";
import { persistApiUser, requireApiUser } from "@/lib/server/auth";
import type {
  GameMode,
  ListLeaderboardResponse,
  SubmitLeaderboardResponse,
} from "@/lib/server/contracts";
import {
  listLeaderboard,
  submitLeaderboard,
} from "@/lib/server/data";

const MODES = ["standard", "endless"] as const;

export async function GET(request: Request): Promise<Response> {
  try {
    const params = strictSearchParams(request, ["mode", "limit"]);
    const mode = enumValue(
      params.get("mode") ?? "standard",
      "mode",
      MODES,
    ) as GameMode;
    const entries = await listLeaderboard(
      mode,
      parseLimit(params.get("limit")),
    );
    return json<ListLeaderboardResponse>({ mode, entries });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    await persistApiUser(user);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["mode", "score", "ante", "runRevision"]);
    const mode = enumValue(body.mode, "mode", MODES) as GameMode;
    const result = await submitLeaderboard(user, {
      mode,
      score: requiredInteger(body.score, "score", 0, Number.MAX_SAFE_INTEGER),
      ante: requiredInteger(
        body.ante,
        "ante",
        1,
        mode === "standard" ? 5 : 1_000_000,
      ),
      runRevision: requiredInteger(
        body.runRevision,
        "runRevision",
        1,
        2_147_483_647,
      ),
    });
    return json<SubmitLeaderboardResponse>(result, {
      status: result.improved ? 201 : 200,
    });
  } catch (error) {
    return routeError(error);
  }
}
