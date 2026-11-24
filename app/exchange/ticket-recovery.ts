import { decryptSecret, safeHttpUrl } from "../api/integrations/security";
import { readBoundedBody } from "../api/request-body";
import { check, type Env } from "./store";

/** Recover an ambiguous POST only after the provider confirms the original Fornost correlation. */
export async function recoverTicket(
  env: Env,
  finding: string,
  reference: string,
) {
  check(/^[A-Z0-9][A-Z0-9-]{1,79}$/i.test(reference));
  const row = await env.DB.prepare(
    "SELECT s.provider,s.config_json,s.secret_ciphertext FROM exchange_tickets t JOIN integration_settings s ON s.provider=t.provider AND s.kind='ticketing' AND s.enabled=1 JOIN exchange_connectors c ON c.kind='tickets' AND c.enabled=1 WHERE t.finding_id=? AND t.state='sending'",
  )
    .bind(finding)
    .first<{
      provider: string;
      config_json: string;
      secret_ciphertext: string | null;
    }>();
  check(row, 409, "state");
  check(
    ["jira", "jira-dc", "servicenow"].includes(row.provider),
    409,
    "config",
  );
  const c = JSON.parse(row.config_json),
    base = safeHttpUrl(
      c.baseUrl,
      ["true", "1"].includes(String(env.FORNOST_ALLOW_PRIVATE_CONNECTORS)),
    )?.replace(/\/+$/, "");
  check(base, 409, "config");
  const secret = await decryptSecret(
      row.secret_ciphertext,
      String(env.FORNOST_SETTINGS_ENCRYPTION_KEY || ""),
    ),
    auth =
      row.provider === "jira-dc"
        ? "Bearer " + secret
        : "Basic " + btoa(String(c.username) + ":" + secret),
    sn = row.provider === "servicenow";
  const endpoint = sn
    ? "/api/now/table/" +
      encodeURIComponent(c.table || "incident") +
      "?sysparm_query=" +
      encodeURIComponent("number=" + reference) +
      "&sysparm_limit=1&sysparm_fields=number,sys_id,description"
    : "/rest/api/" +
      (row.provider === "jira" ? "3" : "2") +
      "/issue/" +
      encodeURIComponent(reference) +
      "?fields=description";
  const result = await fetch(base + endpoint, {
    headers: { authorization: auth, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  check(result.ok, 409, "reconcile");
  const payload = JSON.parse(
    new TextDecoder().decode(await readBoundedBody(result, 240000)),
  );
  const item = sn ? payload.result?.[0] : payload,
    description = sn ? item?.description : item?.fields?.description;
  const marker = "Fornost: " + finding;
  function matches(v: unknown): boolean {
    if (typeof v === "string")
      return v.split(/\r?\n/).some((line) => line.trim() === marker);
    if (!v || typeof v !== "object") return false;
    const node = v as { text?: string; content?: unknown[] };
    return !!(
      (node.text && matches(node.text)) ||
      (Array.isArray(node.content) && node.content.some(matches))
    );
  }
  check(
    item && (sn ? item.number : item.key) === reference && matches(description),
    409,
    "reconcile",
  );
  const url = sn
    ? base +
      "/nav_to.do?uri=" +
      encodeURIComponent((c.table || "incident") + ".do?sys_id=" + item.sys_id)
    : base + "/browse/" + encodeURIComponent(reference);
  const out = await env.DB.prepare(
    "UPDATE exchange_tickets SET ticket=?,url=?,state='linked' WHERE finding_id=? AND state='sending'",
  )
    .bind(reference, url, finding)
    .run();
  check(out.meta?.changes, 409, "state");
  return { ticket: reference, url };
}
