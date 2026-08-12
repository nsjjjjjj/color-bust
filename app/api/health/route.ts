import { getD1 } from "@/db";
import { json, routeError } from "@/lib/server/api";
import { ensureSchema } from "@/lib/server/schema";

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const row = await getD1().prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ status: row?.ok === 1 ? "ok" : "degraded" });
  } catch (error) {
    return routeError(error);
  }
}
