import { check, text } from "./store";
type Row = Record<string, unknown>;
const obj = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
function category(signal: string) {
  if (/encrypt|kms|customer.managed.key/i.test(signal)) return "encryption";
  if (
    /public.*(access|bucket|storage)|bucket.*public|storage.*public|S3\.([128])\b/i.test(
      signal,
    )
  )
    return "public-storage";
  if (
    /identity|permission|(^|[^a-z])iam|administrator|role.assignment/i.test(
      signal,
    )
  )
    return "iam";
  check(false, 422, "mapping");
}
function severity(v: unknown) {
  const level = text(v, 32).toLowerCase();
  if (["informational", "informative"].includes(level)) return "low";
  check(
    ["low", "medium", "high", "critical", "resolved"].includes(level),
    422,
    "mapping",
  );
  return level;
}
/** Resolve native resource identifiers through administrator-defined local mappings only. */
export function cloudEvents(b: Row): Row[] {
  if (b.provider && b.resource) return [b];
  if (b.source === "aws.securityhub") {
    const list = obj(b.detail).findings;
    check(Array.isArray(list) && list.length > 0 && list.length <= 20);
    return list.flatMap((raw) => {
      const f = obj(raw),
        resources = f.Resources;
      check(
        Array.isArray(resources) &&
          resources.length > 0 &&
          resources.length <= 10,
      );
      const label = [
        f.Title,
        obj(f.Compliance).SecurityControlId,
        f.GeneratorId,
      ].join(" ");
      return resources.map((r) => ({
        provider: "AWS",
        resource: text(obj(r).Id, 512),
        category: category(label),
        severity:
          obj(f.Workflow).Status === "RESOLVED"
            ? "resolved"
            : severity(obj(f.Severity).Label),
      }));
    });
  }
  if (b.finding) {
    const f = obj(b.finding);
    return [
      {
        provider: "GCP",
        resource: text(f.resourceName || obj(b.resource).name, 512),
        category: category(text(f.category, 200)),
        severity: f.state === "INACTIVE" ? "resolved" : severity(f.severity),
      },
    ];
  }
  const d = obj(b.data),
    props = obj(d.properties || b.properties),
    resources = props.resourceIdentifiers;
  if (b.eventType === "Microsoft.Security.AlertCreated" || props.alertType) {
    const r = Array.isArray(resources) ? obj(resources[0]) : {};
    return [
      {
        provider: "Azure",
        resource: text(r.azureResourceId || d.resourceId || b.subject, 512),
        category: category(
          text(props.alertDisplayName || props.alertType, 240),
        ),
        severity:
          props.status === "Resolved" ? "resolved" : severity(props.severity),
      },
    ];
  }
  check(false, 422, "mapping");
}
