import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

export function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}