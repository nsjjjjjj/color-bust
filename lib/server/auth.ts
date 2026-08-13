import "server-only";

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getD1 } from "@/db";
import { ApiProblem } from "./api";
import { ensureSchema } from "./schema";
import type { UserProfile } from "./contracts";

export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

type UserRow = {
  id: string;
  display_name: string;
  email: string;
  full_name: string | null;
  password_hash: string | null;
  password_salt: string | null;
};

const SESSION_COOKIE = "deck_mayhem_session";
const SESSION_DAYS = 30;

export async function optionalApiUser(): Promise<AppUser | null> {
  return getCurrentUser();
}

export async function requireApiUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiProblem(401, "AUTH_REQUIRED", "로그인 후 온라인 데이터를 저장할 수 있습니다.");
  }
  return user;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  await ensureSchema();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const now = new Date().toISOString();
  const row = await getD1()
    .prepare(
      `SELECT users.id, users.display_name, users.email, users.full_name,
              users.password_hash, users.password_salt
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(hashToken(token), now)
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function registerUser(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AppUser> {
  await ensureSchema();
  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);
  assertCredentials(displayName, email, input.password);

  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);
  const user: AppUser = {
    userId: randomUUID(),
    displayName,
    email,
    fullName: displayName,
  };
  try {
    await getD1()
      .prepare(
        `INSERT INTO users (
           id, display_name, email, full_name, password_hash, password_salt
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(user.userId, displayName, email, displayName, passwordHash, salt)
      .run();
  } catch (error) {
    if (error instanceof Error && /unique constraint failed: users\.email/i.test(error.message)) {
      throw new ApiProblem(409, "INVALID_INPUT", "이미 가입된 이메일입니다.");
    }
    throw error;
  }
  await createSession(user.userId);
  return user;
}

export async function loginUser(emailInput: string, password: string): Promise<AppUser> {
  await ensureSchema();
  const row = await getD1()
    .prepare(
      `SELECT id, display_name, email, full_name, password_hash, password_salt
       FROM users WHERE email = ? COLLATE NOCASE`,
    )
    .bind(normalizeEmail(emailInput))
    .first<UserRow>();
  if (!row?.password_hash || !row.password_salt) throw invalidLogin();

  const actual = Buffer.from(hashPassword(password, row.password_salt), "hex");
  const expected = Buffer.from(row.password_hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalidLogin();

  await createSession(row.id);
  return mapUser(row);
}

export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await ensureSchema();
    await getD1().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hashToken(token)).run();
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function persistApiUser(user: AppUser): Promise<UserProfile> {
  await ensureSchema();
  await getD1()
    .prepare(
      `UPDATE users SET display_name = ?, full_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(user.displayName, user.fullName, user.userId)
    .run();
  return {
    id: user.userId,
    displayName: user.displayName,
    email: user.email,
    fullName: user.fullName,
  };
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://deck-mayhem.local");
    return url.origin === "https://deck-mayhem.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}

/**
 * Behind the Caddy reverse proxy, the standalone server binds HOSTNAME=0.0.0.0
 * and request.url reflects that bind address/port rather than the public host
 * the browser is actually on. Prefer the proxy's forwarded headers so redirect
 * responses (e.g. after login/logout) send the browser back to a real address
 * instead of an unreachable "https://0.0.0.0:3000".
 */
export function resolveRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const db = getD1();
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(hashToken(token), userId, expiresAt.toISOString())
    .run();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

function assertCredentials(displayName: string, email: string, password: string): void {
  if (displayName.length < 2 || displayName.length > 24) {
    throw new ApiProblem(400, "INVALID_INPUT", "닉네임은 2~24자로 입력해 주세요.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiProblem(400, "INVALID_INPUT", "올바른 이메일을 입력해 주세요.");
  }
  if (password.length < 8 || password.length > 72) {
    throw new ApiProblem(400, "INVALID_INPUT", "비밀번호는 8~72자로 입력해 주세요.");
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mapUser(row: UserRow): AppUser {
  return {
    userId: row.id,
    displayName: row.display_name,
    email: row.email,
    fullName: row.full_name,
  };
}

function invalidLogin(): ApiProblem {
  return new ApiProblem(401, "AUTH_REQUIRED", "이메일 또는 비밀번호가 올바르지 않습니다.");
}
