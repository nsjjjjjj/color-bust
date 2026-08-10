import {
  assertOnlyKeys,
  enumValue,
  json,
  readJsonObject,
  requiredInteger,
  requiredRecord,
  requiredString,
  routeError,
} from "@/lib/server/api";
import { persistApiUser, requireApiUser } from "@/lib/server/auth";
import type {
  GameMode,
  GetRunResponse,
  RunStatus,
  UpsertRunRequest,
  UpsertRunResponse,
} from "@/lib/server/contracts";
import { getRun, upsertRun } from "@/lib/server/data";

const MODES = ["standard", "endless"] as const;
const STATUSES = ["active", "won", "lost", "abandoned"] as const;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

type RouteContext = { params: Promise<{ mode: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const mode = await routeMode(context);
    const user = await requireApiUser();
    await persistApiUser(user);
    return json<GetRunResponse>({ run: await getRun(user.userId, mode) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const mode = await routeMode(context);
    const user = await requireApiUser();
    await persistApiUser(user);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, [
      "expectedRevision",
      "operationId",
      "snapshot",
      "score",
      "ante",
      "status",
      "rulesetVersion",
    ]);
    const input: UpsertRunRequest = {
      expectedRevision: requiredInteger(
        body.expectedRevision,
        "expectedRevision",
        0,
        2_147_483_646,
      ),
      operationId: requiredString(body.operationId, "operationId", {
        min: 8,
        max: 128,
        pattern: OPERATION_ID_PATTERN,
      }),
      snapshot: requiredRecord(body.snapshot, "snapshot"),
      score: requiredInteger(body.score, "score", 0, Number.MAX_SAFE_INTEGER),
      ante: requiredInteger(
        body.ante,
        "ante",
        1,
        mode === "standard" ? 5 : 1_000_000,
      ),
      status: enumValue(body.status, "status", STATUSES) as RunStatus,
      rulesetVersion: requiredInteger(
        body.rulesetVersion,
        "rulesetVersion",
        1,
        1_000_000,
      ),
    };
    const result = await upsertRun(user.userId, mode, input);
    return json<UpsertRunResponse>(result, {
      status: result.duplicate ? 200 : 201,
    });
  } catch (error) {
    return routeError(error);
  }
}

async function routeMode(context: RouteContext): Promise<GameMode> {
  const { mode } = await context.params;
  return enumValue(mode, "mode", MODES);
}
