import { type NextRequest } from "next/server";
import { completeSso } from "../../../authentication/callback";
export async function POST(req: NextRequest) {
  return completeSso(req, true);
}
