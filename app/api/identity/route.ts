import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    { error: "Bu deneysel API kullanımdan kaldırıldı." },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}

export function GET() {
  return retired();
}

export function POST() {
  return retired();
}

export function PATCH() {
  return retired();
}

export function DELETE() {
  return retired();
}
