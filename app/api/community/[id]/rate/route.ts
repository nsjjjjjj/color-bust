import {
  assertOnlyKeys,
  json,
  readJsonObject,
  requiredInteger,
  requiredString,
  routeError,
} from "@/lib/server/api";
import { persistApiUser, requireApiUser } from "@/lib/server/auth";
import type { RateCommunityCardResponse } from "@/lib/server/contracts";
import { rateCommunityCard } from "@/lib/server/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    await persistApiUser(user);
    const { id: rawId } = await context.params;
    const cardId = requiredString(rawId, "id", { max: 128 });
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["rating"]);
    const rating = requiredInteger(body.rating, "rating", 1, 5);
    const result = await rateCommunityCard(cardId, user.userId, rating);
    return json<RateCommunityCardResponse>({ cardId, rating, ...result });
  } catch (error) {
    return routeError(error);
  }
}
