// One logical connector per kind. Ticket transport remains canonical in integration_settings;
// incoming webhook/mapping configuration remains canonical in exchange_connectors.
export const connectorNames:Record<string,[string,string]>={entra:['Microsoft Entra ID','Microsoft Entra ID'],cloud:['Bulut güvenlik duruşu','Cloud security posture'],tickets:['Jira / ServiceNow','Jira / ServiceNow'],chat:['Slack / Microsoft Teams','Slack / Microsoft Teams']};
export type ConnectorRow={kind:string;enabled?:number;updated_at?:string;updated_by?:string;transport?:{provider:string;enabled:number;updated_at:string;updated_by:string}|null};
export type ConnectorEvent={id:string;kind:string;action:string;status:string;detail:string;actor:string;created_at:string};
export type ConnectorRegister={cards:ConnectorRow[];history:ConnectorEvent[]};
export function mergeConnectorRegister(rows:ConnectorRow[],transport:ConnectorRow['transport']){
 return Object.keys(connectorNames).map(kind=>({...rows.find(row=>row.kind===kind),kind,...(kind==='tickets'?{transport}: {})}));
}
