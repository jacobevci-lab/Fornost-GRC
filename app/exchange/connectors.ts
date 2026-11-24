import { cloudEvents } from "./cloud";
import { check, hash, init, stamp, text, token, type Env } from "./store";
import {
  decryptSecret,
  encryptSecret,
  safeHttpUrl,
} from "../api/integrations/security";
import { testTicketConnection } from "../integrations/ticketing-test";
import {
  createConfiguredTicket,
  TicketRejectedError,
} from "../integrations/ticketing";
import {
  publicEvidenceVersion,
  verifyEvidenceVersionChainWithAnchor,
  sha256HexBytes,
  type EvidenceVersionRow,
} from "../evidence/versioning";
import { validateFindingGovernanceGate } from "../findings/domain";
import { classifyKri, nextMeasurementDate } from "../risk-appetite/domain";
export const kinds = ["entra", "cloud", "tickets", "chat"] as const;
export const metrics = [
  "mfaCoverage",
  "pimGlobalAdmins",
  "highRiskSignIns",
] as const;
type Mapping = { metric: string; control: string; kri: string };
type Resource = {
  provider: string;
  resource: string;
  asset: string;
  risk: string;
};
type Config = {
  tenant: string;
  client: string;
  provider: string;
  mappings: Mapping[];
  resources: Resource[];
};
type Stored = {
  kind: string;
  config: string;
  secret: string | null;
  hook_hash: string | null;
  enabled: number;
};
const empty: Config = {
  tenant: "",
  client: "",
  provider: "",
  mappings: [],
  resources: [],
};
const key = (env: Env) => String(env.FORNOST_SETTINGS_ENCRYPTION_KEY || "");
const get = (db: D1Database, kind: string) =>
  db
    .prepare("SELECT * FROM exchange_connectors WHERE kind=?")
    .bind(kind)
    .first<Stored>();
const guid = /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
function chatEndpoint(url: string, provider: string) {
  const safe = safeHttpUrl(url);
  check(safe);
  const u = new URL(safe);
  check(
    !u.port &&
      (provider === "slack"
        ? u.hostname === "hooks.slack.com" &&
          u.pathname.startsWith("/services/")
        : provider === "teams" &&
          (/\.webhook\.office\.com$/.test(u.hostname) ||
            /\.logic\.azure\.com$/.test(u.hostname) ||
            /\.environment\.api\.powerplatform\.com$/.test(u.hostname))),
  );
  return u.href;
}
export async function connectorView(db: D1Database) {
  const rows = (
    await db
      .prepare(
        "SELECT kind,config,enabled,secret IS NOT NULL hasSecret,hook_hash IS NOT NULL hasHook FROM exchange_connectors",
      )
      .all<{
        kind: string;
        config: string;
        enabled: number;
        hasSecret: number;
        hasHook: number;
      }>()
  ).results;
  const options = (
    await db
      .prepare(
        "SELECT c.record_id id,c.code,r.module,COALESCE(json_extract(r.data_json,'$.title'),json_extract(r.data_json,'$.name'),json_extract(r.data_json,'$.controlName'),'') title FROM simple_grc_record_codes c JOIN simple_grc_records r ON r.id=c.record_id WHERE r.module IN ('Risk Assessment','Varlık Envanteri','Kontroller') ORDER BY c.code",
      )
      .all()
  ).results;
  return {
    cards: kinds.map((kind) => {
      const row = rows.find((x) => x.kind === kind);
      return { kind, ...row, config: row ? JSON.parse(row.config) : empty };
    }),
    options,
    kris: (
      await db
        .prepare(
          "SELECT id,code,kri_name title FROM risk_appetite_statements WHERE status='approved' ORDER BY code",
        )
        .all()
    ).results,
    signals: (
      await db
        .prepare(
          "SELECT kind,observed_at,summary FROM exchange_signals ORDER BY observed_at DESC LIMIT 30",
        )
        .all()
    ).results,
  };
}
async function checkRef(db: D1Database, id: string, module: string) {
  check(
    await db
      .prepare("SELECT 1 FROM simple_grc_records WHERE id=? AND module=?")
      .bind(id, module)
      .first(),
    422,
    "mapping",
  );
}
export async function configure(
  env: Env,
  b: Record<string, unknown>,
  actor: string,
) {
  const kind = text(b.kind, 20);
  check(kinds.some((x) => x === kind));
  const old = await get(env.DB, kind);
  const cfg = (b.config || {}) as Partial<Config>,
    c: Config = {
      ...empty,
      provider: text(cfg.provider, 30),
      client: text(cfg.client, 100),
      tenant: text(cfg.tenant, 100),
    };
  if (kind === "entra") {
    check(!b.enabled || (guid.test(c.client) && guid.test(c.tenant)));
    check(Array.isArray(cfg.mappings) && cfg.mappings.length <= 3);
    const seen = new Set();
    for (const m of cfg.mappings) {
      check(
        m &&
          metrics.some((x) => x === m.metric) &&
          !seen.has(m.metric) &&
          (m.control || m.kri),
      );
      seen.add(m.metric);
      if (m.control) await checkRef(env.DB, m.control, "Kontroller");
      if (m.kri)
        check(
          await env.DB.prepare(
            "SELECT 1 FROM risk_appetite_statements WHERE id=? AND status='approved'",
          )
            .bind(m.kri)
            .first(),
          422,
          "mapping",
        );
    }
    c.mappings = cfg.mappings;
    check(
      new Set(c.mappings.filter((m) => m.kri).map((m) => m.kri)).size ===
        c.mappings.filter((m) => m.kri).length,
      422,
      "mapping",
    );
  }
  if (kind === "cloud") {
    check(Array.isArray(cfg.resources) && cfg.resources.length <= 60);
    const seen = new Set();
    for (const m of cfg.resources) {
      check(
        m &&
          ["AWS", "Azure", "GCP"].includes(m.provider) &&
          text(m.resource, 512) === m.resource &&
          m.resource &&
          !seen.has(m.provider + "|" + m.resource),
      );
      seen.add(m.provider + "|" + m.resource);
      await checkRef(env.DB, m.asset, "Varlık Envanteri");
      await checkRef(env.DB, m.risk, "Risk Assessment");
    }
    c.resources = cfg.resources;
  }
  const secret = text(b.secret, 3000);
  if (kind === "chat" && secret) chatEndpoint(secret, c.provider);
  if (kind === "chat" && b.enabled)
    check(["slack", "teams"].includes(c.provider) && (secret || old?.secret));
  if (kind === "entra" && b.enabled) check(secret || old?.secret);
  const encrypted = secret
    ? await encryptSecret(secret, key(env))
    : old?.secret || null;
  const hook =
    kind !== "chat" && (!old?.hook_hash || b.rotate === true) ? token() : null;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO exchange_connectors VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      kind,
      JSON.stringify(c),
      encrypted,
      hook ? await hash(hook) : old?.hook_hash || null,
      b.enabled === true ? 1 : 0,
      actor,
      stamp(),
    )
    .run();
  return { ok: true, hook };
}
async function graph(env: Env, row: Stored) {
  const c = JSON.parse(row.config) as Config;
  check(
    guid.test(c.tenant) && guid.test(c.client) && row.secret,
    409,
    "config",
  );
  const res = await fetch(
    "https://login.microsoftonline.com/" + c.tenant + "/oauth2/v2.0/token",
    {
      method: "POST",
      redirect: "error",
      body: new URLSearchParams({
        client_id: c.client,
        client_secret: await decryptSecret(row.secret, key(env)),
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
      signal: AbortSignal.timeout(9000),
    },
  );
  check(res.ok, 502, "provider");
  const { access_token } = (await res.json()) as { access_token: string };
  check(access_token, 502, "provider");
  async function collect(path: string) {
    let url = "https://graph.microsoft.com/v1.0/" + path;
    const records: Record<string, unknown>[] = [];
    for (let page = 0; url && page < 30; page++) {
      check(
        new URL(url).origin === "https://graph.microsoft.com",
        502,
        "provider",
      );
      const response = await fetch(url, {
        redirect: "error",
        headers: { authorization: "Bearer " + access_token },
        signal: AbortSignal.timeout(12000),
      });
      check(response.ok, 502, "provider");
      const data = (await response.json()) as {
        value: Record<string, unknown>[];
        "@odata.nextLink"?: string;
      };
      check(Array.isArray(data.value), 502, "provider");
      records.push(...data.value);
      url = data["@odata.nextLink"] || "";
    }
    check(!url, 502, "page-limit");
    return records;
  }
  const since = new Date(Date.now() - 86400000).toISOString();
  const [users, roles, signins] = await Promise.all([
    collect(
      "reports/authenticationMethods/userRegistrationDetails?$select=id,isMfaRegistered",
    ),
    collect(
      "roleManagement/directory/roleAssignmentScheduleInstances?$filter=roleDefinitionId eq '62e90394-69f5-4237-9190-012177145e10'&$select=principalId,assignmentType,startDateTime,endDateTime,directoryScopeId",
    ),
    collect(
      "auditLogs/signIns?$filter=" +
        encodeURIComponent(
          "createdDateTime ge " +
            since +
            " and riskLevelDuringSignIn eq 'high'",
        ) +
        "&$select=id",
    ),
  ]);
  return {
    mfaCoverage: users.length
      ? Math.round(
          (10000 * users.filter((x) => x.isMfaRegistered === true).length) /
            users.length,
        ) / 100
      : null,
    pimGlobalAdmins: new Set(
      roles
        .filter(
          (x) =>
            x.assignmentType === "Activated" &&
            typeof x.principalId === "string" &&
            (!x.startDateTime ||
              Date.parse(String(x.startDateTime)) <= Date.now()) &&
            (!x.endDateTime || Date.parse(String(x.endDateTime)) > Date.now()),
        )
        .map((x) => x.principalId),
    ).size,
    highRiskSignIns: signins.length,
  };
}
async function observe(
  env: Env,
  kind: string,
  id: string,
  c: Config,
  b: Record<string, unknown>,
  dryRun = false,
) {
  const db = env.DB;
  check(/^[a-zA-Z0-9_.:-]{1,120}$/.test(id));
  if (
    await db
      .prepare("SELECT 1 FROM exchange_signals WHERE kind=? AND event_id=?")
      .bind(kind, id)
      .first()
  )
    return { duplicate: true };
  const at = stamp(),
    day = at.slice(0, 10),
    digest = await hash(JSON.stringify(b)),
    stmts: D1PreparedStatement[] = [],
    summary: Record<string, unknown> = {};
  let requiredTicketEvent: string | null = null;
  if (kind === "entra") {
    for (const metric of metrics) {
      const value = b[metric];
      check(
        (value === null && metric === "mfaCoverage") ||
          (typeof value === "number" &&
            Number.isFinite(value) &&
            value >= 0 &&
            (metric === "mfaCoverage"
              ? value <= 100
              : Number.isInteger(value))),
      );
      summary[metric] = value;
      if (value === null) continue;
      const m = c.mappings.find((x) => x.metric === metric);
      if (!m) continue;
      if (m.control) {
        await checkRef(db, m.control, "Kontroller");
        stmts.push(
          db
            .prepare(
              "UPDATE simple_grc_records SET data_json=json_set(data_json,?,json(?)),updated_at=? WHERE id=? AND module='Kontroller'",
            )
            .bind(
              "$.identityTelemetry." + metric,
              JSON.stringify({ value, at, digest }),
              at,
              m.control,
            ),
        );
      }
      if (m.kri) {
        const k = await db
          .prepare(
            "SELECT * FROM risk_appetite_statements WHERE id=? AND status='approved' AND ? BETWEEN valid_from AND valid_until",
          )
          .bind(m.kri, day)
          .first<Record<string, string | number>>();
        check(k, 409, "kri");
        const band = classifyKri(
            value as number,
            String(k.direction),
            Number(k.warning_threshold),
            Number(k.breach_threshold),
          ),
          mid = "KRI-" + crypto.randomUUID(),
          who = "connector:entra";
        stmts.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO risk_kri_measurements VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              mid,
              m.kri,
              day,
              day,
              value,
              band,
              "entra:" + id,
              digest,
              metric,
              who,
              at,
            ),
        );
        const claim = "EXISTS(SELECT 1 FROM risk_kri_measurements WHERE id=?)";
        stmts.push(
          db
            .prepare(
              "UPDATE risk_appetite_statements SET next_measurement=?,updated_at=?,updated_by=? WHERE id=? AND " +
                claim,
            )
            .bind(
              nextMeasurementDate(day, Number(k.frequency_days)),
              at,
              who,
              m.kri,
              mid,
            ),
        );
        if (band === "red") {
          const severity =
            Math.abs(Number(value) - Number(k.breach_threshold)) >=
            Math.max(
              1,
              Math.abs(
                Number(k.breach_threshold) - Number(k.warning_threshold),
              ),
            )
              ? "critical"
              : "high";
          stmts.push(
            db
              .prepare(
                "INSERT INTO risk_kri_breaches(id,appetite_id,measurement_id,severity,status,detected_by,detected_at,updated_by,updated_at) SELECT ?,?,?,?,'open',?,?,?,? WHERE " +
                  claim,
              )
              .bind(
                "KRB-" + crypto.randomUUID(),
                m.kri,
                mid,
                severity,
                who,
                at,
                who,
                at,
                mid,
              ),
          );
        }
      }
    }
  } else if (kind === "cloud") {
    const provider = text(b.provider, 20),
      m = c.resources.find(
        (x) => x.provider === provider && x.resource === b.resource,
      );
    check(m, 422, "mapping");
    const category = text(b.category, 40),
      severity = text(b.severity, 20);
    check(
      ["encryption", "public-storage", "iam"].includes(category) &&
        ["low", "medium", "high", "critical", "resolved"].includes(severity),
    );
    await Promise.all([
      checkRef(db, m.asset, "Varlık Envanteri"),
      checkRef(db, m.risk, "Risk Assessment"),
    ]);
    Object.assign(summary, {
      provider,
      category,
      severity,
      resource: m.resource,
    });
    for (const ref of [m.asset, m.risk])
      stmts.push(
        db
          .prepare(
            "UPDATE simple_grc_records SET data_json=json_set(data_json,?,json(?)),updated_at=? WHERE id=?",
          )
          .bind(
            "$.cloudPosture." + category,
            JSON.stringify({ ...summary, at }),
            at,
            ref,
          ),
      );
  } else if (kind === "tickets") {
    const issue = b.issue as
      | {
          key?: string;
          fields?: {
            status?: { name?: string; statusCategory?: { key: string } };
          };
        }
      | undefined;
    const ticket = text(issue?.key || b.ticket, 120),
      status = text(
        issue?.fields?.status?.statusCategory?.key ||
          issue?.fields?.status?.name ||
          b.status,
        80,
      ).toLowerCase();
    check(ticket && status);
    const finding = await db
      .prepare(
        "SELECT f.* FROM enterprise_findings f JOIN exchange_tickets t ON t.finding_id=f.id WHERE t.ticket=? AND t.state='linked'",
      )
      .bind(ticket)
      .first<Record<string, string>>();
    check(finding, 404, "ticket");
    Object.assign(summary, { ticket, status });
    if (
      ["done", "resolved", "closed", "6", "7"].includes(status) &&
      ["open", "in-progress"].includes(finding.status)
    ) {
      check(
        finding.owner &&
          finding.reviewer &&
          finding.owner.toLowerCase() !== finding.reviewer.toLowerCase() &&
          finding.reviewer.toLowerCase() !== finding.detected_by.toLowerCase(),
        409,
        "closure",
      );
      try {
        validateFindingGovernanceGate(finding, "submit");
      } catch {
        check(false, 409, "closure");
      }
      const ref = text(b.evidenceCode || finding.evidence_reference, 128),
        expected = text(b.evidenceSha256 || finding.evidence_sha256, 64);
      const record = await db
        .prepare(
          "SELECT r.id,r.data_json FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Kanıtlar' AND (r.id=? OR c.code=?)",
        )
        .bind(ref, ref)
        .first<{ id: string; data_json: string }>();
      check(record, 409, "closure");
      const versions = await db
          .prepare(
            "SELECT * FROM evidence_versions WHERE evidence_id=? ORDER BY version_no",
          )
          .bind(record.id)
          .all<EvidenceVersionRow>(),
        head = versions.results.at(-1),
        data = JSON.parse(record.data_json);
      check(
        head &&
          head.content_sha256 === expected &&
          (
            await verifyEvidenceVersionChainWithAnchor(versions.results, {
              versionNo: data.versionNo,
              chainSha256: data.versionChainSha256,
            })
          ).state === "verified",
        409,
        "closure",
      );
      const obj = await env.BUCKET?.get(head.file_key),
        sqlBytes = obj
          ? null
          : await db
              .prepare(
                "SELECT content FROM simple_evidence_files WHERE file_key=?",
              )
              .bind(head.file_key)
              .first<{ content: number[] | ArrayBuffer }>();
      const bytes = obj
        ? new Uint8Array(await new Response(obj.body).arrayBuffer())
        : sqlBytes
          ? new Uint8Array(sqlBytes.content)
          : null;
      check(
        bytes && (await sha256HexBytes(bytes)) === expected,
        409,
        "closure",
      );
      const who = "connector:ticket",
        event = crypto.randomUUID();
      requiredTicketEvent = event;
      stmts.push(
        db
          .prepare(
            "INSERT INTO enterprise_finding_events SELECT ?,?,'submit',?,'verification',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM enterprise_findings WHERE id=? AND updated_at=?) AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND data_json=?)",
          )
          .bind(
            event,
            finding.id,
            finding.status,
            ticket,
            record.id,
            expected,
            who,
            at,
            finding.id,
            finding.updated_at,
            record.id,
            record.data_json,
          ),
        db
          .prepare(
            "UPDATE enterprise_findings SET status='verification',evidence_reference=?,evidence_sha256=?,submitted_at=?,submitted_by=?,updated_at=?,updated_by=? WHERE id=? AND EXISTS(SELECT 1 FROM enterprise_finding_events WHERE id=?)",
          )
          .bind(record.id, expected, at, who, at, who, finding.id, event),
        db
          .prepare(
            "INSERT INTO workflow_evidence_pins(id,event_id,workflow,entity_id,purpose,snapshot_json,actor,created_at) SELECT ?,?,'findings',?,'submit',?,?,? WHERE EXISTS(SELECT 1 FROM enterprise_finding_events WHERE id=?)",
          )
          .bind(
            crypto.randomUUID(),
            event,
            finding.id,
            JSON.stringify(publicEvidenceVersion(head)),
            who,
            at,
            event,
          ),
      );
    }
  } else check(false);
  if (dryRun) return { test: true, summary };
  try {
    // A changed CAPA or evidence version leaves the event available for provider retry.
    const committed = await db.batch([
      ...stmts,
      db
        .prepare(
          "INSERT INTO exchange_signals SELECT ?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM enterprise_finding_events WHERE id=?)",
        )
        .bind(
          kind,
          id,
          at,
          JSON.stringify(summary),
          requiredTicketEvent,
          requiredTicketEvent,
        ),
    ]);
    check(committed.at(-1)?.meta?.changes, 409, "closure");
  } catch (e) {
    if (
      await db
        .prepare("SELECT 1 FROM exchange_signals WHERE kind=? AND event_id=?")
        .bind(kind, id)
        .first()
    )
      return { duplicate: true };
    throw e;
  }
  return { ok: true, summary };
}
export async function inbound(
  env: Env,
  req: Request,
  kind: string,
  body: () => Promise<Record<string, unknown>>,
) {
  check(["entra", "cloud", "tickets"].includes(kind), 404);
  const bearer = (req.headers.get("authorization") || "").match(
    /^Bearer ([a-f0-9]{64})$/,
  );
  check(bearer, 401, "credential");
  const r = await get(env.DB, kind);
  check(
    r?.enabled && r.hook_hash === (await hash(bearer[1])),
    401,
    "credential",
  );
  const b = await body();
  const id = text(
    req.headers.get("x-event-id") ||
      b.eventId ||
      b.id ||
      req.headers.get("x-atlassian-webhook-identifier"),
    110,
  );
  check(/^[a-zA-Z0-9_.:-]{1,110}$/.test(id));
  if (b.test === true) return { test: true };
  const cfg = JSON.parse(r.config) as Config;
  if (kind === "cloud" && !b.provider) {
    const events = cloudEvents(b);
    check(events.length <= 30);
    for (const e of events)
      check(
        cfg.resources.some(
          (m) => m.provider === e.provider && m.resource === e.resource,
        ),
        422,
        "mapping",
      );
    let i = 0;
    for (const e of events) await observe(env, kind, id + ":" + i++, cfg, e);
    return { ok: true, count: events.length };
  }
  return observe(env, kind, id, cfg, b);
}
export async function openTicket(env: Env, id: string) {
  const db = env.DB;
  check((await get(db, "tickets"))?.enabled, 409, "config");
  const f = await db
    .prepare(
      "SELECT title,description,status FROM enterprise_findings WHERE id=?",
    )
    .bind(id)
    .first<{ title: string; description: string; status: string }>();
  check(
    f && !["accepted", "closed", "cancelled"].includes(f.status),
    409,
    "state",
  );
  const provider = await db
    .prepare(
      "SELECT provider FROM integration_settings WHERE enabled=1 AND kind='ticketing'",
    )
    .first<{ provider: string }>();
  check(
    provider && ["jira", "jira-dc", "servicenow"].includes(provider.provider),
    409,
    "config",
  );
  const old = await db
    .prepare("SELECT ticket,url,state FROM exchange_tickets WHERE finding_id=?")
    .bind(id)
    .first();
  if (old) {
    check(old.state === "linked", 409, "reconcile");
    return old;
  }
  const r = await db
    .prepare(
      "INSERT OR IGNORE INTO exchange_tickets VALUES(?,?,NULL,NULL,'sending')",
    )
    .bind(id, provider.provider)
    .run();
  check(r.meta?.changes, 409, "reconcile");
  let result;
  try {
    result = await createConfiguredTicket(db, env, {
      title: f.title,
      description: f.description.slice(0, 3600) + "\nFornost: " + id,
      sourceId: id,
    });
  } catch (e) {
    if (e instanceof TicketRejectedError) {
      await db
        .prepare(
          "DELETE FROM exchange_tickets WHERE finding_id=? AND state='sending'",
        )
        .bind(id)
        .run();
      check(false, 502, "provider");
    }
    check(false, 409, "reconcile");
  }
  check(result.ticket.id !== "created", 502, "reconcile");
  await db
    .prepare(
      "UPDATE exchange_tickets SET ticket=?,url=?,state='linked' WHERE finding_id=?",
    )
    .bind(result.ticket.id, result.ticket.url, id)
    .run();
  return { ticket: result.ticket.id, url: result.ticket.url };
}
async function chat(env: Env, r: Stored, kind: string, message: string) {
  const c = JSON.parse(r.config) as Config,
    url = chatEndpoint(await decryptSecret(r.secret, key(env)), c.provider);
  const body =
    c.provider === "slack"
      ? {
          text: message.replace(/[<>&]/g, ""),
          mrkdwn: false,
          link_names: 0,
          blocks: [
            {
              type: "section",
              text: { type: "plain_text", text: message.slice(0, 2800) },
            },
          ],
        }
      : {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                type: "AdaptiveCard",
                version: "1.2",
                body: [{ type: "TextBlock", text: message, wrap: true }],
              },
            },
          ],
        };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(9000),
  });
  check(res.ok, 502, kind);
}
export async function notifyDue(env: Env) {
  await init(env.DB);
  const db = env.DB,
    row = await get(db, "chat");
  if (!row?.enabled) return { sent: 0 };
  const tasks = await db
    .prepare(
      `WITH notices AS (
 SELECT 'attest:'||id id,'Politika beyanı / Policy attestation · '||name label,due_date due FROM policy_attestation_campaigns WHERE status='open'
 UNION ALL SELECT 'sla:'||id,'CAPA termini / CAPA deadline · '||title,due_date FROM enterprise_findings WHERE status IN ('open','in-progress','verification') AND due_date BETWEEN date('now') AND date('now','+7 day')
 UNION ALL SELECT 'pbc:'||id,'Kanıt talebi / Evidence request · '||COALESCE(json_extract(data_json,'$.title'),''),json_extract(data_json,'$.dueDate') FROM audit_requests WHERE json_extract(data_json,'$.status') IN ('assigned','changes_requested'))
 SELECT * FROM notices WHERE NOT EXISTS(SELECT 1 FROM exchange_notices n WHERE n.id=notices.id||':'||due AND (n.state='sent' OR n.state='sending' AND n.updated_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour'))) ORDER BY due LIMIT 20`,
    )
    .all<{ id: string; label: string; due: string }>();
  let sent = 0;
  for (const t of tasks.results) {
    const id = t.id + ":" + t.due,
      claimed = await db
        .prepare(
          "INSERT INTO exchange_notices VALUES(?,'sending',?) ON CONFLICT(id) DO UPDATE SET state='sending',updated_at=excluded.updated_at WHERE state='failed' OR (state='sending' AND updated_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour'))",
        )
        .bind(id, stamp())
        .run();
    if (!claimed.meta?.changes) continue;
    try {
      await chat(env, row, "provider", t.label + " · " + t.due);
      await db
        .prepare("UPDATE exchange_notices SET state='sent' WHERE id=?")
        .bind(id)
        .run();
      sent++;
    } catch (e) {
      await db
        .prepare("UPDATE exchange_notices SET state='failed' WHERE id=?")
        .bind(id)
        .run();
      throw e;
    }
  }
  return { sent };
}
export async function sync(env: Env, kind: string, test: boolean) {
  const row = await get(env.DB, kind);
  check(row?.enabled, 409, "config");
  const c = JSON.parse(row.config) as Config;
  if (kind === "entra") {
    const values = await graph(env, row);
    return test
      ? { test: true, summary: values }
      : observe(env, kind, crypto.randomUUID(), c, values);
  }
  if (kind === "chat") {
    if (!test) return notifyDue(env);
    await chat(
      env,
      row,
      "provider",
      "Fornost · Test bildirimi / Test notification",
    );
    return { test: true };
  }
  check(test, 422, "push-only");
  check(row.hook_hash, 409, "config");
  if (kind === "tickets") {
    const ticket = await env.DB.prepare(
      "SELECT provider,config_json,secret_ciphertext FROM integration_settings WHERE enabled=1 AND kind='ticketing' AND provider IN ('jira','jira-dc','servicenow')",
    ).first<{
      provider: string;
      config_json: string;
      secret_ciphertext: string | null;
    }>();
    check(ticket, 409, "config");
    await testTicketConnection(
      ticket.provider,
      JSON.parse(ticket.config_json),
      await decryptSecret(ticket.secret_ciphertext, key(env)),
      ["true", "1"].includes(String(env.FORNOST_ALLOW_PRIVATE_CONNECTORS)),
    );
    return { test: true };
  }
  check(kind === "cloud" && c.resources.length, 422, "mapping");
  for (const m of c.resources) {
    await observe(
      env,
      "cloud",
      "probe:" + crypto.randomUUID(),
      c,
      {
        provider: m.provider,
        resource: m.resource,
        category: "encryption",
        severity: "low",
      },
      true,
    );
  }
  return { test: true, mode: "cloud-probe" };
}

export async function scheduledExchange(env: Env, at: Date) {
  await init(env.DB);
  const scheduledIdentity = async () => {
    if (at.getUTCMinutes() !== 0) return;
    const row = await get(env.DB, "entra");
    if (!row?.enabled) return;
    const id = "hour:" + at.toISOString().slice(0, 13);
    if (
      await env.DB.prepare(
        "SELECT 1 FROM exchange_signals WHERE kind='entra' AND event_id=?",
      )
        .bind(id)
        .first()
    )
      return;
    await observe(
      env,
      "entra",
      id,
      JSON.parse(row.config),
      await graph(env, row),
    );
  };
  const results = await Promise.allSettled([
    notifyDue(env),
    scheduledIdentity(),
  ]);
  if (results.some((r) => r.status === "rejected"))
    throw new Error("exchange-sync");
}
