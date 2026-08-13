import { NextResponse } from "next/server";
import { logoutUser, resolveRequestOrigin, safeReturnPath } from "@/lib/server/auth";

export async function GET(request: Request): Promise<Response> {
  await logoutUser();
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return_to"));
  return NextResponse.redirect(new URL(returnTo, resolveRequestOrigin(request)), 303);
}
