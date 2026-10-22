import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

function audit(statuses: number[], message = "") {
  const dir = mkdtempSync(join(tmpdir(), "audit-gate-"));
  try {
    writeFileSync(join(dir, "timeout"), `#!/usr/bin/env bash
echo "$*" >> "$AUDIT_TEST_DIR/args"
n=$(cat "$AUDIT_TEST_DIR/count" 2>/dev/null || echo 0)
echo $((n + 1)) > "$AUDIT_TEST_DIR/count"
statuses=(${statuses.join(" ")})
echo "$AUDIT_TEST_MESSAGE"
exit "\${statuses[$n]:-99}"
`, { mode: 0o755 });
    writeFileSync(join(dir, "sleep"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    const result = spawnSync("bash", [resolve("scripts/audit-dependencies.sh")], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AUDIT_TEST_DIR: dir, AUDIT_TEST_MESSAGE: message },
      encoding: "utf8",
    });
    const args = readFileSync(join(dir, "args"), "utf8").trim().split("\n");
    for (const line of args) assert.equal(line, "90s npm audit --omit=dev --audit-level=high --fetch-timeout=20000 --fetch-retries=1");
    return { status: result.status, attempts: args.length, output: result.stdout + result.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("dependency audit retries a silent outer timeout and recovers", () => {
  const result = audit([124, 0]);
  assert.equal(result.status, 0);
  assert.equal(result.attempts, 2);
});
test("dependency audit fails closed after three timeouts", () => {
  const result = audit([124, 124, 124]);
  assert.equal(result.status, 124);
  assert.equal(result.attempts, 3);
  assert.match(result.output, /remained unavailable/);
});
test("dependency audit retries service errors but not vulnerability findings", () => {
  assert.equal(audit([1, 0], "503 Service Unavailable").attempts, 2);
  const result = audit([1, 0], "1 high severity vulnerability");
  assert.equal(result.status, 1);
  assert.equal(result.attempts, 1);
});
test("dependency audit returns immediately on success or unexpected failure", () => {
  assert.equal(audit([0]).attempts, 1);
  const result = audit([2, 0]);
  assert.equal(result.status, 2);
  assert.equal(result.attempts, 1);
});
