import { NextResponse } from "next/server";
import { resolveRequestOrigin, safeReturnPath } from "@/lib/server/auth";

export function GET(request: Request): Response {
  const source = new URL(request.url);
  const target = new URL("/login", resolveRequestOrigin(request));
  target.searchParams.set("returnTo", safeReturnPath(source.searchParams.get("return_to")));
  return NextResponse.redirect(target, 307);
}
