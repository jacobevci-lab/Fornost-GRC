import { NextResponse } from "next/server";
const retired=()=>NextResponse.json({error:"Bu eski API kullanımdan kaldırıldı."},{status:410,headers:{"cache-control":"no-store"}});
export const GET=retired;
export const POST=retired;
export const PATCH=retired;
export const DELETE=retired;
