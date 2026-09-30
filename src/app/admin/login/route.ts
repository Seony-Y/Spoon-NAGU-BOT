import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminToken, verifyAdminPassword } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const token = createAdminToken();
  if (!token || !verifyAdminPassword(password)) {
    return NextResponse.redirect(new URL("/admin?error=invalid_login", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/admin",
    maxAge: 8 * 60 * 60,
  });
  return response;
}