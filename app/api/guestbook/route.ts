import {
  assertOnlyKeys,
  json,
  parseLimit,
  readJsonObject,
  requiredInteger,
  requiredString,
  routeError,
  strictSearchParams,
} from "@/lib/server/api";
import { persistApiUser, requireApiUser } from "@/lib/server/auth";
import type {
  CreateGuestbookResponse,
  ListGuestbookResponse,
} from "@/lib/server/contracts";
import {
  createGuestbookEntry,
  listGuestbook,
} from "@/lib/server/data";

export async function GET(request: Request): Promise<Response> {
  try {
    const params = strictSearchParams(request, ["limit"]);
    const entries = await listGuestbook(parseLimit(params.get("limit")));
    return json<ListGuestbookResponse>({ entries });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    await persistApiUser(user);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["message", "rating"]);
    const message = requiredString(body.message, "message", { max: 500 });
    const rating = requiredInteger(body.rating, "rating", 1, 5);
    const entry = await createGuestbookEntry(user, message, rating);
    return json<CreateGuestbookResponse>({ entry }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
