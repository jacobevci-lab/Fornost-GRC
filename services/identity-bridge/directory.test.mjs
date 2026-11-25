import test from "node:test";
import assert from "node:assert/strict";
import { directoryOperation } from "./directory.mjs";
const config = {
  host: "dc.example.test",
  port: "636",
  transport: "ldaps",
  baseDn: "DC=example,DC=test",
  bindDn: "CN=reader,DC=example,DC=test",
  usernameAttribute: "sAMAccountName",
  subjectAttribute: "objectGUID",
};
function fixture({
  entries = [
    {
      dn: "CN=User,DC=example,DC=test",
      mail: "user@example.test",
      objectGUID: Buffer.from("immutable-id"),
    },
  ],
  rejectBind = false,
  rejectTls = false,
} = {}) {
  const calls = [];
  return {
    calls,
    allowedHosts: ["dc.example.test"],
    createClient(options) {
      calls.push(["connect", options]);
      return {
        async startTLS(o) {
          calls.push(["tls", o]);
          if (rejectTls) throw Error("certificate failed");
        },
        async bind(dn, password) {
          calls.push(["bind", dn, password]);
          if (rejectBind && dn.startsWith("CN=User"))
            throw Error("invalid password");
        },
        async search(base, options) {
          calls.push(["search", base, options]);
          return { searchEntries: entries };
        },
        async unbind() {
          calls.push(["unbind"]);
        },
      };
    },
  };
}
test("LDAPS verifies certificates, escapes lookup values and separately binds the exact user DN", async () => {
  const f = fixture(),
    result = await directoryOperation(
      {
        directory: config,
        username: "user*)(uid=*)",
        password: "user-password",
        bindPassword: "bind-password",
      },
      f,
    );
  assert.equal(result.email, "user@example.test");
  assert.equal(f.calls.filter((x) => x[0] === "bind").length, 2);
  assert.equal(
    f.calls
      .find((x) => x[0] === "search")[2]
      .filter.toString()
      .includes("\\2a"),
    true,
  );
  assert.ok(
    f.calls
      .filter((x) => x[0] === "connect")
      .every(
        (x) =>
          x[1].tlsOptions.rejectUnauthorized &&
          x[1].tlsOptions.minVersion === "TLSv1.2",
      ),
  );
  assert.equal(f.calls.filter((x) => x[0] === "unbind").length, 2);
});
test("StartTLS completes before either bind; TLS failure never sends credentials", async () => {
  const c = { ...config, transport: "starttls", port: "389" },
    f = fixture();
  await directoryOperation(
    { directory: c, username: "user", password: "pw", bindPassword: "bind" },
    f,
  );
  assert.deepEqual(
    f.calls
      .filter((x) => ["connect", "tls", "bind"].includes(x[0]))
      .map((x) => x[0]),
    ["connect", "tls", "bind", "connect", "tls", "bind"],
  );
  const failed = fixture({ rejectTls: true });
  await assert.rejects(
    directoryOperation(
      { directory: c, username: "user", password: "pw", bindPassword: "bind" },
      failed,
    ),
  );
  assert.equal(
    failed.calls.some((x) => x[0] === "bind"),
    false,
  );
});
test("empty passwords, unknown host, ambiguous lookup and invalid password never authenticate", async () => {
  for (const overrides of [
    { password: "" },
    { bindPassword: "" },
    { directory: { ...config, host: "169.254.169.254" } },
  ]) {
    const f = fixture();
    await assert.rejects(
      directoryOperation(
        {
          directory: config,
          username: "user",
          password: "pw",
          bindPassword: "bind",
          ...overrides,
        },
        f,
      ),
    );
    assert.equal(f.calls.length, 0);
  }
  for (const entries of [[], [{ dn: "a" }, { dn: "b" }]]) {
    const f = fixture({ entries });
    await assert.rejects(
      directoryOperation(
        {
          directory: config,
          username: "user",
          password: "pw",
          bindPassword: "bind",
        },
        f,
      ),
    );
    assert.equal(f.calls.filter((x) => x[0] === "bind").length, 1);
  }
  const f = fixture({ rejectBind: true });
  await assert.rejects(
    directoryOperation(
      {
        directory: config,
        username: "user",
        password: "pw",
        bindPassword: "bind",
      },
      f,
    ),
  );
  assert.equal(f.calls.filter((x) => x[0] === "unbind").length, 2);
});
