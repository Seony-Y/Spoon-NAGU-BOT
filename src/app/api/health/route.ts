import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ service: "nagu-bot", status: "ok" });
}