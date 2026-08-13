import { NextResponse } from "next/server";
import { ApiProblem } from "@/lib/server/api";
import { loginUser, resolveRequestOrigin, safeReturnPath } from "@/lib/server/auth";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const returnTo = safeReturnPath(text(form, "returnTo"));
  const origin = resolveRequestOrigin(request);
  const wantsJson = request.headers.get("accept")?.includes("application/json") ?? false;
  try {
    const user = await loginUser(text(form, "email"), text(form, "password"));
    if (wantsJson) return NextResponse.json({ user });
    return NextResponse.redirect(new URL(returnTo, origin), 303);
  } catch (error) {
    const message = error instanceof ApiProblem ? error.message : "로그인 처리 중 오류가 발생했습니다.";
    if (wantsJson) return NextResponse.json({ error: message }, { status: error instanceof ApiProblem ? error.status : 500 });
    const url = new URL("/login", origin);
    url.searchParams.set("returnTo", returnTo);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
