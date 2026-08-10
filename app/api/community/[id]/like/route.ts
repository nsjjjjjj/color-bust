import {
  assertOnlyKeys,
  json,
  readJsonObject,
  requiredBoolean,
  requiredString,
  routeError,
} from "@/lib/server/api";
import { persistApiUser, requireApiUser } from "@/lib/server/auth";
import type { LikeCommunityCardResponse } from "@/lib/server/contracts";
import { setCommunityCardLike } from "@/lib/server/data";

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
    assertOnlyKeys(body, ["liked"]);
    const liked = requiredBoolean(body.liked, "liked");
    const result = await setCommunityCardLike(cardId, user.userId, liked);
    return json<LikeCommunityCardResponse>({
      cardId,
      liked,
      likeCount: result.likeCount,
    });
  } catch (error) {
    return routeError(error);
  }
}
