import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { ApiProblem } from "./api";
import { ensureSchema } from "./schema";
import type { UserProfile } from "./contracts";

export async function optionalApiUser(): Promise<ChatGPTUser | null> {
  return getChatGPTUser();
}

export async function requireApiUser(): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (!user) {
    throw new ApiProblem(
      401,
      "AUTH_REQUIRED",
      "Sign in with ChatGPT before writing cloud data.",
    );
  }
  return user;
}

export async function persistApiUser(user: ChatGPTUser): Promise<UserProfile> {
  await ensureSchema();
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO users (id, display_name, email, full_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         email = excluded.email,
         full_name = excluded.full_name,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(user.userId, user.displayName, user.email, user.fullName)
    .run();

  return {
    id: user.userId,
    displayName: user.displayName,
    email: user.email,
    fullName: user.fullName,
  };
}
