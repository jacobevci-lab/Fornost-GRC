import { strict as assert } from "node:assert";
import test from "node:test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { init, type Env } from "../app/exchange/store";
import { invite, submitVendor, vendorContext } from "../app/exchange/vendor";
import {
  publish,
  trustView,
  requestAccess,
  decide,
  download,
} from "../app/exchange/trust";
import { configure, inbound, notifyDue } from "../app/exchange/connectors";
import { createBoard, readBoard } from "../app/exchange/board";
import { TPRM_CONTROLS } from "../app/third-party-risk/domain";
import {
  verifyEvidenceVersionChain,
  type EvidenceVersionRow,
} from "../app/evidence/versioning";
const req = new Request("https://fornost.example/api/exchange");
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync("drizzle/" + file, "utf8"));
  function prepare(q: string, bindings: SQLInputValue[] = []) {
    const execute = () => ({
      results: sql.prepare(q).all(...bindings),
      meta: { changes: sql.prepare("SELECT changes() n").get()!.n },
    });
    return {
      bind: (...v: SQLInputValue[]) => prepare(q, v),
      execute,
      all: async () => execute(),
      first: async () => sql.prepare(q).get(...bindings),
      run: async () => execute(),
    };
  }
  const db = {
    prepare,
    batch: async (list: ReturnType<typeof prepare>[]) => {
      sql.exec("BEGIN");
      try {
        const values = list.map((x) => x.execute());
        sql.exec("COMMIT");
        return values;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  await init(db);
  return {
    db,
    sql,
    env: { DB: db, FORNOST_SETTINGS_ENCRYPTION_KEY: "x".repeat(40) } as Env,
  };
}
function seed(
  sql: DatabaseSync,
  table: string,
  values: Record<string, SQLInputValue>,
) {
  const cols = sql.prepare("PRAGMA table_info(" + table + ")").all();
  const all: Record<string, SQLInputValue> = {};
  for (const c of cols) {
    if (c.notnull && c.dflt_value === null)
      all[String(c.name)] = c.type === "INTEGER" ? 1 : "fixture";
  }
  Object.assign(all, values);
  const names = Object.keys(all);
  sql
    .prepare(
      "INSERT INTO " +
        table +
        "(" +
        names.join(",") +
        ") VALUES(" +
        names.map(() => "?").join(",") +
        ")",
    )
    .run(...Object.values(all));
}
async function submit(env: Env, key: string, document = true) {
  const f = new FormData();
  for (const q of TPRM_CONTROLS) f.set(q, q === "dpa" ? "no" : "yes");
  if (document) {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("Confidential");
    pdf.addPage().drawText("Second page");
    f.set(
      "DPA",
      new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" }),
      "dpa.pdf",
    );
  }
  return submitVendor(
    env,
    new Request(req.url, { method: "POST", body: f }),
    key,
  );
}
async function supplier() {
  const { env, db, sql } = await fixture();
  seed(sql, "local_users", {
    id: "checker",
    email: "reviewer@local.test",
    role: "Admin",
    status: "Active",
  });
  seed(sql, "third_party_profiles", {
    vendor_id: "vendor1",
    name: "Contoso",
    status: "onboarding",
    contact: "vendor@contoso.test",
    reviewer: "reviewer@local.test",
    risk_owner: "owner@local.test",
    criticality: "critical",
  });
  seed(sql, "third_party_assessments", {
    id: "draft1",
    vendor_id: "vendor1",
    cycle_number: 1,
    status: "draft",
  });
  const first = await invite(env, req, "vendor1", "admin"),
    second = await invite(env, req, "vendor1", "admin");
  const key = second.url!.split("/").at(-1)!;
  await assert.rejects(vendorContext(db, first.url!.split("/").at(-1)!));
  assert.equal((await vendorContext(db, key)).name, "Contoso");
  await submit(env, key);
  return { env, db, sql, key };
}
test("external assessment consumes only its current invite, preserves prior draft, creates native review work and verifiable pending evidence", async () => {
  const { db, sql, key, env } = await supplier();
  await assert.rejects(submit(env, key, false));
  assert.equal(
    sql
      .prepare("SELECT status FROM third_party_assessments WHERE id='draft1'")
      .get()!.status,
    "superseded",
  );
  const a = sql
    .prepare("SELECT * FROM third_party_assessments WHERE status='submitted'")
    .get()!;
  assert.equal(a.cycle_number, 2);
  assert.equal(a.coverage, 92);
  assert.equal(
    sql.prepare("SELECT status FROM third_party_profiles").get()!.status,
    "in-review",
  );
  const rows = await db
    .prepare("SELECT * FROM evidence_versions ORDER BY file_name")
    .all<EvidenceVersionRow>();
  assert.equal(rows.results.length, 2);
  for (const v of rows.results) {
    assert.equal((await verifyEvidenceVersionChain([v])).state, "verified");
    const data = JSON.parse(
      String(
        sql
          .prepare("SELECT data_json FROM simple_grc_records WHERE id=?")
          .get(v.evidence_id)?.data_json,
      ),
    );
    assert.equal(data.sourceVendorRef, "vendor1");
    assert.equal(data.reviewStatus, "pending-review");
  }
  assert.deepEqual(
    sql
      .prepare(
        "SELECT code FROM simple_grc_record_codes WHERE module='Kanıtlar' ORDER BY code",
      )
      .all()
      .map((x) => x.code),
    ["EVD-001", "EVD-002"],
  );
});
test("unsigned submissions, expired invitations and changes to the invited draft cannot write records", async () => {
  const { env, db, sql } = await fixture();
  seed(sql, "local_users", {
    id: "checker",
    email: "b@v.test",
    role: "Admin",
    status: "Active",
  });
  seed(sql, "third_party_profiles", {
    vendor_id: "v",
    contact: "a@v.test",
    reviewer: "b@v.test",
    status: "onboarding",
  });
  seed(sql, "third_party_assessments", {
    id: "draft",
    vendor_id: "v",
    status: "draft",
  });
  const r = await invite(env, req, "v", "admin"),
    key = r.url!.split("/").at(-1)!;
  sql.exec("UPDATE third_party_assessments SET updated_at='changed'");
  await assert.rejects(submit(env, key, false));
  assert.equal(
    sql.prepare("SELECT count(*) n FROM evidence_versions").get()?.n,
    0,
  );
  sql.exec("UPDATE vendor_invitations SET expires_at='2000'");
  await assert.rejects(vendorContext(db, key));
  await assert.rejects(vendorContext(db, "unknown"));
});
test("trust is opt-in; requests pin an approved version and revocation blocks the individualized PDF", async () => {
  const { env, db, sql } = await supplier();
  const v = sql
    .prepare(
      "SELECT * FROM evidence_versions WHERE file_type='application/pdf'",
    )
    .get()!;
  const cfg = {
    documents: [v.id],
    policies: [],
    frameworks: [],
    tr: "Güvenlik özeti",
    en: "Security overview",
  };
  await assert.rejects(publish(db, cfg, "admin"));
  sql
    .prepare(
      "UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status','Onaylandı','$.reviewStatus','approved','$.reviewedBy','reviewer@local.test','$.reviewedVersion',?) WHERE id=?",
    )
    .run(v.id, v.evidence_id);
  assert.deepEqual(
    ((await trustView(db)) as { documents: unknown[] }).documents,
    [],
  );
  await publish(db, cfg, "admin");
  const b = {
    document: v.id,
    name: "Taylor",
    email: "taylor@customer.example",
    company: "Customer",
    accepted: true,
  };
  await assert.rejects(requestAccess(db, req, { ...b, accepted: false }));
  await requestAccess(db, req, b);
  await requestAccess(db, req, b);
  const requests = sql.prepare("SELECT id FROM trust_requests").all();
  assert.equal(requests.length, 1);
  const id = String(requests[0].id),
    grant = await decide(env, req, id, "approve", "admin");
  assert.ok("url" in grant && grant.url);
  const key = grant.url.split("#access=")[1];
  const response = await download(env, key);
  const output = await response.arrayBuffer();
  assert.equal((await PDFDocument.load(output)).getPageCount(), 2);
  const original = sql
    .prepare("SELECT content FROM simple_evidence_files WHERE file_key=?")
    .get(v.file_key)!.content;
  assert.ok(!Buffer.from(output).equals(Buffer.from(original as Uint8Array)));
  await publish(db, { ...cfg, documents: [] }, "admin");
  await assert.rejects(download(env, key));
  await publish(db, cfg, "admin");
  await assert.rejects(download(env, key));
});
test("scoped cloud and Entra hooks deduplicate, update native records, keep control assurance separate, and produce KRI breaches", async () => {
  const { env, sql } = await fixture();
  for (const [id, module] of [
    ["asset", "Varlık Envanteri"],
    ["risk", "Risk Assessment"],
    ["control", "Kontroller"],
  ])
    seed(sql, "simple_grc_records", {
      id,
      module,
      data_json: '{"status":"draft"}',
    });
  const cloud = await configure(
    env,
    {
      kind: "cloud",
      enabled: true,
      config: {
        resources: [
          {
            resource: "bucket:a",
            provider: "AWS",
            asset: "asset",
            risk: "risk",
          },
        ],
      },
    },
    "admin",
  );
  const send = (kind: string, key: string, id: string, b: object) =>
    inbound(
      env,
      new Request(req.url, {
        headers: { authorization: "Bearer " + key, "x-event-id": id },
      }),
      kind,
      async () => b as Record<string, unknown>,
    );
  const event = {
    provider: "AWS",
    resource: "bucket:a",
    category: "public-storage",
    severity: "high",
  };
  await assert.rejects(send("cloud", "f".repeat(64), "1", event));
  await assert.rejects(
    send("cloud", cloud.hook!, "1", { ...event, resource: "unknown" }),
  );
  await send("cloud", cloud.hook!, "1", event);
  assert.deepEqual(await send("cloud", cloud.hook!, "1", event), {
    duplicate: true,
  });
  for (const id of ["risk", "asset"])
    assert.equal(
      JSON.parse(
        String(
          sql
            .prepare("SELECT data_json FROM simple_grc_records WHERE id=?")
            .get(id)?.data_json,
        ),
      ).cloudPosture["public-storage"].severity,
      "high",
    );
  seed(sql, "risk_appetite_statements", {
    id: "kri",
    status: "approved",
    direction: "upper",
    valid_from: "2000-01-01",
    valid_until: "2099-01-01",
    warning_threshold: 1,
    breach_threshold: 2,
    frequency_days: 7,
  });
  const entra = await configure(
    env,
    {
      kind: "entra",
      enabled: true,
      secret: "fixture",
      config: {
        tenant: "aaaa0000-0000-0000-0000-000000000000",
        client: "bbbb0000-0000-0000-0000-000000000000",
        mappings: [
          { metric: "highRiskSignIns", kri: "kri", control: "control" },
        ],
      },
    },
    "admin",
  );
  await send("entra", entra.hook!, "sample", {
    mfaCoverage: 90,
    pimGlobalAdmins: 2,
    highRiskSignIns: 4,
  });
  assert.equal(
    sql.prepare("SELECT value FROM risk_kri_measurements").get()?.value,
    4,
  );
  assert.equal(
    sql.prepare("SELECT count(*) n FROM risk_kri_breaches").get()?.n,
    1,
  );
  const data = JSON.parse(
    String(
      sql
        .prepare("SELECT data_json FROM simple_grc_records WHERE id='control'")
        .get()?.data_json,
    ),
  );
  assert.equal(data.identityTelemetry.highRiskSignIns.value, 4);
  assert.equal(data.status, "draft");
  assert.deepEqual(await notifyDue(env), { sent: 0 });
});
test("Done requires a library file and independent reviewer; repeated callbacks never close CAPA", async () => {
  const { env, sql } = await supplier();
  const digest = String(
      sql
        .prepare(
          "SELECT content_sha256 FROM evidence_versions WHERE version_no=1 LIMIT 1",
        )
        .get()!.content_sha256,
    ),
    ref = sql
      .prepare(
        "SELECT c.code FROM simple_grc_record_codes c JOIN evidence_versions v ON v.evidence_id=c.record_id WHERE v.content_sha256=?",
      )
      .get(digest)!.code;
  seed(sql, "enterprise_findings", {
    id: "f",
    code: "FND-001",
    title: "Remediation",
    status: "open",
    source_type: "manual",
    finding_type: "improvement",
    owner: "owner@local.test",
    reviewer: "checker@local.test",
    detected_by: "maker@local.test",
    due_date: "2026-12-31",
    root_cause: "A documented root cause",
    preventive_action: "A documented preventive action",
    corrective_action: "A documented corrective action",
  });
  seed(sql, "exchange_tickets", {
    finding_id: "f",
    provider: "jira",
    ticket: "GRC-1",
    state: "linked",
  });
  const { hook } = await configure(
    env,
    { kind: "tickets", enabled: true },
    "admin",
  );
  const send = (b: object) =>
    inbound(
      env,
      new Request(req.url, {
        headers: {
          authorization: "Bearer " + hook,
          "x-event-id": "jira-event",
        },
      }),
      "tickets",
      async () => ({ ticket: "GRC-1", status: "Done", ...b }),
    );
  await assert.rejects(send({}));
  assert.equal(
    sql.prepare("SELECT status FROM enterprise_findings").get()?.status,
    "open",
  );
  await send({ evidenceCode: ref, evidenceSha256: digest });
  await send({ evidenceCode: ref, evidenceSha256: digest });
  assert.equal(
    sql.prepare("SELECT status FROM enterprise_findings").get()?.status,
    "verification",
  );
  assert.equal(
    sql.prepare("SELECT count(*) n FROM workflow_evidence_pins").get()?.n,
    1,
  );
});
test("board snapshots persist zero vs unavailable and separate currency exposure after source changes", async () => {
  const { db, sql } = await fixture();
  for (const [i, currency] of ["TRY", "USD"].entries())
    seed(sql, "simple_grc_records", {
      id: "r" + i,
      module: "Risk Assessment",
      data_json: JSON.stringify({
        fairLite: {
          currency,
          frequency: 100,
          minimum: 10,
          likely: 20,
          maximum: 30,
        },
      }),
    });
  const { id } = await createBoard(
    db,
    {
      sections: ["risk", "framework", "supplier", "capa", "incident"],
      lang: "en",
    },
    "admin",
  );
  const board = await readBoard(db, id);
  assert.equal(board.sections.length, 5);
  assert.match(JSON.stringify(board), /TRY/);
  assert.match(JSON.stringify(board), /USD/);
  sql.exec("DELETE FROM simple_grc_records");
  assert.deepEqual(await readBoard(db, id), board);
  sql.exec("UPDATE board_packages SET snapshot='{}'");
  await assert.rejects(readBoard(db, id));
});

test("Graph sync measures distinct active PIM principals and exercises pagination without turning tests into observations", async (ctx) => {
  const { env, sql } = await fixture();
  const { sync } = await import("../app/exchange/connectors");
  await configure(
    env,
    {
      kind: "entra",
      enabled: true,
      secret: "fixture",
      config: {
        tenant: "aaaa0000-0000-0000-0000-000000000000",
        client: "bbbb0000-0000-0000-0000-000000000000",
        mappings: [],
      },
    },
    "admin",
  );
  const pages: string[] = [];
  ctx.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    pages.push(u.href);
    if (u.hostname === "login.microsoftonline.com")
      return Response.json({ access_token: "test-token" });
    assert.equal(u.origin, "https://graph.microsoft.com");
    if (u.pathname.endsWith("userRegistrationDetails"))
      return Response.json({
        value: [{ isMfaRegistered: true }],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/users-next",
      });
    if (u.pathname.endsWith("users-next"))
      return Response.json({ value: [{ isMfaRegistered: false }] });
    if (u.pathname.includes("roleAssignment"))
      return Response.json({
        value: [
          { assignmentType: "Activated", principalId: "p" },
          { assignmentType: "Activated", principalId: "p" },
          {
            assignmentType: "Activated",
            principalId: "expired",
            endDateTime: "2000-01-01",
          },
          { assignmentType: "Assigned", principalId: "static" },
        ],
      });
    return Response.json({ value: [{ id: "s" }] });
  });
  const testResult = await sync(env, "entra", true);
  assert.ok("summary" in testResult);
  assert.deepEqual(testResult.summary, {
    mfaCoverage: 50,
    pimGlobalAdmins: 1,
    highRiskSignIns: 1,
  });
  assert.equal(
    sql.prepare("SELECT count(*) n FROM exchange_signals").get()?.n,
    0,
  );
  await sync(env, "entra", false);
  assert.equal(
    sql.prepare("SELECT count(*) n FROM exchange_signals").get()?.n,
    1,
  );
  assert.equal(pages.length, 10);
});
test("Jira creation and Slack campaign, PBC and SLA delivery are deduplicated", async (ctx) => {
  const { env, sql } = await fixture();
  const { openTicket } = await import("../app/exchange/connectors");
  await configure(env, { kind: "tickets", enabled: true }, "admin");
  seed(sql, "integration_settings", {
    id: "jira",
    kind: "ticketing",
    provider: "jira",
    enabled: 1,
    config_json: JSON.stringify({
      baseUrl: "https://jira.example",
      username: "qa",
      projectKey: "GRC",
      issueType: "Task",
    }),
  });
  seed(sql, "enterprise_findings", {
    id: "f",
    code: "FND-001",
    status: "open",
    title: "Review access",
    due_date: new Date().toISOString().slice(0, 10),
  });
  seed(sql, "policy_attestation_campaigns", {
    id: "p",
    status: "open",
    name: "Policy attestation",
    due_date: "2027-01-01",
  });
  seed(sql, "audit_requests", {
    id: "a",
    data_json: JSON.stringify({
      status: "assigned",
      dueDate: "2027-01-02",
      title: "Access evidence",
    }),
  });
  await configure(
    env,
    {
      kind: "chat",
      enabled: true,
      config: { provider: "slack" },
      secret: "https://hooks.slack.com/services/test/demo/fake",
    },
    "admin",
  );
  let chat = 0,
    tickets = 0;
  ctx.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(init?.method, "POST");
      if (url.hostname === "jira.example") {
        tickets++;
        return Response.json({ key: "GRC-5" });
      }
      assert.equal(url.hostname, "hooks.slack.com");
      chat++;
      return new Response("ok");
    },
  );
  assert.equal((await openTicket(env, "f")).ticket, "GRC-5");
  await openTicket(env, "f");
  assert.equal(tickets, 1);
  assert.deepEqual(await notifyDue(env), { sent: 3 });
  assert.deepEqual(await notifyDue(env), { sent: 0 });
  assert.equal(chat, 3);
});
test("AWS, Azure and GCP bridge normalize tenant resource identifiers without accepting an unmapped record ID", async () => {
  const { cloudEvents } = await import("../app/exchange/cloud");
  const aws = cloudEvents({
    source: "aws.securityhub",
    detail: {
      findings: [
        {
          Resources: [{ Id: "arn:aws:s3:::company" }],
          Severity: { Label: "HIGH" },
          Title: "Bucket public access",
        },
      ],
    },
  });
  assert.deepEqual(aws, [
    {
      provider: "AWS",
      resource: "arn:aws:s3:::company",
      category: "public-storage",
      severity: "high",
    },
  ]);
  assert.deepEqual(
    cloudEvents({
      finding: {
        resourceName: "//compute/a",
        category: "KMS_DISABLED",
        severity: "HIGH",
        state: "INACTIVE",
      },
    })[0],
    {
      provider: "GCP",
      resource: "//compute/a",
      category: "encryption",
      severity: "resolved",
    },
  );
  assert.deepEqual(
    cloudEvents({
      eventType: "Microsoft.Security.AlertCreated",
      data: {
        properties: {
          alertDisplayName: "IAM role assignment",
          severity: "High",
          resourceIdentifiers: [{ azureResourceId: "/subscriptions/a" }],
        },
      },
    })[0],
    {
      provider: "Azure",
      resource: "/subscriptions/a",
      category: "iam",
      severity: "high",
    },
  );
  assert.throws(() =>
    cloudEvents({ provider: "AWS", id: "random-core-record" }),
  );
});

test("ambiguous ticket delivery can be recovered only from the provider's original correlation", async (ctx) => {
  const { env, sql } = await fixture();
  const { openTicket } = await import("../app/exchange/connectors");
  const { recoverTicket } = await import("../app/exchange/ticket-recovery");
  await configure(env, { kind: "tickets", enabled: true }, "admin");
  seed(sql, "integration_settings", {
    id: "jira",
    kind: "ticketing",
    provider: "jira",
    enabled: 1,
    config_json: JSON.stringify({
      baseUrl: "https://jira.example",
      username: "qa",
      projectKey: "GRC",
    }),
  });
  seed(sql, "enterprise_findings", {
    id: "finding123",
    status: "open",
    title: "Anything",
  });
  let posts = 0,
    description = "";
  ctx.mock.method(
    globalThis,
    "fetch",
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts++;
        throw Error("Connection lost");
      }
      return Response.json({
        key: "GRC-42",
        fields: {
          description: {
            content: [{ content: [{ type: "text", text: description }] }],
          },
        },
      });
    },
  );
  await assert.rejects(openTicket(env, "finding123"));
  await assert.rejects(openTicket(env, "finding123"));
  assert.equal(posts, 1);
  await assert.rejects(recoverTicket(env, "finding123", "GRC-42"));
  description = "Anything\nFornost: finding123";
  assert.equal(
    (await recoverTicket(env, "finding123", "GRC-42")).ticket,
    "GRC-42",
  );
  assert.equal((await openTicket(env, "finding123")).ticket, "GRC-42");
  assert.equal(posts, 1);
});
