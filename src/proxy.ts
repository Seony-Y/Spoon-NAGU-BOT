import { type NextRequest, NextResponse } from "next/server";

// FormNavigation posts forms with fetch and follows the 303 back to the page.
// That GET only tells the client where to go; answer it empty so the page is
// not rendered twice (the client re-renders it with the router, scroll kept).
export function proxy(request: NextRequest) {
  if (request.method !== "GET") return NextResponse.next();
  return new NextResponse(null, { status: 204 });
}

export const config = {
  matcher: [{ source: "/((?!_next/).*)", has: [{ type: "header", key: "x-nagu-form-navigation" }] }],
};
