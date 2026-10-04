import { execFileSync } from "node:child_process";
import test from "node:test";
test("offline backup validates recovery keys, archive safety, integrity and failure recovery", () => {
  execFileSync("python3", ["tests/onprem-backup-test.py"], { stdio: "pipe" });
});
