import { optionalApiUser, persistApiUser } from "@/lib/server/auth";
import { json, routeError } from "@/lib/server/api";
import type { MeResponse } from "@/lib/server/contracts";
import { ensureSchema } from "@/lib/server/schema";

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const authenticatedUser = await optionalApiUser();
    const user = authenticatedUser
      ? await persistApiUser(authenticatedUser)
      : null;
    return json<MeResponse>({ user });
  } catch (error) {
    return routeError(error);
  }
}
