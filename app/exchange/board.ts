import { check, hash, stamp, text } from "./store";
import { ensurePosture, programOverview } from "../framework-posture/store";
import { riskMatrixEntries } from "../executive-report-data";
import { exposure, money } from "../enterprise/fair";
import { sections, boardLabels, type Board } from "./board-model";
export async function createBoard(
  db: D1Database,
  b: Record<string, unknown>,
  actor: string,
) {
  check(
    Array.isArray(b.sections) &&
      b.sections.length > 0 &&
      b.sections.every((x) => sections.includes(x)) &&
      (b.lang === "tr" || b.lang === "en"),
  );
  const tr = b.lang === "tr",
    l = (t: string, e: string) => (tr ? t : e),
    at = stamp(),
    out: Board = {
      title:
        text(b.title, 140) ||
        l("Yönetim Kurulu Özeti", "Board executive summary"),
      at,
      lang: b.lang,
      preparedBy: actor,
      sections: [],
    };
  for (const k of sections) {
    if (!b.sections.includes(k)) continue;
    const rows: [string, string][] = [];
    if (k === "risk") {
      const risk = (
          await db
            .prepare(
              "SELECT id,module,data_json FROM simple_grc_records WHERE module='Risk Assessment'",
            )
            .all<{ id: string; module: string; data_json: string }>()
        ).results.map((r) => ({ ...r, data: JSON.parse(r.data_json) })),
        scores = riskMatrixEntries(risk),
        e = exposure(risk);
      rows.push(
        [
          l("Ortalama doğal risk (1–25)", "Mean inherent risk (1–25)"),
          scores.length
            ? new Intl.NumberFormat(tr ? "tr" : "en", {
                maximumFractionDigits: 1,
              }).format(scores.reduce((n, r) => n + r.score, 0) / scores.length)
            : "—",
        ],
        [
          l("Skorlanan riskler", "Scored risks"),
          scores.length + " / " + risk.length,
        ],
        [
          l("FAIR-Lite tahmini olan riskler", "Risks with FAIR-Lite estimates"),
          e.measured + " / " + e.total,
        ],
      );
      for (const [currency, amount] of e.totals)
        rows.push([
          l("Yıllık beklenen kayıp", "Annual loss expectancy") +
            " · " +
            currency,
          money(amount, currency, tr),
        ]);
    }
    if (k === "framework") {
      await ensurePosture(db);
      const v = await programOverview(db);
      for (const name of v.enrolled) {
        const c = v.coverage[name];
        rows.push([
          name,
          c.scope
            ? Math.round((c.compliant / c.scope) * 100) +
              "% · " +
              c.compliant +
              " / " +
              c.scope
            : "—",
        ]);
      }
      if (!rows.length)
        rows.push([l("İzlenen çerçeve", "Enrolled frameworks"), "0"]);
    }
    if (k === "supplier") {
      const r = await db
        .prepare(
          "SELECT count(*) total,count(CASE WHEN criticality='critical' THEN 1 END) critical FROM third_party_profiles WHERE status NOT IN ('offboarded','rejected','cancelled')",
        )
        .first<{ total: number; critical: number }>();
      check(r, 503);
      rows.push(
        [
          l("Kritik / aktif tedarikçi", "Critical / active suppliers"),
          r.critical + " / " + r.total,
        ],
        [
          l("Kritik payı", "Critical share"),
          r.total ? Math.round((100 * r.critical) / r.total) + "%" : "—",
        ],
      );
    }
    if (k === "capa") {
      const r = await db
        .prepare(
          "SELECT count(*) total,count(CASE WHEN due_date<date('now') THEN 1 END) overdue FROM enterprise_findings WHERE severity='critical' AND status NOT IN ('closed','accepted','cancelled')",
        )
        .first<{ total: number; overdue: number }>();
      check(r, 503);
      rows.push(
        [l("Açık kritik bulgu", "Open critical findings"), String(r.total)],
        [l("Termini geçen", "Past due"), String(r.overdue)],
      );
    }
    if (k === "incident") {
      const r = await db
        .prepare(
          "SELECT count(*) total,count(CASE WHEN severity IN ('high','critical') THEN 1 END) severe,count(CASE WHEN personal_data=1 AND notification_decision='pending' THEN 1 END) pending FROM enterprise_incidents WHERE status NOT IN ('closed','cancelled')",
        )
        .first<{ total: number; severe: number; pending: number }>();
      check(r, 503);
      rows.push(
        [l("Aktif olay", "Active incidents"), String(r.total)],
        [l("Kritik / yüksek", "Critical / high"), String(r.severe)],
        [
          l("Bildirim kararı bekleyen", "Pending notification decision"),
          String(r.pending),
        ],
      );
    }
    out.sections.push({ title: boardLabels[k][tr ? 0 : 1], rows });
  }
  const id = crypto.randomUUID(),
    snapshot = JSON.stringify(out);
  await db
    .prepare("INSERT INTO board_packages VALUES(?,?,?,?,?)")
    .bind(id, snapshot, await hash(snapshot), actor, at)
    .run();
  return { id };
}
export async function readBoard(db: D1Database, id: string) {
  const r = await db
    .prepare("SELECT snapshot,digest FROM board_packages WHERE id=?")
    .bind(id)
    .first<{ snapshot: string; digest: string }>();
  check(r, 404);
  check((await hash(r.snapshot)) === r.digest, 409, "integrity");
  return JSON.parse(r.snapshot) as Board;
}
