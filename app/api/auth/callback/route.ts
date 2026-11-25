import { type NextRequest } from "next/server";
import { completeSso } from "../../../authentication/callback";
export async function GET(req: NextRequest) {
  return completeSso(req);
}
