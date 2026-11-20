import { installationAccess } from "./licensing/store";
import {syncWorkpaperNotifications} from './audit-workpaper-notifications';
import {syncMilestoneNotifications} from './audit-milestone-notifications';
import {syncAuditRequestNotifications} from "./audit-request-notifications";
import {enrichAssuranceEscalationOwners,syncAssuranceNotificationOutbox,type AssuranceEscalationRecord} from "./assurance-executive-operations";
import {readAssuranceEscalationRows} from "./assurance-escalation-store";
import {readAssuranceReminderConfig,reconcileAssuranceEscalations} from "./assurance-escalation-runtime";
import {dispatchAssuranceNotifications} from "./assurance-notification-dispatch";

export async function runScheduledAssuranceOperations(db:D1Database,env:Record<string,unknown>,now=new Date()){
 const license = await installationAccess(db);
 if (license && license.active !== "Enterprise") {
   if (license.active === "Professional") {
     await syncAuditRequestNotifications(db,now);
     await syncMilestoneNotifications(db,now);
     await syncWorkpaperNotifications(db,now);
     await dispatchAssuranceNotifications(db,env,{actor:"system:scheduled-dispatch",trigger:"scheduled",limit:50,now,auditOnly:true});
   }
   return {ok:true, skippedAssurance:true};
 }
 const first=await reconcileAssuranceEscalations(db,now),settings=await readAssuranceReminderConfig(db),initialRows=await readAssuranceEscalationRows(db,5000),enriched=await enrichAssuranceEscalationOwners(db,initialRows as AssuranceEscalationRecord[]);
 await syncAssuranceNotificationOutbox(db,enriched,settings.remindersEnabled,now);
 await syncAuditRequestNotifications(db,now);
 await syncMilestoneNotifications(db,now);
 await syncWorkpaperNotifications(db,now);
 const dispatch=await dispatchAssuranceNotifications(db,env,{actor:"system:scheduled-dispatch",trigger:"scheduled",limit:50,now});
 const second=await reconcileAssuranceEscalations(db,new Date()),finalRows=await readAssuranceEscalationRows(db,5000),finalEnriched=await enrichAssuranceEscalationOwners(db,finalRows as AssuranceEscalationRecord[]);
 await syncAssuranceNotificationOutbox(db,finalEnriched,settings.remindersEnabled,new Date());
 return{ok:true,reconciled:first,postDispatchReconciled:second,dispatch,escalations:finalEnriched.filter(row=>row.status!=="resolved").length};
}
