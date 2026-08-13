import {
  assertOnlyKeys,
  json,
  parseLimit,
  readJsonObject,
  requiredString,
  requiredStringArray,
  routeError,
  strictSearchParams,
} from "@/lib/server/api";
import { persistApiUser, requireApiUser } from "@/lib/server/auth";
import type {
  CreateCommunityCardResponse,
  ListCommunityCardsResponse,
} from "@/lib/server/contracts";
import {
  createCommunityCard,
  listCommunityCards,
} from "@/lib/server/data";
import { UNO_MODULE_CATALOG, validateUnoModuleIds } from "@/lib/server/uno-modules";

export async function GET(request: Request): Promise<Response> {
  try {
    const params = strictSearchParams(request, ["limit"]);
    const cards = await listCommunityCards(parseLimit(params.get("limit")));
    return json<ListCommunityCardsResponse>({
      cards,
      moduleCatalog: UNO_MODULE_CATALOG.map((module) => ({ ...module })),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    await persistApiUser(user);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["name", "description", "moduleIds"]);
    const name = requiredString(body.name, "name", { max: 40 });
    const description = requiredString(body.description, "description", {
      min: 0,
      max: 240,
    });
    const moduleIds = requiredStringArray(body.moduleIds, "moduleIds", 2, 4);
    const validatedModules = validateUnoModuleIds(moduleIds);
    const card = await createCommunityCard(user, {
      name,
      description,
      ...validatedModules,
    });
    return json<CreateCommunityCardResponse>({ card }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
