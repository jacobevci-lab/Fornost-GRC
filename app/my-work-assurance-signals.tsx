"use client";
import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import { controlAssuranceReasonLabels, controlAssuranceRecordTarget, type ControlAssuranceSnapshot } from "./control-assurance-state";
import { buildWorkAssuranceActions, validWorkAssuranceSnapshot, type WorkIdentity } from "./my-work-assurance";
import { dashboardCode } from "./dashboard-actions";
import { workCopy } from "./work-roles";
import { validAssuranceQueue } from "./assurance-queue-access";
import { assuranceWorkSlaState, type AssuranceQueueItem } from "./assurance-work-queue-metrics";
import { assuranceWorkNavigation } from "./assurance-work-focus";
import { matchesWorkIdentity, paginateWork } from "./work-queue";
import "./my-work-assurance-signals.css";

type SlaItem = AssuranceQueueItem & { id:string; owner:string; findingTitle:string };
type Urgency = { id:string; title:string; code:string; reason:string; open:()=>void };
const urgentReasons = new Set(["test-failed","automation-failing","evidence-integrity-broken","acceptance-expired"]);

export default function MyWorkAssuranceSignals({ lang, scope, user, urgencies }: {
  lang:"tr"|"en"; scope:"mine"|"organization"; user:WorkIdentity; urgencies:Urgency[];
}) {
  const tr = lang === "tr", locale = tr ? 0 : 1;
  const [snapshot, setSnapshot] = useState<ControlAssuranceSnapshot | null>(null);
  const [breaches, setBreaches] = useState<SlaItem[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    async function readSla() {
      const params = new URLSearchParams({filter:"attention"});
      const seen = new Set<string>();
      const items:SlaItem[] = [];
      let at = "";
      do {
        const response = await fetch(withBasePath(`/api/continuous-assurance?${params}`), {cache:"no-store",signal:controller.signal});
        if (!response.ok) return;
        const body = await response.json();
        if (!body || !validAssuranceQueue(body) || body.filter !== "attention" || body.context === "work-only" || (at && at !== body.assessmentAt)) return;
        at = body.assessmentAt;
        items.push(...(body.items as SlaItem[]).filter(item => assuranceWorkSlaState(item,new Date(at)) === "breached"));
        if (!body.nextCursor) break;
        if (seen.has(body.nextCursor)) return;
        seen.add(body.nextCursor);
        params.set("cursor",body.nextCursor);
        params.set("at",at);
      } while (!controller.signal.aborted);
      if (!controller.signal.aborted) setBreaches(items);
    }
    async function read() {
      try {
        const response = await fetch(withBasePath("/api/controls/assurance"), {cache:"no-store",signal:controller.signal});
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (!controller.signal.aborted && validWorkAssuranceSnapshot(body) && body.verified) setSnapshot(body);
      } catch { /* Unverified sources cannot establish an urgent action. */ }

    }
    void Promise.allSettled([read(),readSla()]).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);
  const actions = useMemo(() => {
    if (!snapshot) return [];
    return buildWorkAssuranceActions(snapshot, user, scope).flatMap(action => {
      const target = controlAssuranceRecordTarget(action.row);
      if (!action.critical || !target) return [];
      const reasons = action.reasons.filter(reason => urgentReasons.has(reason)).map(reason =>
        reason === "acceptance-expired" ? (tr ? "Risk kabul süresi doldu" : "Risk acceptance expired") : controlAssuranceReasonLabels[reason][lang]);
      if (action.group === "finding" && String(action.row.data.severity).toLowerCase() === "critical")
        reasons.push(tr ? "Kritik bulgu açık" : "Critical finding is open");
      if (!reasons.length) return [];
      const d = action.row.data, code = dashboardCode(action.row);
      return [{ id:action.row.id, code, title:String(d.controlTitle || d.evidenceTitle || d.title || code), reason:reasons.join(" · "),
        open:() => navigateToFornost({...target,source:"my-work-assurance"}) }];
    });
  }, [snapshot, user, scope, lang, tr]);
  const sla = breaches.flatMap(item => {
    if (!(scope === "organization" && user.role === "Admin") && !matchesWorkIdentity([item.owner],user)) return [];
    const target = assuranceWorkNavigation({kind:"work-item", id:`work:${item.id}`});
    return target ? [{id:`sla:${item.id}`, title:item.findingTitle, code:"", reason:workCopy.sla[locale], open:() => navigateToFornost(target)}] : [];
  });
  if (!urgencies.length && !actions.length && !sla.length) return null;
  const page = paginateWork([...urgencies, ...sla, ...actions], pageIndex, 8);
  return <section className="mw-assurance-signals" aria-label={workCopy.urgent[locale]}>
    <header><b>{workCopy.urgent[locale]}</b></header>
    <div className="mw-assurance-records">{page.items.map(action => <article key={action.id}>
      <div><b>{action.title}</b>{action.code && <small>{action.code}</small>}<p>{action.reason}</p></div>
      <button type="button" aria-label={`${workCopy.review[locale]} ${action.title}`} onClick={action.open}>{workCopy.review[locale]}</button>
    </article>)}</div>
    {page.pages > 1 && <nav className="mw-assurance-pagination"><button disabled={!page.page} onClick={() => setPageIndex(page.page-1)}>{tr ? "Önceki" : "Previous"}</button><span>{page.start}–{page.end} / {page.total}</span><button disabled={page.page+1 >= page.pages} onClick={() => setPageIndex(page.page+1)}>{tr ? "Sonraki" : "Next"}</button></nav>}
  </section>;
}
